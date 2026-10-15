'use strict';

// Verifica il flusso OpenID Connect contro un Identity Provider simulato
// (configurato come Google Workspace con dominio campus.unimib.it).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elearning-oidc-'));
let idp;
let idpUrl;
let server;
let base;
let nextClaims = {};
const codes = new Map();

before(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  idp = http.createServer(async (req, res) => {
    const url = new URL(req.url, idpUrl);
    const json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (url.pathname === '/.well-known/openid-configuration') {
      return json({
        issuer: idpUrl,
        authorization_endpoint: `${idpUrl}/auth`,
        token_endpoint: `${idpUrl}/token`,
        jwks_uri: `${idpUrl}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
    }
    if (url.pathname === '/jwks') return json({ keys: [jwk] });
    if (url.pathname === '/auth') {
      // L'utente "si autentica" sull'IdP: restituiamo un codice monouso.
      const code = crypto.randomBytes(8).toString('hex');
      codes.set(code, { nonce: url.searchParams.get('nonce'), claims: nextClaims, hd: url.searchParams.get('hd') });
      res.statusCode = 302;
      res.setHeader('location', `${url.searchParams.get('redirect_uri')}?code=${code}&state=${url.searchParams.get('state')}`);
      return res.end();
    }
    if (url.pathname === '/token') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const entry = codes.get(new URLSearchParams(body).get('code'));
      if (!entry) { res.statusCode = 400; return json({ error: 'invalid_grant' }); }
      const idToken = await new SignJWT({ nonce: entry.nonce, ...entry.claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(idpUrl).setAudience('test-client').setSubject(entry.claims.sub || 'u1')
        .setIssuedAt().setExpirationTime('5m').sign(privateKey);
      return json({ access_token: 'at', token_type: 'Bearer', id_token: idToken, expires_in: 300 });
    }
    res.statusCode = 404; res.end();
  });
  idp.listen(0);
  await new Promise((r) => idp.once('listening', r));
  idpUrl = `http://127.0.0.1:${idp.address().port}`;

  // Porta dell'app decisa prima di caricarla, per il redirect URI.
  const probe = http.createServer().listen(0);
  await new Promise((r) => probe.once('listening', r));
  const appPort = probe.address().port;
  probe.close();

  Object.assign(process.env, {
    DATA_DIR: tmp,
    NODE_ENV: 'test',
    AUTH_MODE: 'oidc',
    ALLOWED_EMAIL_DOMAINS: 'campus.unimib.it',
    OIDC_HOSTED_DOMAIN: 'campus.unimib.it',
    OIDC_ISSUER: idpUrl,
    OIDC_CLIENT_ID: 'test-client',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_REDIRECT_URI: `http://127.0.0.1:${appPort}/auth/callback`,
  });
  const app = require('../src/server');
  server = app.listen(appPort);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${appPort}`;
});

after(() => {
  server.close();
  idp.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Esegue l'intero giro login → IdP → callback e restituisce la risposta finale. */
async function loginAs(claims) {
  nextClaims = claims;
  let cookie = '';
  const go = async (url) => {
    const res = await fetch(url, { redirect: 'manual', headers: { cookie } });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return res;
  };
  const start = await go(`${base}/auth/login`);
  assert.strictEqual(start.status, 302);
  const authUrl = new URL(start.headers.get('location'));
  assert.strictEqual(authUrl.searchParams.get('hd'), 'campus.unimib.it');
  assert.strictEqual(authUrl.searchParams.get('code_challenge_method'), 'S256');
  const fromIdp = await go(authUrl.href);
  const callback = await go(fromIdp.headers.get('location'));
  return { callback, home: callback.status === 302 ? await go(base + callback.headers.get('location')) : null };
}

test('studente Bicocca entra', async () => {
  const { callback, home } = await loginAs({
    sub: 's1', email: 'n.cognome@campus.unimib.it', email_verified: true, hd: 'campus.unimib.it', name: 'Nome Cognome',
  });
  assert.strictEqual(callback.status, 302);
  assert.match(await home.text(), /Nome, cosa studiamo oggi/);
});

test('account Gmail personale rifiutato', async () => {
  const { callback } = await loginAs({ sub: 's2', email: 'mario@gmail.com', email_verified: true, name: 'Mario' });
  assert.strictEqual(callback.status, 403);
});

test('email con dominio giusto ma senza claim hd verificato rifiutata', async () => {
  const { callback } = await loginAs({ sub: 's3', email: 'finto@campus.unimib.it', email_verified: true });
  assert.strictEqual(callback.status, 403);
});

test('altro dominio Google Workspace rifiutato', async () => {
  const { callback } = await loginAs({ sub: 's4', email: 'x@unimi.it', email_verified: true, hd: 'unimi.it' });
  assert.strictEqual(callback.status, 403);
});
