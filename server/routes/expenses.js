// routes/expenses.js — expense CRUD inside a group.
// Mounted at /groups/:groupId/expenses after the membership check, so every
// handler can trust req.user and req.groupId. POST and PUT share the same
// validation; PUT additionally stamps last_edited_by / last_edited_at.

const express = require('express');
const db = require('../db');
const { nowIso, formatAed, isValidDate, parseId, userRef, sendError } = require('../lib/helpers');
const { groupMembers } = require('../lib/balances');

const router = express.Router({ mergeParams: true });

// The contract's fixed category list. Optional on create/edit; defaults to
// 'general'; anything outside the list is a 400 validation.
const CATEGORIES = [
  'general',
  'food',
  'groceries',
  'transport',
  'utilities',
  'rent',
  'entertainment',
  'travel',
  'other',
];

// Equal split: floor(amount/n) each, then +1 fil to the earliest entries of
// participant_ids, in submitted order, until the remainder is gone.
// 10000 over [a, b, c] -> a: 3334, b: 3333, c: 3333.
function equalSplits(amount, participantIds) {
  const n = participantIds.length;
  const base = Math.floor(amount / n);
  const remainder = amount - base * n;
  return participantIds.map((userId, i) => ({
    user_id: userId,
    amount_fils: base + (i < remainder ? 1 : 0),
  }));
}

// Validates the request body against the contract and the group's current
// members. Returns the clean expense data (splits in submitted order), or
// sends the 400 itself and returns null.
function validateExpense(req, res) {
  const body = req.body || {};

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description === '') {
    sendError(res, 400, 'validation', 'Description is required.');
    return null;
  }

  const amount = body.amount_fils;
  if (!Number.isInteger(amount) || amount < 1) {
    sendError(res, 400, 'validation', 'amount_fils must be an integer of at least 1 (money is integer fils).');
    return null;
  }

  if (!isValidDate(body.date)) {
    sendError(res, 400, 'validation', 'date must be a valid YYYY-MM-DD date.');
    return null;
  }

  let category = 'general';
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !CATEGORIES.includes(body.category)) {
      sendError(res, 400, 'validation', `category must be one of: ${CATEGORIES.join(', ')}.`);
      return null;
    }
    category = body.category;
  }

  const memberIds = new Set(groupMembers(req.groupId).map((m) => m.id));
  if (!Number.isInteger(body.payer_id) || !memberIds.has(body.payer_id)) {
    sendError(res, 400, 'validation', 'payer_id must be a group member.');
    return null;
  }

  const base = { description, amount_fils: amount, date: body.date, category, payer_id: body.payer_id };

  if (body.split_method === 'equal') {
    const ids = body.participant_ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      sendError(res, 400, 'validation', 'At least one participant is required.');
      return null;
    }
    if (ids.some((id) => !Number.isInteger(id) || !memberIds.has(id))) {
      sendError(res, 400, 'validation', 'Every participant must be a group member.');
      return null;
    }
    if (new Set(ids).size !== ids.length) {
      sendError(res, 400, 'validation', 'Duplicate participants are not allowed.');
      return null;
    }
    return { ...base, split_method: 'equal', splits: equalSplits(amount, ids) };
  }

  if (body.split_method === 'exact') {
    const splits = body.splits;
    if (!Array.isArray(splits) || splits.length === 0) {
      sendError(res, 400, 'validation', 'At least one participant is required.');
      return null;
    }
    for (const s of splits) {
      if (!s || !Number.isInteger(s.user_id) || !memberIds.has(s.user_id)) {
        sendError(res, 400, 'validation', 'Every participant must be a group member.');
        return null;
      }
      if (!Number.isInteger(s.amount_fils) || s.amount_fils < 1) {
        sendError(res, 400, 'validation', 'Each split amount_fils must be an integer of at least 1.');
        return null;
      }
    }
    if (new Set(splits.map((s) => s.user_id)).size !== splits.length) {
      sendError(res, 400, 'validation', 'Duplicate participants are not allowed.');
      return null;
    }
    const total = splits.reduce((sum, s) => sum + s.amount_fils, 0);
    if (total !== amount) {
      sendError(
        res,
        400,
        'splits_mismatch',
        `Splits must sum to the expense amount. AED ${formatAed(amount - total)} left to assign.`
      );
      return null;
    }
    return {
      ...base,
      split_method: 'exact',
      splits: splits.map((s) => ({ user_id: s.user_id, amount_fils: s.amount_fils })),
    };
  }

  sendError(res, 400, 'validation', "split_method must be 'equal' or 'exact'.");
  return null;
}

