// middleware/membership.js — group scoping for every /groups/:groupId/... route.
// Non-members and unknown group ids get the exact same 404, so outsiders
// can't even learn that a group exists.

const db = require('../db');
const { parseId, sendError } = require('../lib/helpers');

function requireMembership(req, res, next) {
  const groupId = parseId(req.params.groupId);
  const group = groupId
    ? db.prepare('SELECT id, name, simplify_debts, created_at FROM groups WHERE id = ?').get(groupId)
    : null;
  const isMember =
    group && db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.id);

  if (!group || !isMember) {
    return sendError(res, 404, 'not_found', 'Group not found.');
  }
  req.groupId = groupId;
  req.group = group;
  next();
}

module.exports = { requireMembership };
