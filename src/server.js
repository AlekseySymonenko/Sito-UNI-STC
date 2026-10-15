'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const db = require('./db');
const SqliteStore = require('./sessionStore');
const { KINDS } = require('./fileTypes');
const { loadUser, requireAuth, csrfToken, flash } = require('./middleware');
const auth = require('./auth');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'media-src': ["'self'"],
        'frame-src': ["'self'"],
        'object-src': ["'none'"],
        'form-action': ["'self'", ...(config.oidc.issuer ? [new URL(config.oidc.issuer).origin] : [])],
        'upgrade-insecure-requests': config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));

app.use(
  session({
    name: 'elearning.sid',
    secret: config.sessionSecret,
    store: new SqliteStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionMaxAgeHours * 3600 * 1000,
    },
  })
);

app.use(loadUser, csrfToken, flash);

// ---- Helper disponibili in tutti i template -------------------------------
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
app.locals.uni = config.university;
app.locals.KINDS = KINDS;
app.locals.authMode = config.authMode;
app.locals.formatBytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0).replace('.', ',')} ${u[i]}`;
};
app.locals.formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
app.locals.formatDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
app.locals.initials = (name) =>
  String(name || '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});

// Colori del tema configurabili da variabili d'ambiente.
app.get('/theme.css', (req, res) => {
  const safe = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : d);
  res.type('text/css').set('Cache-Control', 'public, max-age=3600')
    .send(`:root{--primary:${safe(config.university.primaryColor, '#8c1d2f')};--accent:${safe(config.university.accentColor, '#c8a24a')};}`);
});

// ---- Pagine pubbliche ----------------------------------------------------------
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', {
    title: 'Accesso',
    error: null,
    loggedOut: req.query.logout === '1',
  });
});

app.use(auth.router);

// ---- Pagine riservate -------------------------------------------------------------
app.get('/', requireAuth, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    stats: db.stats(),
    courses: db.listCourses().sort((a, b) => (b.last_upload || '').localeCompare(a.last_upload || '')).slice(0, 6),
    recent: db.listRecentFiles(8),
    myCount: db.listFilesByUser(req.user.id).length,
  });
});

app.use(require('./routes/courses').router);
app.use(require('./routes/files').router);
app.use(require('./routes/admin').router);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Pagina non trovata', status: 404, message: 'La pagina che cerchi non esiste.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).render('error', {
    title: 'Errore',
    status: 500,
    message: config.isProduction ? 'Si è verificato un errore imprevisto.' : err.message,
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`${config.university.platformName} avviato su ${config.baseUrl} (auth: ${config.authMode})`);
    if (config.authMode === 'dev') console.warn('⚠  Modalità di accesso DEV attiva: non usarla in produzione.');
  });
}

module.exports = app;
