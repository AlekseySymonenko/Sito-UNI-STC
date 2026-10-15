'use strict';

const express = require('express');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const { KINDS, INLINE_KINDS, typeFor } = require('../fileTypes');
const { requireAuth, requireAdmin, verifyCsrf } = require('../middleware');
const { removeStored } = require('./courses');

const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '16kb' });

function loadFile(req, res, next) {
  const id = Number(req.params.id);
  const file = Number.isInteger(id) ? db.findFile(id) : null;
  if (!file) {
    return res.status(404).render('error', { title: 'Non trovato', status: 404, message: 'Il file richiesto non esiste.' });
  }
  req.item = file;
  next();
}

function contentDisposition(type, filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sendStored(res, file, inline) {
  const t = typeFor(file.stored_name) || { mime: 'application/octet-stream' };
  res.setHeader('Content-Type', t.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', file.original_name));
  if (inline && file.kind !== 'pdf') {
    // Immagini/audio/video vengono servite in un contesto isolato.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  }
  res.sendFile(path.join(config.uploadDir, path.basename(file.stored_name)), { headers: {} }, (err) => {
    if (err && !res.headersSent) res.status(err.status || 404).end();
  });
}

// ---- Dettaglio file ----------------------------------------------------------
router.get('/files/:id', requireAuth, loadFile, (req, res) => {
  res.render('file', {
    title: req.item.title,
    file: req.item,
    kindInfo: KINDS[req.item.kind],
    inline: INLINE_KINDS.has(req.item.kind),
  });
});

router.get('/files/:id/view', requireAuth, loadFile, (req, res) => {
  sendStored(res, req.item, INLINE_KINDS.has(req.item.kind));
});

router.get('/files/:id/download', requireAuth, loadFile, (req, res) => {
  sendStored(res, req.item, false);
});

// ---- Eliminazione: SOLO amministratori -------------------------------------------
router.post('/files/:id/delete', requireAuth, requireAdmin, loadFile, form, verifyCsrf, (req, res) => {
  db.deleteFile(req.item.id);
  removeStored(req.item.stored_name);
  db.audit(req.user.id, 'file_eliminato', `#${req.item.id} ${req.item.original_name} (${req.item.course_name})`);
  req.flash('success', `File «${req.item.title}» eliminato.`);
  const back = req.body.back === 'mine' ? '/me/uploads' : `/courses/${req.item.course_id}`;
  res.redirect(back);
});

// ---- Ricerca e caricamenti personali -----------------------------------------------
router.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const kind = KINDS[req.query.kind] ? req.query.kind : '';
  const files = q ? db.searchFiles(q, kind) : [];
  res.render('search', { title: 'Ricerca', q, kind, files });
});

router.get('/me/uploads', requireAuth, (req, res) => {
  res.render('my-uploads', { title: 'I miei caricamenti', files: db.listFilesByUser(req.user.id) });
});

module.exports = { router };
