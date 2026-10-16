// Test delle azioni della funzione con Supabase e Backblaze simulati.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert';

Object.assign(process.env, {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  B2_KEY_ID: 'keyid', B2_APP_KEY: 'secret', B2_BUCKET: 'appunti',
  B2_ENDPOINT: 's3.eu-central-003.backblazeb2.com',
});
const { handler } = await import('../index.ts');

const USERS: Record<string, { id: string; email: string; role: string }> = {
  student: { id: 'u-stud', email: 'n.cognome@campus.unimib.it', role: 'student' },
  admin: { id: 'u-adm', email: 'a.admin@campus.unimib.it', role: 'admin' },
  gmail: { id: 'u-gm', email: 'x@gmail.com', role: 'student' },
};
let calls: string[] = [];
let used = 0;
let headSize = 1000;
let corsRules: unknown[] = [];
let makeRoom: 'ok' | 'fail' = 'ok';
const FILE = { id: 9, storage: 'b2', storage_path: 'u-stud/abc.pdf', original_name: 'Lezione è 1.pdf', kind: 'pdf' };

beforeEach(() => { calls = []; used = 0; headSize = 1000; makeRoom = 'ok'; });

globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const method = (init.method || 'GET').toUpperCase();
  const auth = new Headers(init.headers).get('Authorization') || '';
  calls.push(`${method} ${url.host}${url.pathname}${url.searchParams.get('versionId') ? ' v=' + url.searchParams.get('versionId') : ''}`);
  const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  const who = USERS[auth.replace('Bearer ', '')];
  if (url.host === 'proj.supabase.co') {
    if (url.pathname === '/auth/v1/user') return who ? json({ id: who.id, email: who.email }) : json({ msg: 'bad jwt' }, 401);
    if (url.pathname === '/rest/v1/profiles') return json(who ? [{ id: who.id, role: who.role }] : []);
    if (url.pathname === '/rest/v1/rpc/b2_used_bytes') return json(used);
    if (url.pathname === '/rest/v1/rpc/b2_quota_bytes') return json(1024 ** 3);
    if (url.pathname === '/rest/v1/rpc/record_file_open') return json(null);
    if (url.pathname === '/rest/v1/rpc/b2_make_room') {
      calls.push('MAKE_ROOM ' + init.body);
      if (makeRoom === 'fail') return json({ message: 'Spazio dell\'archivio esaurito: non ci sono abbastanza file vecchi o poco usati da eliminare.' }, 400);
      used = 0;
      return json([{ file_id: 3, path: 'u-x/old.pdf', version: 'ver-old', bytes: 500, file_title: 'Vecchia dispensa' }]);
    }
    if (url.pathname === '/rest/v1/files' && method === 'GET') return json(url.searchParams.get('id') === 'eq.9' ? [FILE] : [FILE]);
    if (url.pathname === '/rest/v1/files' && method === 'POST') { calls.push('BODY ' + init.body); return json([{ id: 42 }], 201); }
    if (url.pathname === '/rest/v1/files' && method === 'DELETE') return new Response(null, { status: 204 });
  }
  if (url.host === 'api.backblazeb2.com') return json({ accountId: 'acc', authorizationToken: 'tok', apiInfo: { storageApi: { apiUrl: 'https://api003.backblazeb2.com' } } });
  if (url.pathname.endsWith('/b2_list_buckets')) return json({ buckets: [{ bucketId: 'bid', corsRules }] });
  if (url.pathname.endsWith('/b2_update_bucket')) { corsRules = JSON.parse(String(init.body)).corsRules; return json({}); }
  if (url.host === 's3.eu-central-003.backblazeb2.com') {
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(headSize), 'x-amz-version-id': 'ver-new' } });
    if (method === 'DELETE') return new Response(null, { status: 204 });
  }
  return json({ error: 'unexpected ' + url }, 500);
}) as typeof fetch;

