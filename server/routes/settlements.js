// routes/settlements.js — record and remove cash payments inside a group.
// Mounted at /groups/:groupId/settlements after the membership check.
// Settlements have no edit — corrections are delete + re-record.

const express = require('express');
const db = require('../db');
const { nowIso, todayDate, isValidDate, parseId, userRef, sendError } = require('../lib/helpers');
const { groupMembers } = require('../lib/balances');

const router = express.Router({ mergeParams: true });

function settlementJson(s) {
  return {
    id: s.id,
    payer: userRef(s.payer_id),
    payee: userRef(s.payee_id),
    amount_fils: s.amount_fils,
    date: s.date,
    created_by: userRef(s.created_by),
    created_at: s.created_at,
  };
}

// GET /groups/:groupId/settlements — newest first.
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM settlements WHERE group_id = ? ORDER BY date DESC, created_at DESC, id DESC')
    .all(req.groupId);
  res.json({ settlements: rows.map(settlementJson) });
});

// POST /groups/:groupId/settlements — record a payment. Any positive integer
// amount is a valid ledger entry (no maximum: overpayment flips the pair).
router.post('/', (req, res) => {
  const body = req.body || {};
  const memberIds = new Set(groupMembers(req.groupId).map((m) => m.id));

  if (!Number.isInteger(body.payer_id) || !memberIds.has(body.payer_id)) {
    return sendError(res, 400, 'validation', 'payer_id must be a group member.');
  }
  if (!Number.isInteger(body.payee_id) || !memberIds.has(body.payee_id)) {
    return sendError(res, 400, 'validation', 'payee_id must be a group member.');
  }
  if (body.payer_id === body.payee_id) {
    return sendError(res, 400, 'validation', 'Payer and payee must be different members.');
  }
  if (!Number.isInteger(body.amount_fils) || body.amount_fils < 1) {
    return sendError(res, 400, 'validation', 'amount_fils must be an integer of at least 1 (money is integer fils).');
  }

  let date = body.date;
  if (date === undefined || date === null) {
    date = todayDate(); // omitted -> defaults to today (server date)
  } else if (!isValidDate(date)) {
    return sendError(res, 400, 'validation', 'date must be a valid YYYY-MM-DD date.');
  }

  const info = db
    .prepare(
      `INSERT INTO settlements (group_id, payer_id, payee_id, amount_fils, date, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.groupId, body.payer_id, body.payee_id, body.amount_fils, date, req.user.id, nowIso());
  const created = db.prepare('SELECT * FROM settlements WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(settlementJson(created));
});

// DELETE /groups/:groupId/settlements/:settlementId — remove a wrong entry.
router.delete('/:settlementId', (req, res) => {
  const id = parseId(req.params.settlementId);
  const found = id
    ? db.prepare('SELECT id FROM settlements WHERE id = ? AND group_id = ?').get(id, req.groupId)
    : null;
  if (!found) return sendError(res, 404, 'not_found', 'Settlement not found.');
  db.prepare('DELETE FROM settlements WHERE id = ?').run(found.id);
  res.status(204).end();
});

module.exports = router;
