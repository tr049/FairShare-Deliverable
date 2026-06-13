// lib/helpers.js — small shared utilities.
// Money stays in integer fils everywhere; formatAed only builds display
// strings (used for server-built activity summaries and error messages).

const db = require('../db');

// ISO 8601 UTC without milliseconds, e.g. "2026-06-01T20:15:00Z".
function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Today's date as "YYYY-MM-DD" (server date, UTC — consistent with timestamps).
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// 10000 -> "100.00", 650 -> "6.50", -500 -> "-5.00". Integer math only.
function formatAed(fils) {
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${cents}`;
}

// Strict "YYYY-MM-DD" check, including real calendar dates (no 2026-02-30).
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Strict integer id from a route param: "12" -> 12, "12abc"/"x" -> null.
function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  return Number(value);
}

// The { id, name } user embed used everywhere outside auth and member lists.
// Users are never deleted, so removed members keep rendering on history.
const userRefStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
function userRef(id) {
  return userRefStmt.get(id) || null;
}

// Every error in the API uses the contract shape { error, message }.
function sendError(res, status, code, message) {
  res.status(status).json({ error: code, message });
}

module.exports = { nowIso, todayDate, formatAed, isValidDate, parseId, userRef, sendError };