async function call(token: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: 'https://alekseysymonenko.github.io' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await handler(new Request('https://proj.supabase.co/functions/v1/b2', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
}

test('senza login o con Gmail personale: rifiutato', async () => {
  assert.strictEqual((await call(null, { action: 'usage' })).status, 401);
  assert.strictEqual((await call('gmail', { action: 'usage' })).status, 403);
});

test('upload: formato non ammesso, troppo grande', async () => {
  assert.strictEqual((await call('student', { action: 'upload', name: 'x.html', size: 10 })).status, 400);
  assert.strictEqual((await call('student', { action: 'upload', name: 'x.pdf', size: 600 * 1024 * 1024 })).status, 400);
  assert.ok(!calls.some((c) => c.startsWith('MAKE_ROOM')), 'nessuna pulizia se c\'è spazio o il file è rifiutato');
});

test('spazio pieno: elimina i file meno usati e li cancella subito da B2', async () => {
  used = 1024 ** 3 - 10;
  const r = await call('student', { action: 'upload', name: 'x.pdf', size: 100 });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.evicted, ['Vecchia dispensa']);
  assert.ok(calls.includes('MAKE_ROOM {"needed":100}'));
  assert.ok(calls.some((c) => c === 'DELETE s3.eu-central-003.backblazeb2.com/appunti/u-x/old.pdf v=ver-old'), 'cancellazione definitiva con versionId');
});

test('spazio pieno e niente da eliminare: caricamento rifiutato', async () => {
  used = 1024 ** 3 - 10;
  makeRoom = 'fail';
  const r = await call('student', { action: 'upload', name: 'x.pdf', size: 100 });
  assert.strictEqual(r.status, 507);
  assert.match(r.data.error, /esaurito/);
});

test('upload: link firmato nella cartella dello studente + CORS impostato una volta', async () => {
  const r = await call('student', { action: 'upload', name: 'Appunti.PDF', size: 2000 });
  assert.strictEqual(r.status, 200);
  assert.match(r.data.key, /^u-stud\/[0-9a-f-]{36}\.pdf$/);
  assert.match(r.data.url, /^https:\/\/s3\.eu-central-003\.backblazeb2\.com\/appunti\/u-stud\/.+X-Amz-Signature=[0-9a-f]{64}$/);
  assert.strictEqual(r.data.contentType, 'application/pdf');
  assert.deepStrictEqual((corsRules[0] as { allowedOrigins: string[] }).allowedOrigins, ['https://alekseysymonenko.github.io']);
  calls = [];
  await call('student', { action: 'upload', name: 'b.pdf', size: 10 });
  assert.ok(!calls.some((c) => c.includes('b2_authorize_account')), 'CORS non riconfigurato ogni volta');
});

test('confirm: niente percorsi altrui, dimensione reale letta da B2', async () => {
  assert.strictEqual((await call('student', { action: 'confirm', key: 'u-adm/x.pdf', name: 'x.pdf', courseId: 1 })).status, 403);
  headSize = 12345;
  const r = await call('student', { action: 'confirm', key: 'u-stud/abc.pdf', name: 'Lezione.pdf', title: 'L1', courseId: 1 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.id, 42);
  const body = JSON.parse(calls.find((c) => c.startsWith('BODY '))!.slice(5));
  assert.strictEqual(body.size, 12345);
  assert.strictEqual(body.storage, 'b2');
  assert.strictEqual(body.storage_path, 'u-stud/abc.pdf');
  assert.strictEqual(body.storage_version, 'ver-new');
});

test('confirm oltre la quota senza spazio liberabile: file appena caricato rimosso', async () => {
  used = 1024 ** 3;
  makeRoom = 'fail';
  const r = await call('student', { action: 'confirm', key: 'u-stud/abc.pdf', name: 'a.pdf', courseId: 1 });
  assert.strictEqual(r.status, 507);
  assert.ok(calls.some((c) => c === 'DELETE s3.eu-central-003.backblazeb2.com/appunti/u-stud/abc.pdf v=ver-new'));
});

test('aperture contate solo quando richiesto', async () => {
  await call('student', { action: 'url', id: 9 });
  assert.ok(!calls.some((c) => c.includes('record_file_open')));
  await call('student', { action: 'url', id: 9, count: true });
  assert.ok(calls.some((c) => c.includes('record_file_open')));
});

test('url: link temporaneo con nome file e tipo corretti', async () => {
  const r = await call('student', { action: 'url', id: 9, download: true });
  const u = new URL(r.data.url);
  assert.match(u.searchParams.get('response-content-disposition')!, /^attachment; filename="Lezione _ 1.pdf"; filename\*=UTF-8''Lezione%20%C3%A8%201.pdf$/);
  assert.strictEqual(u.searchParams.get('response-content-type'), 'application/pdf');
  const inline = await call('student', { action: 'url', id: 9 });
  assert.match(new URL(inline.data.url).searchParams.get('response-content-disposition')!, /^inline/);
});

test('nomi con parentesi e apostrofi accettati da B2 (RFC 5987)', async () => {
  const { rfc5987 } = await import('../index.ts');
  assert.strictEqual(rfc5987("1- Struttura Atomica (1).pdf"), '1-%20Struttura%20Atomica%20%281%29.pdf');
  assert.strictEqual(rfc5987("L'atomo*!.pdf"), 'L%27atomo%2A%21.pdf');
  // solo caratteri ammessi dallo standard dopo filename*=UTF-8''
  assert.match(rfc5987("Àccènti (bozza) [v2] #1 & più.pdf"), /^[A-Za-z0-9%\-._~]+$/);
});

test('eliminazione: solo admin', async () => {
  assert.strictEqual((await call('student', { action: 'delete', id: 9 })).status, 403);
  assert.strictEqual((await call('student', { action: 'delete-course-files', courseId: 1 })).status, 403);
  const r = await call('admin', { action: 'delete', id: 9 });
  assert.strictEqual(r.status, 200);
  assert.ok(calls.some((c) => c.startsWith('DELETE s3.eu-central-003')));
  assert.ok(calls.some((c) => c.startsWith('DELETE proj.supabase.co/rest/v1/files')));
});