const insertSplitStmt = db.prepare(
  'INSERT INTO expense_splits (expense_id, user_id, amount_fils) VALUES (?, ?, ?)'
);

// The full expense object, exactly as the contract shows it.
// Splits come back in submitted order (insertion order = ascending split id).
function expenseJson(expenseId) {
  const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
  const splits = db
    .prepare('SELECT user_id, amount_fils FROM expense_splits WHERE expense_id = ? ORDER BY id')
    .all(expenseId);
  return {
    id: e.id,
    description: e.description,
    amount_fils: e.amount_fils,
    date: e.date,
    category: e.category,
    split_method: e.split_method,
    payer: userRef(e.payer_id),
    splits: splits.map((s) => ({ user: userRef(s.user_id), amount_fils: s.amount_fils })),
    created_by: userRef(e.created_by),
    created_at: e.created_at,
    last_edited_by: e.last_edited_by ? userRef(e.last_edited_by) : null,
    last_edited_at: e.last_edited_at,
  };
}

function findExpense(req) {
  const id = parseId(req.params.expenseId);
  if (!id) return null;
  return db.prepare('SELECT id FROM expenses WHERE id = ? AND group_id = ?').get(id, req.groupId);
}

// GET /groups/:groupId/expenses — newest date first, ties by newest created.
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id FROM expenses WHERE group_id = ? ORDER BY date DESC, created_at DESC, id DESC')
    .all(req.groupId);
  res.json({ expenses: rows.map((r) => expenseJson(r.id)) });
});

// POST /groups/:groupId/expenses — add an expense.
router.post('/', (req, res) => {
  const data = validateExpense(req, res);
  if (!data) return;
  const createExpense = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO expenses (group_id, description, amount_fils, date, category, payer_id, split_method, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.groupId, data.description, data.amount_fils, data.date, data.category, data.payer_id, data.split_method, req.user.id, nowIso());
    for (const s of data.splits) insertSplitStmt.run(info.lastInsertRowid, s.user_id, s.amount_fils);
    return Number(info.lastInsertRowid);
  });
  res.status(201).json(expenseJson(createExpense()));
});

// GET /groups/:groupId/expenses/:expenseId — one expense (edit-form fetch).
router.get('/:expenseId', (req, res) => {
  const found = findExpense(req);
  if (!found) return sendError(res, 404, 'not_found', 'Expense not found.');
  res.json(expenseJson(found.id));
});

// PUT /groups/:groupId/expenses/:expenseId — edit; any member may edit any
// expense. Same validation as POST, then the audit fields are stamped.
router.put('/:expenseId', (req, res) => {
  const found = findExpense(req);
  if (!found) return sendError(res, 404, 'not_found', 'Expense not found.');
  const data = validateExpense(req, res);
  if (!data) return;
  db.transaction(() => {
    db.prepare(
      `UPDATE expenses
       SET description = ?, amount_fils = ?, date = ?, category = ?, payer_id = ?, split_method = ?, last_edited_by = ?, last_edited_at = ?
       WHERE id = ?`
    ).run(data.description, data.amount_fils, data.date, data.category, data.payer_id, data.split_method, req.user.id, nowIso(), found.id);
    db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(found.id);
    for (const s of data.splits) insertSplitStmt.run(found.id, s.user_id, s.amount_fils);
  })();
  res.json(expenseJson(found.id));
});

// DELETE /groups/:groupId/expenses/:expenseId — remove expense + its splits;
// balances recompute as if it never existed.
router.delete('/:expenseId', (req, res) => {
  const found = findExpense(req);
  if (!found) return sendError(res, 404, 'not_found', 'Expense not found.');
  db.transaction(() => {
    db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(found.id);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(found.id);
  })();
  res.status(204).end();
});

module.exports = router;
