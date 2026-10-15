'use strict';

/**
 * Autenticazione con le credenziali d'Ateneo.
 *
 * La piattaforma NON riceve e NON memorizza mai le password: l'utente si
 * autentica direttamente presso l'Identity Provider (IdP) dell'Ateneo
 * (es. Microsoft Entra ID / Google Workspace / Keycloak / Shibboleth-IDEM).
 * Al ritorno riceviamo solo un'asserzione firmata con identificativo, nome
 * ed email istituzionale, che usiamo per verificare l'appartenenza all'Ateneo.
 *
 * Modalità supportate (variabile AUTH_MODE):
 *  - oidc   : OpenID Connect (Authorization Code + PKCE). Consigliata.
 *  - header : SAML/Shibboleth gestito da un Service Provider davanti all'app
 *             (Apache mod_shib, oauth2-proxy, ecc.) che passa gli attributi via header.
 *  - dev    : login simulato, solo per sviluppo locale. Vietato in produzione.
 */

const express = require('express');
const { Issuer, generators } = require('openid-client');
const config = require('./config');
const db = require('./db');
const { verifyCsrf } = require('./middleware');

const router = express.Router();

function emailAllowed(email) {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return false;
  if (config.allowedEmailDomains.length === 0) return true; // ammesso solo fuori produzione
  const domain = email.split('@')[1].toLowerCase();
  return config.allowedEmailDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Completa il login: verifica dominio, crea/aggiorna l'utente e rigenera la sessione. */
function completeLogin(req, res, { subject, email, name }) {
  email = String(email || '').trim().toLowerCase();
  if (!emailAllowed(email)) {
    db.audit(null, 'login_rifiutato', `${email || 'email assente'}`);
    return res.status(403).render('login', {
      title: 'Accesso',
      error:
        "L'account utilizzato non appartiene all'Ateneo. Accedi con la tua email istituzionale.",
    });
  }
  const user = db.upsertUserFromLogin({
    subject: String(subject || email),
    email,
    name: String(name || email.split('@')[0]).trim().slice(0, 120),
  });
  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Errore', status: 500, message: 'Errore di sessione.' });
    req.session.userId = user.id;
    db.audit(user.id, 'login', null);
    const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//');
    res.redirect(safeReturn ? returnTo : '/');
  });
}

// ---- OpenID Connect ---------------------------------------------------------
let oidcClientPromise = null;
function getOidcClient() {
  if (!oidcClientPromise) {
    const { issuer, clientId, clientSecret, redirectUri } = config.oidc;
    if (!issuer || !clientId || !redirectUri) {
      return Promise.reject(new Error('Configurazione OIDC incompleta (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_REDIRECT_URI).'));
    }
    oidcClientPromise = Issuer.discover(issuer)
      .then(
        (iss) =>
          new iss.Client({
            client_id: clientId,
            client_secret: clientSecret || undefined,
            token_endpoint_auth_method: clientSecret ? 'client_secret_basic' : 'none',
            redirect_uris: [redirectUri],
            response_types: ['code'],
          })
      )
      .catch((err) => {
        oidcClientPromise = null;
        throw err;
      });
  }
  return oidcClientPromise;
}

function pickEmail(claims) {
  return claims.email || claims.preferred_username || claims.upn || claims.mail || '';
}

function claimSatisfied(claims) {
  const { requiredClaim, requiredClaimValues } = config.oidc;
  if (!requiredClaim) return true;
  const raw = claims[requiredClaim];
  const values = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((v) => String(v).toLowerCase());
  if (requiredClaimValues.length === 0) return values.length > 0;
  return values.some((v) => requiredClaimValues.some((r) => v === r || v.startsWith(`${r}@`)));
}

router.get('/auth/login', async (req, res, next) => {
  if (config.authMode === 'header') return res.redirect(config.header.loginPath);
  if (config.authMode !== 'oidc') return res.redirect('/login');
  try {
    const client = await getOidcClient();
    const codeVerifier = generators.codeVerifier();
    const state = generators.state();
    const nonce = generators.nonce();
    req.session.oidc = { codeVerifier, state, nonce };
    const url = client.authorizationUrl({
      scope: config.oidc.scopes,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
      ...(config.oidc.hostedDomain ? { hd: config.oidc.hostedDomain } : {}),
    });
    req.session.save(() => res.redirect(url));
  } catch (err) {
    next(err);
  }
});

