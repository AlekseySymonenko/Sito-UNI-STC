// Lato "server": la vera funzione B2 + archivi S3 e database simulati. Risponde in modo sincrono al main via Atomics.
import { parentPort, workerData } from 'node:worker_threads';
Object.assign(process.env, {
  SUPABASE_URL: 'https://bbyaljjyjfhufesjxycf.supabase.co', SUPABASE_ANON_KEY: 'anon',
  B2_KEY_ID: 'k', B2_APP_KEY: 's', B2_BUCKET: 'appunti', B2_ENDPOINT: 's3.eu-central-003.backblazeb2.com',
  R2_ACCOUNT_ID: 'acc', R2_KEY_ID: 'rk', R2_APP_KEY: 'rs', R2_BUCKET: 'registrazioni',
});
const { handler } = await import(workerData.fn);
const TOKEN = workerData.token;
const objects = new Map(); const uploads = new Map(); const db = []; let r2Quota = workerData.r2Quota; let n = 0;
let driveFiles = {};
const used = (st) => db.filter((r) => r.store === st).reduce((a, r) => a + r.size, 0);
const resp = (status, body = '', headers = {}) => ({ status, headers, body: Buffer.from(body) });
function s3(method, url, body) {
  const key = url.host + url.pathname;
  if (!url.searchParams.get('X-Amz-Signature')) return resp(403, 'unsigned');
  if (method === 'POST' && url.searchParams.has('uploads')) { const id = 'U' + (++n); uploads.set(id, { key, parts: new Map() }); return resp(200, `<X><UploadId>${id}</UploadId></X>`); }
  if (method === 'PUT' && url.searchParams.has('partNumber')) {
    const u = uploads.get(url.searchParams.get('uploadId')); if (!u || u.key !== key) return resp(404, 'NoSuchUpload');
    const etag = '"e' + url.searchParams.get('partNumber') + '-' + body.length + '"'; u.parts.set(Number(url.searchParams.get('partNumber')), { body, etag });
    return resp(200, '', { ETag: etag });
  }
  if (method === 'POST' && url.searchParams.has('uploadId')) {
    const u = uploads.get(url.searchParams.get('uploadId')); const xml = body.toString();
    const nums = [...xml.matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>([^<]*)<\/ETag>/g)];
    for (const [, num, et] of nums) if (!u.parts.get(Number(num)) || u.parts.get(Number(num)).etag !== et) return resp(200, '<Error><Message>bad etag</Message></Error>');
    const sizes = nums.map(([, num]) => u.parts.get(Number(num)).body.length);
    if (sizes.slice(0, -1).some((s) => s !== sizes[0])) return resp(400, '<Error><Message>R2: parti di dimensione diversa</Message></Error>');
    objects.set(key, Buffer.concat(nums.map(([, num]) => u.parts.get(Number(num)).body))); uploads.delete(url.searchParams.get('uploadId'));
    return resp(200, '<CompleteMultipartUploadResult/>');
  }
  if (method === 'DELETE' && url.searchParams.has('uploadId')) { uploads.delete(url.searchParams.get('uploadId')); return resp(204); }
  if (method === 'PUT') { objects.set(key, body); return resp(200, '', { ETag: '"x"' }); }
  if (method === 'HEAD') { const o = objects.get(key); return o ? resp(200, '', { 'content-length': String(o.length), 'x-amz-version-id': url.host.startsWith('s3.') ? 'v' + o.length : '' }) : resp(404); }
  if (method === 'DELETE') { objects.delete(key); return resp(204); }
  return resp(500, 'S3 ?');
}
function supabase(method, url, body) {
  const j = (d, s = 200) => resp(s, JSON.stringify(d), { 'content-type': 'application/json' });
  const a = body.length ? JSON.parse(body.toString()) : {};
  const ok = a.token === TOKEN;
  switch (url.pathname) {
    case '/rest/v1/rpc/service_ping': return j(ok);
    case '/rest/v1/rpc/import_prepare':
      if (!ok) return j({ message: 'Codice di servizio non valido' }, 400);
      if (db.some((r) => r.drive_id === a.p_drive_id)) return j('exists');
      if (used(a.p_store) + a.p_size > (a.p_store === 'r2' ? r2Quota : 1e12)) return j('full');
      return j('ok');
    case '/rest/v1/rpc/import_register': {
      if (!ok) return j({ message: 'no' }, 400);
      const ex = db.find((r) => r.drive_id === a.p.drive_id); if (ex) return j(ex.id);
      db.push({ id: db.length + 1, ...a.p }); return j(db.length);
    }
  }
  return j({ message: 'rpc ?' + url.pathname }, 404);
}
function drive(url, headers) {
  if (!/^Bearer tok/.test(headers.Authorization || '')) return resp(401);
  const m = /\/files\/([^/]+)(\/export)?/.exec(url.pathname); const f = driveFiles[m[1]];
  if (f === undefined) return resp(404);
  let buf = m[2] ? Buffer.from('%PDF esportato ' + m[1]) : Buffer.from(f, 'base64');
  const range = /bytes=(\d+)-(\d+)/.exec(headers.Range || '');
  if (range) return resp(206, buf.subarray(Number(range[1]), Number(range[2]) + 1));
  return resp(200, buf);
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)); const method = (init.method || 'GET').toUpperCase();
  const body = init.body ? Buffer.from(typeof init.body === 'string' ? init.body : init.body) : Buffer.alloc(0);
  const r = url.host.endsWith('supabase.co') ? supabase(method, url, body) : s3(method, url, body);
  return new Response(method === 'HEAD' || r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
};
async function serve(req) {
  const url = new URL(req.url); const body = Buffer.from(req.body || '', 'base64');
  if (url.host === 'www.googleapis.com') return drive(url, req.headers);
  if (url.pathname.startsWith('/functions/v1/')) {
    const res = await handler(new Request(req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body }));
    return resp(res.status, await res.text(), Object.fromEntries(res.headers));
  }
  return s3(req.method, url, body);
}
parentPort.on('message', async ({ sab, req }) => {
  let out;
  try {
    if (req.cmd === 'drive') { driveFiles = req.files; out = resp(200); }
    else if (req.cmd === 'robot') { db.filter((r) => r.store === 'r2').forEach((r) => { r.size = Math.min(r.size, 1000); }); out = resp(200); }
    else if (req.cmd === 'state') { out = resp(200, JSON.stringify({ db, objects: [...objects].map(([k, v]) => [k, v.length, v.subarray(0, 4).toString('hex'), v.subarray(-4).toString('hex')]), uploads: uploads.size })); }
    else out = await serve(req);
  } catch (e) { out = resp(599, String(e.stack || e)); }
  const enc = JSON.stringify({ status: out.status, headers: out.headers, body: out.body.toString('base64') });
  const bytes = Buffer.from(enc);
  const view = new Int32Array(sab, 0, 2); const data = new Uint8Array(sab, 8);
  data.set(bytes); view[1] = bytes.length; Atomics.store(view, 0, 1); Atomics.notify(view, 0);
});
