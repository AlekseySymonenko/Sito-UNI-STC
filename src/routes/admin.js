'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin, verifyCsrf } = require('../middleware');

const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '16kb' });

router.use('/admin', requireAuth, requireAdmin);

router.get('/admin', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  res.render('admin', {
    title: 'Amministrazione',
    users: db.listUsers(q),
    stats: db.stats(),
    audit: db.listAudit(40),
    q,
  });
});

/** Assegna o revoca il ruolo di amministratore. */
router.post('/admin/users/:id/role', form, verifyCsrf, (req, res) => {
  const target = db.findUserById(Number(req.params.id));
  const role = req.body.role === 'admin' ? 'admin' : 'student';
  if (!target) {
    req.flash('error', 'Utente non trovato.');
    return res.redirect('/admin');
  }
  if (target.role === 'admin' && role === 'student' && db.countAdmins() <= 1) {
    req.flash('error', 'Deve rimanere almeno un amministratore.');
    return res.redirect('/admin');
  }
  if (target.role !== role) {
    db.setUserRole(target.id, role);
    db.audit(req.user.id, role === 'admin' ? 'ruolo_admin_assegnato' : 'ruolo_admin_revocato', target.email);
    req.flash(
      'success',
      role === 'admin'
        ? `${target.name} ora è amministratore.`
        : `${target.name} non è più amministratore.`
    );
  }
  res.redirect(target.id === req.user.id && role === 'student' ? '/' : '/admin');
});

module.exports = { router };
