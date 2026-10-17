// Archivio Cloudflare R2 per le registrazioni e azioni di importazione dal vecchio Drive.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert';

Object.assign(process.env, {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  B2_KEY_ID: 'keyid', B2_APP_KEY: 'secret', B2_BUCKET: 'appunti',
  B2_ENDPOINT: 's3.eu-central-003.backblazeb2.com',
  R2_ACCOUNT_ID: 'acc123', R2_KEY_ID: 'r2key', R2_APP_KEY: 'r2secret', R2_BUCKET: 'registrazioni',
});
const { handler } = await import('../index.ts');

const TOKEN = 'a'.repeat(64);
let calls: string[] = [];
let bodies: Record<string, unknown>[] = [];
let prepare = 'ok';
let r2Used = 0;
const FILE = { id: 5, storage: 'r2', storage_path: 'u-stud/x.m4a', storage_version: null, original_name: 'Lezione.m4a', kind: 'audio' };

beforeEach(() => { calls = []; bodies = []; prepare = 'ok'; r2Used = 0; });

globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const method = (init.method || 'GET').toUpperCase();
  const auth = new Headers(init.headers).get('Authorization') || '';
  const q = [...url.searchParams.keys()].filter((k) => !k.startsWith('X-Amz')).join(',');
  calls.push(`${method} ${url.host}${url.pathname}${q ? '?' + q : ''}`);
  const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.host === 'proj.supabase.co') {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.startsWith('/rest/v1/rpc/')) bodies.push({ rpc: url.pathname.slice(13), ...body });
    if (url.pathname === '/auth/v1/user') return auth === 'Bearer student' ? json({ id: 'u-stud', email: 'n.cognome@campus.unimib.it' }) : json({}, 401);
    if (url.pathname === '/rest/v1/profiles') return json([{ id: 'u-stud', role: 'student' }]);
    if (url.pathname === '/rest/v1/rpc/service_ping') return json(body.token === TOKEN);
    if (url.pathname === '/rest/v1/rpc/import_prepare') return json(prepare);
    if (url.pathname === '/rest/v1/rpc/import_register') return json(77);
    if (url.pathname === '/rest/v1/rpc/b2_used_bytes') return json(0);
    if (url.pathname === '/rest/v1/rpc/b2_quota_bytes') return json(1024 ** 3);
    if (url.pathname === '/rest/v1/rpc/storage_usage') return json({ used: r2Used, quota: 1024 ** 3 });
    if (url.pathname === '/rest/v1/rpc/storage_make_room') return json([{ path: 'u-x/vecchia.m4a', version: null, file_title: 'Vecchia lezione' }]);
    if (url.pathname === '/rest/v1/files' && method === 'GET') return json([FILE]);
    if (url.pathname === '/rest/v1/files' && method === 'POST') { bodies.push(body); return json([{ id: 9 }], 201); }
  }
  if (url.host === 'acc123.r2.cloudflarestorage.com') {
    if (method === 'POST' && url.searchParams.has('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>UP1</UploadId></InitiateMultipartUploadResult>');
    if (method === 'POST' && url.searchParams.has('uploadId')) { calls.push('XML ' + init.body); return new Response('<CompleteMultipartUploadResult></CompleteMultipartUploadResult>'); }
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '70000000' } });
    if (method === 'DELETE') return new Response(null, { status: 204 });
  }
  if (url.host === 's3.eu-central-003.backblazeb2.com' && method === 'HEAD') {
    return new Response(null, { status: 200, headers: { 'content-length': '1000', 'x-amz-version-id': 'v1' } });
  }
  return json({ error: 'unexpected ' + url }, 500);
}) as typeof fetch;

