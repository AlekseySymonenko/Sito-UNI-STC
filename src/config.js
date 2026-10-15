'use strict';

const path = require('node:path');
const fs = require('node:fs');

// Carica il file .env se presente (Node >= 20.12 / 21.7).
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

const config = {
  isProduction,
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  trustProxy: process.env.TRUST_PROXY === 'true',

  university: {
    name: process.env.UNIVERSITY_NAME || 'Università degli Studi',
    shortName: process.env.UNIVERSITY_SHORT_NAME || 'UniSTC',
    platformName: process.env.PLATFORM_NAME || 'e-Learning',
    primaryColor: process.env.PRIMARY_COLOR || '#8c1d2f',
    accentColor: process.env.ACCENT_COLOR || '#c8a24a',
    // Nota a piè di pagina, es. "Progetto studentesco non ufficiale".
    disclaimer: process.env.DISCLAIMER || '',
  },

  sessionSecret: process.env.SESSION_SECRET || '',
  sessionMaxAgeHours: Number(process.env.SESSION_MAX_AGE_HOURS || 12),

  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  dbFile: path.join(dataDir, 'elearning.db'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),

  // Modalità di autenticazione: "oidc" (consigliata), "header" (Shibboleth/SAML
  // tramite reverse proxy) oppure "dev" (solo sviluppo locale).
  authMode: (process.env.AUTH_MODE || (isProduction ? 'oidc' : 'dev')).toLowerCase(),

  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS),
  adminEmails: list(process.env.ADMIN_EMAILS),

  oidc: {
    issuer: process.env.OIDC_ISSUER || '',
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || '',
    scopes: process.env.OIDC_SCOPES || 'openid email profile',
    providerLabel: process.env.OIDC_PROVIDER_LABEL || "credenziali d'Ateneo",
    // Google Workspace: dominio dell'organizzazione da imporre (claim "hd").
    hostedDomain: (process.env.OIDC_HOSTED_DOMAIN || '').trim().toLowerCase(),
    // Claim opzionale da verificare (es. eduPersonAffiliation=student).
    requiredClaim: process.env.OIDC_REQUIRED_CLAIM || '',
    requiredClaimValues: list(process.env.OIDC_REQUIRED_CLAIM_VALUES),
  },

  header: {
    emailHeader: (process.env.AUTH_HEADER_EMAIL || 'mail').toLowerCase(),
    nameHeader: (process.env.AUTH_HEADER_NAME || 'displayname').toLowerCase(),
    idHeader: (process.env.AUTH_HEADER_ID || 'eppn').toLowerCase(),
    loginPath: process.env.AUTH_HEADER_LOGIN_PATH || '/auth/sso',
  },
};

if (!['oidc', 'header', 'dev'].includes(config.authMode)) {
  throw new Error(`AUTH_MODE non valido: ${config.authMode}`);
}

if (isProduction) {
  if (config.authMode === 'dev') {
    throw new Error('AUTH_MODE=dev non è consentito in produzione.');
  }
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET mancante o troppo corto (almeno 32 caratteri).');
  }
  if (config.allowedEmailDomains.length === 0) {
    throw new Error('ALLOWED_EMAIL_DOMAINS è obbligatorio in produzione.');
  }
}

if (!config.sessionSecret) {
  config.sessionSecret = require('node:crypto').randomBytes(32).toString('hex');
}

module.exports = config;
