'use strict';

const crypto = require('node:crypto');
const db = require('./db');

/** Carica l'utente dalla sessione ad ogni richiesta (così i cambi di ruolo sono immediati). */
function loadUser(req, res, next) {
  req.user = null;
  if (req.session && req.session.userId) {
    req.user = db.findUserById(req.session.userId) || null;
    if (!req.user) delete req.session.userId;
  }
  res.locals.user = req.user;
  res.locals.isAdmin = Boolean(req.user && req.user.role === 'admin');
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET' && !req.xhr) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  return res.status(401).json({ error: 'Autenticazione richiesta' });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).render('error', {
    title: 'Accesso negato',
    status: 403,
    message: 'Questa operazione è riservata agli amministratori della piattaforma.',
  });
}

/** Token CSRF sincronizzato con la sessione. */
function csrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}

function verifyCsrf(req, res, next) {
  const sent = Buffer.from(
    String(req.get('x-csrf-token') || (req.body && req.body._csrf) || (req.query && req.query._csrf) || '')
  );
  const expected = Buffer.from(req.session.csrf || '');
  const ok =
    expected.length > 0 && sent.length === expected.length && crypto.timingSafeEqual(sent, expected);
  if (ok) return next();
  if (req.get('x-csrf-token') || req.xhr) {
    return res.status(403).json({ error: 'Token di sicurezza non valido. Ricarica la pagina.' });
  }
  return res.status(403).render('error', {
    title: 'Richiesta non valida',
    status: 403,
    message: 'Il token di sicurezza non è valido o è scaduto. Ricarica la pagina e riprova.',
  });
}

/** Messaggi "flash" mostrati una sola volta. */
function flash(req, res, next) {
  req.flash = (type, text) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, text });
  };
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin, csrfToken, verifyCsrf, flash };
