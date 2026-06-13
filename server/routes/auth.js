// routes/auth.js — signup, login, and session restore.
// Passwords are hashed with bcryptjs; tokens are JWTs signed by this backend.
// There is deliberately no logout endpoint — the client just drops its token.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { nowIso, sendError } = require('../lib/helpers');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

// POST /auth/signup — create an account and start a session.
router.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return sendError(res, 400, 'validation', 'Name is required.');
  }
  if (name.trim().length > 120) {
    return sendError(res, 400, 'validation', 'Name must be 120 characters or fewer.');
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return sendError(res, 400, 'validation', 'A valid email is required.');
  }
  if (typeof password !== 'string' || password.length < 6) {
    return sendError(res, 400, 'validation', 'Password must be at least 6 characters.');
  }

  const normalEmail = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalEmail)) {
    return sendError(res, 409, 'email_taken', 'An account with this email already exists.');
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  let info;
  try {
    info = db
      .prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(name.trim(), normalEmail, passwordHash, nowIso());
  } catch (err) {
    // Concurrent duplicate signup: the SELECT above raced the INSERT.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(res, 409, 'email_taken', 'An account with this email already exists.');
    }
    throw err;
  }
  const user = { id: Number(info.lastInsertRowid), name: name.trim(), email: normalEmail };
  res.status(201).json({ access_token: issueToken(user.id), user });
});

// POST /auth/login — exchange credentials for a session token.
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const normalEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const user = normalEmail ? db.prepare('SELECT * FROM users WHERE email = ?').get(normalEmail) : null;
  if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
    return sendError(res, 401, 'invalid_credentials', 'Invalid email or password.');
  }
  res.json({
    access_token: issueToken(user.id),
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// GET /auth/me — return the authenticated user (session restore on app load).
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.user.id);
  if (!user) return sendError(res, 401, 'unauthorized', 'Invalid or expired token.');
  res.json({ user });
});

// PUT /auth/me — update the caller's display name. Names are joined at read
// time everywhere, so a rename propagates instantly across every group.
router.put('/me', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return sendError(res, 400, 'validation', 'Name is required.');
  }
  if (name.trim().length > 120) {
    return sendError(res, 400, 'validation', 'Name must be 120 characters or fewer.');
  }
  const info = db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), req.user.id);
  if (info.changes === 0) return sendError(res, 401, 'unauthorized', 'Invalid or expired token.');
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// PUT /auth/me/password — change the caller's password. Requires the current
// password (400 wrong_password on mismatch — 401 stays reserved for token
// failures). Existing JWTs stay valid: the token encodes only { id }.
router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (typeof new_password !== 'string' || new_password.length < 6) {
    return sendError(res, 400, 'validation', 'New password must be at least 6 characters.');
  }
  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) return sendError(res, 401, 'unauthorized', 'Invalid or expired token.');
  if (typeof current_password !== 'string' || !bcrypt.compareSync(current_password, user.password_hash)) {
    return sendError(res, 400, 'wrong_password', 'Current password is incorrect.');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), user.id);
  res.status(204).end();
});

module.exports = router;
