'use strict';

const session = require('express-session');
const { db } = require('./db');

/** Store di sessione persistente su SQLite (nessuna dipendenza nativa). */
class SqliteStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?');
    this.setStmt = db.prepare(
      'INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data'
    );
    this.delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.pruneStmt = db.prepare('DELETE FROM sessions WHERE expires <= ?');
    this.timer = setInterval(() => this.pruneStmt.run(Date.now()), 15 * 60 * 1000);
    this.timer.unref();
  }

  static expiry(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + 24 * 3600 * 1000;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (err) { cb(err); }
  }

  set(sid, sess, cb) {
    try {
      this.setStmt.run(sid, SqliteStore.expiry(sess), JSON.stringify(sess));
      cb && cb(null);
    } catch (err) { cb && cb(err); }
  }

  destroy(sid, cb) {
    try { this.delStmt.run(sid); cb && cb(null); } catch (err) { cb && cb(err); }
  }

  touch(sid, sess, cb) {
    try { this.touchStmt.run(SqliteStore.expiry(sess), sid); cb && cb(null); } catch (err) { cb && cb(err); }
  }
}

module.exports = SqliteStore;
