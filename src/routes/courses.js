'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('../config');
const db = require('../db');
const { KINDS, typeFor, acceptAttr } = require('../fileTypes');
const { requireAuth, requireAdmin, verifyCsrf } = require('../middleware');

const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '64kb' });

const clean = (v, max) => String(v || '').trim().slice(0, max);

function courseFromBody(body) {
  return {
    name: clean(body.name, 140),
    code: clean(body.code, 30),
    teacher: clean(body.teacher, 120),
    year: clean(body.year, 30),
    description: clean(body.description, 2000),
  };
}

function loadCourse(req, res, next) {
  const id = Number(req.params.id);
  const course = Number.isInteger(id) ? db.findCourse(id) : null;
  if (!course) {
    return res.status(404).render('error', { title: 'Non trovato', status: 404, message: 'Il corso richiesto non esiste.' });
  }
  req.course = course;
  next();
}

// Nome originale: busboy lo decodifica come latin1, lo riportiamo in UTF-8.
function fixName(name) {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => {
      const t = typeFor(fixName(file.originalname));
      cb(null, `${crypto.randomBytes(16).toString('hex')}.${t ? t.ext : 'bin'}`);
    },
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20, fields: 20 },
  fileFilter: (req, file, cb) => {
    file.originalname = fixName(file.originalname);
    if (!typeFor(file.originalname)) {
      const err = new Error(`Tipo di file non ammesso: ${file.originalname}`);
      err.code = 'UNSUPPORTED_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

function removeStored(storedName) {
  fs.rm(path.join(config.uploadDir, path.basename(storedName)), { force: true }, () => {});
}

// ---- Elenco e creazione corsi ------------------------------------------------
router.get('/courses', requireAuth, (req, res) => {
  const q = clean(req.query.q, 100).toLowerCase();
  let courses = db.listCourses();
  if (q) {
    courses = courses.filter((c) =>
      [c.name, c.code, c.teacher].some((v) => (v || '').toLowerCase().includes(q))
    );
  }
  res.render('courses', { title: 'Corsi', courses, q });
});

// Tutti gli studenti possono aggiungere contenuti (corsi e file);
// modificare ed eliminare è riservato agli amministratori.
router.get('/courses/new', requireAuth, (req, res) => {
  res.render('course-form', { title: 'Nuovo corso', course: {}, action: '/courses', error: null });
});

router.post('/courses', requireAuth, form, verifyCsrf, (req, res) => {
  const data = courseFromBody(req.body);
  if (!data.name) {
    return res.status(400).render('course-form', {
      title: 'Nuovo corso', course: data, action: '/courses', error: 'Il nome del corso è obbligatorio.',
    });
  }
  const id = db.createCourse({ ...data, createdBy: req.user.id });
  db.audit(req.user.id, 'corso_creato', `#${id} ${data.name}`);
  req.flash('success', `Corso «${data.name}» creato.`);
  res.redirect(`/courses/${id}`);
});

// ---- Pagina corso ---------------------------------------------------------------
router.get('/courses/:id', requireAuth, loadCourse, (req, res) => {
  const kind = KINDS[req.query.kind] ? req.query.kind : '';
  const q = clean(req.query.q, 100);
  const files = db.listFilesByCourse(req.course.id, { kind, q });
  const counts = Object.fromEntries(db.kindCounts(req.course.id).map((r) => [r.kind, r.n]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.render('course', {
    title: req.course.name,
    course: req.course,
    files,
    counts,
    total,
    kind,
    q,
    acceptAttr,
    maxUploadMb: config.maxUploadMb,
  });
});

router.get('/courses/:id/edit', requireAuth, requireAdmin, loadCourse, (req, res) => {
  res.render('course-form', {
    title: 'Modifica corso', course: req.course, action: `/courses/${req.course.id}/edit`, error: null,
  });
});

router.post('/courses/:id/edit', requireAuth, requireAdmin, loadCourse, form, verifyCsrf, (req, res) => {
  const data = courseFromBody(req.body);
  if (!data.name) {
    return res.status(400).render('course-form', {
      title: 'Modifica corso', course: { ...req.course, ...data }, action: `/courses/${req.course.id}/edit`,
      error: 'Il nome del corso è obbligatorio.',
    });
  }
  db.updateCourse(req.course.id, data);
  db.audit(req.user.id, 'corso_modificato', `#${req.course.id} ${data.name}`);
  req.flash('success', 'Corso aggiornato.');
  res.redirect(`/courses/${req.course.id}`);
});

router.post('/courses/:id/delete', requireAuth, requireAdmin, loadCourse, form, verifyCsrf, (req, res) => {
  const stored = db.storedNamesByCourse(req.course.id);
  db.deleteCourse(req.course.id);
  stored.forEach((f) => removeStored(f.stored_name));
  db.audit(req.user.id, 'corso_eliminato', `#${req.course.id} ${req.course.name} (${stored.length} file)`);
  req.flash('success', `Corso «${req.course.name}» eliminato.`);
  res.redirect('/courses');
});

// ---- Caricamento file (tutti gli studenti autenticati) ---------------------------
router.post(
  '/courses/:id/upload',
  requireAuth,
  loadCourse,
  verifyCsrf, // token via header X-CSRF-Token o ?_csrf=, verificato PRIMA di ricevere i file
  (req, res, next) => {
    upload.array('files', 20)(req, res, (err) => {
      const wantsJson = Boolean(req.get('x-csrf-token'));
      if (err) {
        (req.files || []).forEach((f) => removeStored(f.filename));
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `File troppo grande: il limite è ${config.maxUploadMb} MB.`
            : err.code === 'UNSUPPORTED_TYPE'
              ? err.message
              : err.code === 'LIMIT_FILE_COUNT'
                ? 'Puoi caricare al massimo 20 file alla volta.'
                : 'Caricamento non riuscito.';
        if (wantsJson) return res.status(400).json({ error: message });
        req.flash('error', message);
        return res.redirect(`/courses/${req.course.id}`);
      }
      const files = req.files || [];
      if (files.length === 0) {
        if (wantsJson) return res.status(400).json({ error: 'Nessun file selezionato.' });
        req.flash('error', 'Nessun file selezionato.');
        return res.redirect(`/courses/${req.course.id}`);
      }
      const title = clean(req.body.title, 200);
      const description = clean(req.body.description, 2000);
      const ids = files.map((f) => {
        const t = typeFor(f.originalname);
        const id = db.insertFile({
          courseId: req.course.id,
          title: files.length === 1 && title ? title : path.parse(f.originalname).name.slice(0, 200),
          description,
          originalName: f.originalname.slice(0, 255),
          storedName: f.filename,
          mime: t.mime,
          kind: t.kind,
          size: f.size,
          uploadedBy: req.user.id,
        });
        db.audit(req.user.id, 'file_caricato', `#${id} ${f.originalname} → ${req.course.name}`);
        return id;
      });
      const msg = files.length === 1 ? 'File caricato con successo.' : `${files.length} file caricati con successo.`;
      if (wantsJson) {
        req.flash('success', msg);
        return res.json({ ok: true, ids });
      }
      req.flash('success', msg);
      res.redirect(`/courses/${req.course.id}`);
    });
  }
);

module.exports = { router, removeStored };