async function call(token: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await handler(new Request('https://proj.supabase.co/functions/v1/B2', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
}

test('registrazioni su Cloudflare, documenti su Backblaze', async () => {
  const audio = await call('student', { action: 'upload', name: 'Lezione 3.m4a', size: 5000 });
  assert.strictEqual(audio.data.store, 'r2');
  assert.match(audio.data.url, /^https:\/\/acc123\.r2\.cloudflarestorage\.com\/registrazioni\/u-stud\/.+X-Amz-Credential=r2key%2F\d{8}%2Fauto%2Fs3/);
  assert.ok(!calls.some((c) => c.includes('b2_authorize_account')), 'nessuna configurazione B2 per R2');
  const pdf = await call('student', { action: 'upload', name: 'Appunti.pdf', size: 5000 });
  assert.strictEqual(pdf.data.store, 'b2');
});

test('confirm su Cloudflare registra storage r2; uno studente non può forzare R2 per un PDF', async () => {
  await call('student', { action: 'confirm', key: 'u-stud/abc.m4a', name: 'Lezione.m4a', courseId: 1, store: 'r2' });
  assert.strictEqual((bodies.find((b) => b.storage) as { storage: string }).storage, 'r2');
  bodies = [];
  await call('student', { action: 'confirm', key: 'u-stud/abc.pdf', name: 'A.pdf', courseId: 1, store: 'r2' });
  assert.strictEqual((bodies.find((b) => b.storage) as { storage: string }).storage, 'b2');
});

test('Cloudflare pieno: libera spazio solo tra le registrazioni', async () => {
  r2Used = 1024 ** 3;
  const r = await call('student', { action: 'upload', name: 'Nuova.mp3', size: 100 });
  assert.deepStrictEqual(r.data.evicted, ['Vecchia lezione']);
  assert.ok(bodies.some((b) => b.rpc === 'storage_make_room' && b.st === 'r2'));
  assert.ok(calls.includes('DELETE acc123.r2.cloudflarestorage.com/registrazioni/u-x/vecchia.m4a'));
});

test('link per ascoltare una registrazione firmato per Cloudflare', async () => {
  const r = await call('student', { action: 'url', id: 5 });
  assert.match(r.data.url, /^https:\/\/acc123\.r2\.cloudflarestorage\.com\/registrazioni\/u-stud\/x\.m4a\?/);
});

test('spazio di entrambi gli archivi', async () => {
  r2Used = 123;
  const r = await call('student', { action: 'usage' });
  assert.strictEqual(r.data.r2.used, 123);
  assert.strictEqual(r.data.b2.quota, 1024 ** 3);
});

test('importazione: senza codice valido niente', async () => {
  assert.strictEqual((await call(null, { action: 'import-begin', token: 'x', name: 'a.pdf', size: 1 })).status, 403);
  assert.ok(!calls.some((c) => c.includes('import_prepare')));
});

test('importazione: file piccolo con un solo link, archivio scelto per tipo', async () => {
  const pdf = await call(null, { action: 'import-begin', token: TOKEN, driveId: 'd1', name: 'Appunti.pdf', size: 1000 });
  assert.strictEqual(pdf.data.store, 'b2');
  assert.match(pdf.data.key, /^import\/[0-9a-f-]{36}\.pdf$/);
  assert.match(pdf.data.url, /^https:\/\/s3\.eu-central-003\.backblazeb2\.com\/appunti\/import\//);
  const zipSmall = await call(null, { action: 'import-begin', token: TOKEN, driveId: 'd2', name: 'Test.zip', size: 1000 });
  assert.strictEqual(zipSmall.data.store, 'b2');
  const unsupported = await call(null, { action: 'import-begin', token: TOKEN, driveId: 'd3', name: 'pagina.html', size: 10 });
  assert.strictEqual(unsupported.data.status, 'unsupported');
  prepare = 'full';
  const full = await call(null, { action: 'import-begin', token: TOKEN, driveId: 'd4', name: 'L.m4a', size: 10 });
  assert.deepStrictEqual(full.data, { status: 'full', store: 'r2' });
});

test('importazione: registrazione grande a parti su Cloudflare, poi registrata', async () => {
  const begin = await call(null, { action: 'import-begin', token: TOKEN, driveId: 'big', name: 'Registrazioni.zip', size: 150000000 });
  assert.strictEqual(begin.data.store, 'r2');
  assert.strictEqual(begin.data.uploadId, 'UP1');
  assert.strictEqual(begin.data.partSize, 32 * 1024 * 1024);
  const part = await call(null, { action: 'import-part', token: TOKEN, store: 'r2', key: begin.data.key, uploadId: 'UP1', part: 2 });
  const pu = new URL(part.data.url);
  assert.strictEqual(pu.searchParams.get('partNumber'), '2');
  assert.strictEqual(pu.searchParams.get('uploadId'), 'UP1');
  assert.strictEqual((await call(null, { action: 'import-part', token: TOKEN, store: 'r2', key: 'u-stud/x.m4a', uploadId: 'UP1', part: 1 })).status, 400, 'solo percorsi di importazione');
  const fin = await call(null, {
    action: 'import-finish', token: TOKEN, store: 'r2', key: begin.data.key, uploadId: 'UP1',
    parts: [{ n: 1, etag: '"e1"' }, { n: 2, etag: '"e2"' }, { n: 3, etag: '"e3"' }],
    driveId: 'big', name: 'Registrazioni.zip', owner: 'n.cognome@campus.unimib.it', course: 'Chemiometria',
    degree: 'magistrale', studyYear: 1, aa: '2024/2025', created: '2025-01-10T09:00:00Z',
  });
  assert.strictEqual(fin.data.id, 77);
  assert.ok(calls.some((c) => c.startsWith('XML <CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"e1"</ETag></Part>')));
  const reg = bodies.find((b) => b.rpc === 'import_register') as { p: Record<string, unknown> };
  assert.strictEqual(reg.p.size, 70000000);
  assert.strictEqual(reg.p.store, 'r2');
  assert.strictEqual(reg.p.needs_processing, true);
  assert.strictEqual(reg.p.kind, 'other');
  assert.strictEqual(reg.p.drive_id, 'big');
});
