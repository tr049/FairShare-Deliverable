// middleware/auth.js — Bearer-token verification for protected routes.
// The JWT is self-issued by this backend (local data layer): signed and
// verified with JWT_SECRET, which defaults to a baked-in dev secret so the
// app needs no .env to run.

const jwt = require('jsonwebtoken');
const { sendError } = require('../lib/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'sprint-zero-dev-secret';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return sendError(res, 401, 'unauthorized', 'Invalid or expired token.');
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch (err) {
    sendError(res, 401, 'unauthorized', 'Invalid or expired token.');
  }
}

module.exports = { requireAuth, JWT_SECRET };
