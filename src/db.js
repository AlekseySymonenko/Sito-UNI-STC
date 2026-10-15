'use strict';

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_login  TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  code        TEXT,
  teacher     TEXT,
  year        TEXT,
  description TEXT,
  color       INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,
  mime          TEXT NOT NULL,
  kind          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_course ON files(course_id);
CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploaded_by);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
`);

const one = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

const FILE_SELECT = `
  SELECT f.*, c.name AS course_name, c.color AS course_color,
         u.name AS uploader_name, u.email AS uploader_email
  FROM files f
  JOIN courses c ON c.id = f.course_id
  LEFT JOIN users u ON u.id = f.uploaded_by`;

module.exports = {
  db,

  // ---- Utenti -------------------------------------------------------------
  findUserById: (id) => one('SELECT * FROM users WHERE id = ?', id),
  findUserByEmail: (email) => one('SELECT * FROM users WHERE email = ?', email),

  /**
   * Crea o aggiorna l'utente dopo un login riuscito tramite SSO.
   * Nessuna password viene mai ricevuta o salvata: memorizziamo solo
   * l'identificativo univoco dell'IdP, l'email istituzionale e il nome.
   */
  upsertUserFromLogin({ subject, email, name }) {
    const bootstrapAdmin = config.adminEmails.includes(email);
    let user = one('SELECT * FROM users WHERE subject = ? OR email = ?', subject, email);
    if (user) {
      run(
        `UPDATE users SET subject = ?, email = ?, name = ?, last_login = datetime('now'),
           role = CASE WHEN ? THEN 'admin' ELSE role END
         WHERE id = ?`,
        subject, email, name, bootstrapAdmin ? 1 : 0, user.id
      );
    } else {
      run(
        `INSERT INTO users (subject, email, name, role, last_login)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        subject, email, name, bootstrapAdmin ? 'admin' : 'student'
      );
    }
    return one('SELECT * FROM users WHERE email = ?', email);
  },

  listUsers(q) {
    const like = `%${q || ''}%`;
    return all(
      `SELECT u.*, (SELECT COUNT(*) FROM files f WHERE f.uploaded_by = u.id) AS uploads
       FROM users u
       WHERE u.email LIKE ? OR u.name LIKE ?
       ORDER BY u.role = 'admin' DESC, u.name COLLATE NOCASE`,
      like, like
    );
  },
  countAdmins: () => one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").n,
  setUserRole: (id, role) => run('UPDATE users SET role = ? WHERE id = ?', role, id),

  // ---- Corsi --------------------------------------------------------------
  listCourses() {
    return all(
      `SELECT c.*, COUNT(f.id) AS file_count, MAX(f.created_at) AS last_upload
       FROM courses c LEFT JOIN files f ON f.course_id = c.id
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`
    );
  },
  findCourse: (id) =>
    one(
      `SELECT c.*, u.name AS creator_name FROM courses c
       LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ?`,
      id
    ),
  createCourse({ name, code, teacher, year, description, createdBy }) {
    const color = Number(one('SELECT COUNT(*) AS n FROM courses').n) % 8;
    const res = run(
      `INSERT INTO courses (name, code, teacher, year, description, color, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      name, code, teacher, year, description, color, createdBy
    );
    return Number(res.lastInsertRowid);
  },
  updateCourse(id, { name, code, teacher, year, description }) {
    run(
      'UPDATE courses SET name = ?, code = ?, teacher = ?, year = ?, description = ? WHERE id = ?',
      name, code, teacher, year, description, id
    );
  },
  deleteCourse: (id) => run('DELETE FROM courses WHERE id = ?', id),

  // ---- File ---------------------------------------------------------------
  findFile: (id) => one(`${FILE_SELECT} WHERE f.id = ?`, id),
  listFilesByCourse(courseId, { kind, q } = {}) {
    const params = [courseId];
    let where = 'f.course_id = ?';
    if (kind) { where += ' AND f.kind = ?'; params.push(kind); }
    if (q) {
      where += ' AND (f.title LIKE ? OR f.description LIKE ? OR f.original_name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    return all(`${FILE_SELECT} WHERE ${where} ORDER BY f.created_at DESC, f.id DESC`, ...params);
  },
  storedNamesByCourse: (courseId) =>
    all('SELECT stored_name FROM files WHERE course_id = ?', courseId),
  listRecentFiles: (limit = 8) =>
    all(`${FILE_SELECT} ORDER BY f.created_at DESC, f.id DESC LIMIT ?`, limit),
  listFilesByUser: (userId) =>
    all(`${FILE_SELECT} WHERE f.uploaded_by = ? ORDER BY f.created_at DESC, f.id DESC`, userId),
  searchFiles(q, kind) {
    const like = `%${q}%`;
    const params = [like, like, like, like];
    let extra = '';
    if (kind) { extra = ' AND f.kind = ?'; params.push(kind); }
    return all(
      `${FILE_SELECT}
       WHERE (f.title LIKE ? OR f.description LIKE ? OR f.original_name LIKE ? OR c.name LIKE ?)${extra}
       ORDER BY f.created_at DESC LIMIT 200`,
      ...params
    );
  },
  insertFile(f) {
    const res = run(
      `INSERT INTO files (course_id, title, description, original_name, stored_name, mime, kind, size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      f.courseId, f.title, f.description, f.originalName, f.storedName, f.mime, f.kind, f.size, f.uploadedBy
    );
    return Number(res.lastInsertRowid);
  },
  deleteFile: (id) => run('DELETE FROM files WHERE id = ?', id),

  stats() {
    return one(
      `SELECT (SELECT COUNT(*) FROM courses) AS courses,
              (SELECT COUNT(*) FROM files) AS files,
              (SELECT COUNT(*) FROM users) AS users,
              (SELECT COALESCE(SUM(size), 0) FROM files) AS bytes`
    );
  },
  kindCounts: (courseId) =>
    all('SELECT kind, COUNT(*) AS n FROM files WHERE course_id = ? GROUP BY kind', courseId),

  // ---- Registro attività ---------------------------------------------------
  audit: (userId, action, details) =>
    run('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)', userId, action, details || null),
  listAudit: (limit = 50) =>
    all(
      `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`,
      limit
    ),
};
