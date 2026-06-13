// routes/activity.js — the group's derived activity feed, newest first.
// No stored activity table: one expense_added per expense, one expense_edited
// per edited expense (latest edit only), one settlement per settlement.
// Deleted expenses vanish from the feed. Summary strings are server-built
// exactly in the contract's formats.

const db = require('../db');
const { formatAed, userRef } = require('../lib/helpers');

// GET /groups/:groupId/activity (runs after requireAuth + requireMembership)
function groupActivity(req, res) {
  const entries = [];

  const expenses = db.prepare('SELECT * FROM expenses WHERE group_id = ?').all(req.groupId);
  for (const e of expenses) {
    const creator = userRef(e.created_by);
    entries.push({
      type: 'expense_added',
      timestamp: e.created_at,
      actor: creator,
      summary: `${creator.name} added '${e.description}' — AED ${formatAed(e.amount_fils)}`,
      amount_fils: e.amount_fils,
      expense_id: e.id,
    });
    if (e.last_edited_at) {
      const editor = userRef(e.last_edited_by);
      entries.push({
        type: 'expense_edited',
        timestamp: e.last_edited_at,
        actor: editor,
        summary: `${editor.name} edited '${e.description}'`,
        amount_fils: e.amount_fils,
        expense_id: e.id,
      });
    }
  }

  const settlements = db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(req.groupId);
  for (const s of settlements) {
    const payer = userRef(s.payer_id);
    const payee = userRef(s.payee_id);
    entries.push({
      type: 'settlement',
      timestamp: s.created_at,
      actor: payer,
      summary: `${payer.name} paid ${payee.name} AED ${formatAed(s.amount_fils)}`,
      amount_fils: s.amount_fils,
      settlement_id: s.id,
    });
  }

  // ISO UTC timestamps of equal length sort correctly as strings.
  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  res.json({ activity: entries });
}

module.exports = { groupActivity };
