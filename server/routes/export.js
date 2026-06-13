// routes/export.js — GET /groups/:groupId/export: the group ledger as a CSV
// download. Mounted after the membership check (non-members get the usual
// 404 JSON). This is the contract's only non-JSON success response: amounts
// are AED decimal strings with two decimals because the file is a display
// artifact — internal math everywhere else stays integer fils.

const db = require('../db');
const { formatAed, userRef } = require('../lib/helpers');

const HEADER = 'type,date,description,category,amount_aed,payer,participants,created_by,created_at';

// RFC 4180: double-quote any field containing commas, quotes, or newlines;
// escape inner quotes by doubling them. Before quoting, any value that begins
// with =, +, -, @, tab, or CR gets a single apostrophe prefix so user-supplied
// text can never execute as a spreadsheet formula (CSV injection hardening,
// per the contract's export notes).
function csvField(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// "Flat 12 — Marina" -> "flat-12-marina". Falls back to "group" if the name
// slugifies to nothing.
function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'group';
}

function userName(id) {
  const u = userRef(id);
  return u ? u.name : '';
}

// GET /groups/:groupId/export
function groupExport(req, res) {
  const expenses = db.prepare('SELECT * FROM expenses WHERE group_id = ?').all(req.groupId);
  const settlements = db.prepare('SELECT * FROM settlements WHERE group_id = ?').all(req.groupId);
  const splitsStmt = db.prepare(
    'SELECT user_id, amount_fils FROM expense_splits WHERE expense_id = ? ORDER BY id'
  );

  const rows = [];

  for (const e of expenses) {
    const participants = splitsStmt
      .all(e.id)
      .map((s) => `${userName(s.user_id)}: ${formatAed(s.amount_fils)}`)
      .join('; ');
    rows.push({
      date: e.date,
      created_at: e.created_at,
      id: e.id,
      cells: [
        'expense',
        e.date,
        e.description,
        e.category,
        formatAed(e.amount_fils),
        userName(e.payer_id),
        participants,
        userName(e.created_by),
        e.created_at,
      ],
    });
  }

  for (const s of settlements) {
    const payer = userName(s.payer_id);
    const payee = userName(s.payee_id);
    rows.push({
      date: s.date,
      created_at: s.created_at,
      id: s.id,
      cells: [
        'settlement',
        s.date,
        `Payment: ${payer} -> ${payee}`,
        '', // settlements carry no category
        formatAed(s.amount_fils),
        payer,
        `${payee}: ${formatAed(s.amount_fils)}`,
        userName(s.created_by),
        s.created_at,
      ],
    });
  }

  // Newest date first; ties broken by newest created, then highest id —
  // the same ordering rule the JSON list endpoints use.
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return b.id - a.id;
  });

  const lines = [HEADER, ...rows.map((r) => r.cells.map(csvField).join(','))];
  const csv = lines.join('\n') + '\n';

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${slugify(req.group.name)}-ledger.csv"`);
  res.send(csv);
}

module.exports = { groupExport };
