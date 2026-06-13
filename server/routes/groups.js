// routes/groups.js — group CRUD and membership, plus the per-group mount
// point for expenses, settlements, balances, and activity. Everything under
// /groups/:groupId passes the membership check first (404 for outsiders).

const express = require('express');
const db = require('../db');
const { nowIso, parseId, sendError } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');
const { requireMembership } = require('../middleware/membership');
const { groupMembers, netsByUser } = require('../lib/balances');
const expensesRouter = require('./expenses');
const settlementsRouter = require('./settlements');
const { groupBalances } = require('./balances');
const { groupActivity } = require('./activity');
const { groupExport } = require('./export');

const router = express.Router();
router.use(requireAuth);

// GET /groups — the caller's groups only.
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.simplify_debts, g.created_at,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
       ORDER BY g.id`
    )
    .all(req.user.id);
  res.json({
    groups: rows.map((g) => ({
      id: g.id,
      name: g.name,
      simplify_debts: !!g.simplify_debts,
      member_count: g.member_count,
      created_at: g.created_at,
    })),
  });
});

// POST /groups — create a group; the caller becomes its first member.
router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return sendError(res, 400, 'validation', 'Group name is required.');
  }
  const createdAt = nowIso();
  const createGroup = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO groups (name, simplify_debts, created_at) VALUES (?, 0, ?)')
      .run(name.trim(), createdAt);
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(info.lastInsertRowid, req.user.id);
    return Number(info.lastInsertRowid);
  });
  const id = createGroup();
  res.status(201).json({ id, name: name.trim(), simplify_debts: false, member_count: 1, created_at: createdAt });
});

// --- everything below is scoped to one group the caller belongs to ---

const groupRouter = express.Router({ mergeParams: true });
groupRouter.use(requireMembership);

function groupDetail(groupId) {
  const g = db.prepare('SELECT id, name, simplify_debts, created_at FROM groups WHERE id = ?').get(groupId);
  return {
    id: g.id,
    name: g.name,
    simplify_debts: !!g.simplify_debts,
    created_at: g.created_at,
    members: groupMembers(groupId),
  };
}

// GET /groups/:groupId — detail with members.
groupRouter.get('/', (req, res) => {
  res.json(groupDetail(req.groupId));
});

// PUT /groups/:groupId — rename and/or set the simplify-debts toggle.
groupRouter.put('/', (req, res) => {
  const body = req.body || {};
  if ('name' in body && (typeof body.name !== 'string' || body.name.trim() === '')) {
    return sendError(res, 400, 'validation', 'Group name is required.');
  }
  if ('simplify_debts' in body && typeof body.simplify_debts !== 'boolean') {
    return sendError(res, 400, 'validation', 'simplify_debts must be true or false.');
  }
  if ('name' in body) {
    db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(body.name.trim(), req.groupId);
  }
  if ('simplify_debts' in body) {
    db.prepare('UPDATE groups SET simplify_debts = ? WHERE id = ?').run(body.simplify_debts ? 1 : 0, req.groupId);
  }
  res.json(groupDetail(req.groupId));
});

// DELETE /groups/:groupId — delete the group and cascade its ledger.
groupRouter.delete('/', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)').run(req.groupId);
    db.prepare('DELETE FROM expenses WHERE group_id = ?').run(req.groupId);
    db.prepare('DELETE FROM settlements WHERE group_id = ?').run(req.groupId);
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(req.groupId);
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.groupId);
  })();
  res.status(204).end();
});

// POST /groups/:groupId/members — add a registered user by email.
groupRouter.post('/members', (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || email.trim() === '') {
    return sendError(res, 400, 'validation', 'Email is required.');
  }
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    return sendError(res, 404, 'user_not_found', 'No account with that email — they need to sign up first.');
  }
  if (db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(req.groupId, user.id)) {
    return sendError(res, 409, 'already_member', 'Already a member.');
  }
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(req.groupId, user.id);
  res.status(201).json({ member: user });
});

// DELETE /groups/:groupId/members/:userId — remove a member whose net is
// exactly zero. History keeps referencing them; their name still renders.
groupRouter.delete('/members/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  const isMember =
    userId && db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(req.groupId, userId);
  if (!isMember) return sendError(res, 404, 'not_found', 'Member not found.');

  const nets = netsByUser(req.groupId);
  if ((nets.get(userId) || 0) !== 0) {
    return sendError(res, 409, 'balance_not_zero', "Settle up first — this member's balance isn't zero.");
  }
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.groupId, userId);
  res.status(204).end();
});

groupRouter.use('/expenses', expensesRouter);
groupRouter.use('/settlements', settlementsRouter);
groupRouter.get('/balances', groupBalances);
groupRouter.get('/activity', groupActivity);
groupRouter.get('/export', groupExport);

router.use('/:groupId', groupRouter);

module.exports = router;
