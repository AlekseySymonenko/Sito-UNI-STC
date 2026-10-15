'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elearning-test-'));
process.env.DATA_DIR = tmp;
process.env.AUTH_MODE = 'dev';
process.env.NODE_ENV = 'test';
process.env.ALLOWED_EMAIL_DOMAINS = 'studenti.test.it';
process.env.ADMIN_EMAILS = 'admin@studenti.test.it';

const app = require('../src/server');
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Piccolo client con cookie jar. */
function client() {
  let cookie = '';
  async function req(url, opts = {}) {
    const res = await fetch(base + url, {
      redirect: 'manual',
      ...opts,
      headers: { ...(opts.headers || {}), cookie },
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return res;
  }
  async function csrf(url = '/login') {
    const html = await (await req(url)).text();
    return html.match(/name="_csrf" value="([^"]+)"/)[1];
  }
  async function login(email, name) {
    const token = await csrf();
    return req('/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: token, email, name }),
    });
  }
  async function post(url, fields) {
    const token = await csrf('/');
    return req(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: token, ...fields }),
    });
  }
  return { req, csrf, login, post };
}

const student = client();
const admin = client();
let courseId;
let fileId;

test('le pagine riservate richiedono il login', async () => {
  const res = await client().req('/');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), '/login');
});

test('un dominio email esterno viene rifiutato', async () => {
  const res = await client().login('intruso@gmail.com', 'Intruso');
  assert.strictEqual(res.status, 403);
});

test('login senza token CSRF rifiutato', async () => {
  const res = await client().req('/auth/dev', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'email=a%40studenti.test.it',
  });
  assert.strictEqual(res.status, 403);
});

test('studente e admin accedono', async () => {
  assert.strictEqual((await student.login('mario.rossi@studenti.test.it', 'Mario Rossi')).status, 302);
  assert.strictEqual((await admin.login('admin@studenti.test.it', 'Anna Admin')).status, 302);
  const html = await (await student.req('/')).text();
  assert.match(html, /Mario, cosa studiamo oggi/);
  assert.doesNotMatch(html, /href="\/admin"/);
  assert.match(await (await admin.req('/')).text(), /href="\/admin"/);
});

test('lo studente crea un corso e carica un PDF', async () => {
  const res = await student.post('/courses', { name: 'Analisi Matematica I', code: 'MAT-101', teacher: 'Bianchi' });
  assert.strictEqual(res.status, 302);
  courseId = Number(res.headers.get('location').split('/').pop());

  const token = await student.csrf(`/courses/${courseId}`);
  const fd = new FormData();
  fd.append('title', 'Lezione 1 – Limiti');
  fd.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'lezione1.pdf');
  const up = await student.req(`/courses/${courseId}/upload`, { method: 'POST', body: fd, headers: { 'x-csrf-token': token } });
  assert.strictEqual(up.status, 200);
  const data = await up.json();
  assert.ok(data.ok);
  fileId = data.ids[0];

  const view = await student.req(`/files/${fileId}/view`);
  assert.strictEqual(view.status, 200);
  assert.strictEqual(view.headers.get('content-type'), 'application/pdf');
  assert.strictEqual(await view.text(), '%PDF-1.4 test');
});

test('tipi di file non ammessi vengono rifiutati', async () => {
  const token = await student.csrf(`/courses/${courseId}`);
  const fd = new FormData();
  fd.append('files', new Blob(['<script>alert(1)</script>']), 'attacco.html');
  const up = await student.req(`/courses/${courseId}/upload`, { method: 'POST', body: fd, headers: { 'x-csrf-token': token } });
  assert.strictEqual(up.status, 400);
});

test('lo studente NON può eliminare file né accedere all\'amministrazione', async () => {
  assert.strictEqual((await student.post(`/files/${fileId}/delete`, {})).status, 403);
  assert.strictEqual((await student.req('/admin')).status, 403);
  assert.strictEqual((await student.req(`/files/${fileId}`)).status, 200);
});

test('l\'admin assegna il ruolo e può eliminare', async () => {
  const html = await (await admin.req('/admin')).text();
  const row = html.split('<tr>').find((r) => r.includes('mario.rossi@studenti.test.it'));
  const userId = row.match(/\/admin\/users\/(\d+)\/role/)[1];
  assert.strictEqual((await admin.post(`/admin/users/${userId}/role`, { role: 'admin' })).status, 302);
  assert.match(await (await student.req('/')).text(), /href="\/admin"/);

  assert.strictEqual((await admin.post(`/files/${fileId}/delete`, {})).status, 302);
  assert.strictEqual((await admin.req(`/files/${fileId}`)).status, 404);
  assert.strictEqual(fs.readdirSync(path.join(tmp, 'uploads')).length, 0);
});

test('non si può rimuovere l\'ultimo amministratore', async () => {
  const html = await (await admin.req('/admin')).text();
  const ids = [...html.matchAll(/\/admin\/users\/(\d+)\/role/g)].map((m) => m[1]);
  for (const id of ids) await admin.post(`/admin/users/${id}/role`, { role: 'student' });
  const a = await admin.req('/admin');
  const s = await student.req('/admin');
  assert.ok(a.status === 200 || s.status === 200);
});