router.get('/auth/callback', async (req, res, next) => {
  if (config.authMode !== 'oidc') return res.redirect('/login');
  const pending = req.session.oidc;
  delete req.session.oidc;
  if (!pending) return res.redirect('/login');
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    if (params.error) {
      return res.status(401).render('login', {
        title: 'Accesso',
        error: "Accesso annullato o non autorizzato dall'Identity Provider d'Ateneo.",
      });
    }
    const tokenSet = await client.callback(config.oidc.redirectUri, params, {
      code_verifier: pending.codeVerifier,
      state: pending.state,
      nonce: pending.nonce,
    });
    let claims = tokenSet.claims();
    if (!pickEmail(claims) && tokenSet.access_token) {
      try {
        claims = { ...claims, ...(await client.userinfo(tokenSet)) };
      } catch (_) { /* userinfo non disponibile */ }
    }
    // Il parametro "hd" nella richiesta è solo un suggerimento: va verificato nel token firmato.
    const hd = String(claims.hd || '').toLowerCase();
    if ((config.oidc.hostedDomain && hd !== config.oidc.hostedDomain) || claims.email_verified === false) {
      db.audit(null, 'login_rifiutato', `${pickEmail(claims)}: account non appartenente a ${config.oidc.hostedDomain || 'dominio verificato'}`);
      return res.status(403).render('login', {
        title: 'Accesso',
        error: `Accedi con il tuo account istituzionale${config.oidc.hostedDomain ? ` @${config.oidc.hostedDomain}` : ''}.`,
      });
    }
    if (!claimSatisfied(claims)) {
      db.audit(null, 'login_rifiutato', `${pickEmail(claims)}: requisito ${config.oidc.requiredClaim} non soddisfatto`);
      return res.status(403).render('login', {
        title: 'Accesso',
        error: 'Il tuo profilo d\'Ateneo non risulta abilitato all\'accesso a questa piattaforma.',
      });
    }
    const name =
      claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || '';
    // Ci fidiamo solo dell'issuer configurato: sub è univoco per quell'IdP.
    completeLogin(req, res, { subject: `oidc:${claims.sub}`, email: pickEmail(claims), name });
  } catch (err) {
    next(err);
  }
});

// ---- SAML / Shibboleth tramite reverse proxy --------------------------------
if (config.authMode === 'header') {
  // ATTENZIONE: questa rotta deve essere protetta dal Service Provider SAML
  // (es. Apache "AuthType shibboleth / Require valid-user") e l'app non deve
  // essere raggiungibile direttamente: altrimenti gli header sarebbero falsificabili.
  router.get(config.header.loginPath, (req, res) => {
    const email = (req.get(config.header.emailHeader) || '').split(';')[0];
    const id = (req.get(config.header.idHeader) || email).split(';')[0];
    const name = req.get(config.header.nameHeader) || '';
    if (!email) {
      return res.status(401).render('login', {
        title: 'Accesso',
        error: 'Il Service Provider non ha fornito gli attributi richiesti.',
      });
    }
    completeLogin(req, res, { subject: `saml:${id}`, email, name });
  });
}

// ---- Modalità sviluppo -------------------------------------------------------
if (config.authMode === 'dev' && !config.isProduction) {
  router.post('/auth/dev', express.urlencoded({ extended: false }), verifyCsrf, (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    completeLogin(req, res, { subject: `dev:${email}`, email, name: req.body.name });
  });
}

router.post('/logout', express.urlencoded({ extended: false }), verifyCsrf, (req, res) => {
  const userId = req.session.userId;
  req.session.destroy(() => {
    if (userId) db.audit(userId, 'logout', null);
    res.clearCookie('elearning.sid');
    res.redirect('/login?logout=1');
  });
});

module.exports = { router, emailAllowed };
