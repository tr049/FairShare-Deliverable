// seed.js — idempotent demo data. Run with: node seed.js
// Creates the schema if missing (via db.js), wipes any previous demo cast,
// and reinserts it — so running it twice never duplicates anything.
// All amounts are integer fils (100 fils = 1 AED).

const bcrypt = require('bcryptjs');
const db = require('./db');

const DEMO_PASSWORD = 'demo1234';
const DEMO_EMAILS = ['sara@flat12.ae', 'omar@flat12.ae', 'lina@flat12.ae'];

const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
const insertGroup = db.prepare('INSERT INTO groups (name, simplify_debts, created_at) VALUES (?, ?, ?)');
const insertMember = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
const insertExpense = db.prepare(
  `INSERT INTO expenses (group_id, description, amount_fils, date, category, payer_id, split_method, created_by, created_at, last_edited_by, last_edited_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertSplit = db.prepare('INSERT INTO expense_splits (expense_id, user_id, amount_fils) VALUES (?, ?, ?)');
const insertSettlement = db.prepare(
  `INSERT INTO settlements (group_id, payer_id, payee_id, amount_fils, date, created_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// splits: [[userId, fils], ...] in participant order (order is meaningful —
// the earliest participant carries any extra remainder fil).
function addExpense(groupId, e) {
  const info = insertExpense.run(
    groupId,
    e.description,
    e.amount,
    e.date,
    e.category || 'general',
    e.payer,
    e.method,
    e.createdBy,
    e.createdAt,
    e.editedBy || null,
    e.editedAt || null
  );
  for (const [userId, fils] of e.splits) insertSplit.run(info.lastInsertRowid, userId, fils);
}

const seed = db.transaction(() => {
  // 1. Remove any previous demo run: the demo users' groups, then the users.
  const oldIds = db
    .prepare('SELECT id FROM users WHERE email IN (?, ?, ?)')
    .all(...DEMO_EMAILS)
    .map((r) => r.id);
  if (oldIds.length > 0) {
    const marks = oldIds.map(() => '?').join(',');
    const oldGroupIds = db
      .prepare(`SELECT DISTINCT group_id FROM group_members WHERE user_id IN (${marks})`)
      .all(...oldIds)
      .map((r) => r.group_id);
    for (const gid of oldGroupIds) {
      db.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)').run(gid);
      db.prepare('DELETE FROM expenses WHERE group_id = ?').run(gid);
      db.prepare('DELETE FROM settlements WHERE group_id = ?').run(gid);
      db.prepare('DELETE FROM group_members WHERE group_id = ?').run(gid);
      db.prepare('DELETE FROM groups WHERE id = ?').run(gid);
    }
    db.prepare(`DELETE FROM users WHERE id IN (${marks})`).run(...oldIds);
  }

  // 2. The demo cast.
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const sara = Number(insertUser.run('Sara Haddad', 'sara@flat12.ae', hash, '2026-05-01T09:00:00Z').lastInsertRowid);
  const omar = Number(insertUser.run('Omar Farouk', 'omar@flat12.ae', hash, '2026-05-01T09:05:00Z').lastInsertRowid);
  const lina = Number(insertUser.run('Lina Khoury', 'lina@flat12.ae', hash, '2026-05-01T09:10:00Z').lastInsertRowid);

  // 3. "Flat 12" — the housemates' ledger, simplify off.
  const flat = Number(insertGroup.run('Flat 12', 0, '2026-05-02T18:04:00Z').lastInsertRowid);
  for (const u of [sara, omar, lina]) insertMember.run(flat, u);

  // AED 100.00 split equally three ways -> 3334 / 3333 / 3333 fils.
  addExpense(flat, {
    description: 'DEWA bill',
    amount: 10000,
    date: '2026-06-01',
    category: 'utilities',
    payer: sara,
    method: 'equal',
    splits: [[sara, 3334], [omar, 3333], [lina, 3333]],
    createdBy: sara,
    createdAt: '2026-06-01T20:15:00Z',
    editedBy: omar,
    editedAt: '2026-06-02T08:03:00Z',
  });
  addExpense(flat, {
    description: 'Dinner at Ravi',
    amount: 18650,
    date: '2026-06-03',
    category: 'food',
    payer: omar,
    method: 'exact',
    splits: [[omar, 9000], [lina, 9650]],
    createdBy: omar,
    createdAt: '2026-06-03T21:30:00Z',
  });
  addExpense(flat, {
    description: 'Carrefour groceries',
    amount: 7425,
    date: '2026-06-07',
    category: 'groceries',
    payer: lina,
    method: 'equal',
    splits: [[sara, 3713], [lina, 3712]],
    createdBy: lina,
    createdAt: '2026-06-07T11:20:00Z',
  });
  // Omar clears his DEWA share with Sara.
  insertSettlement.run(flat, omar, sara, 3333, '2026-06-05', omar, '2026-06-05T17:40:00Z');

  // 4. "Dubai trip" — simplify debts ON, so balances show the minimal plan.
  const trip = Number(insertGroup.run('Dubai trip', 1, '2026-05-20T09:12:00Z').lastInsertRowid);
  for (const u of [sara, omar, lina]) insertMember.run(trip, u);

  addExpense(trip, {
    description: 'Desert safari',
    amount: 45000,
    date: '2026-05-22',
    category: 'entertainment',
    payer: sara,
    method: 'equal',
    splits: [[sara, 15000], [omar, 15000], [lina, 15000]],
    createdBy: sara,
    createdAt: '2026-05-22T19:00:00Z',
  });
  addExpense(trip, {
    description: 'Brunch at the villa',
    amount: 24000,
    date: '2026-05-23',
    category: 'food',
    payer: omar,
    method: 'equal',
    splits: [[sara, 8000], [omar, 8000], [lina, 8000]],
    createdBy: omar,
    createdAt: '2026-05-23T14:45:00Z',
  });
});

seed();

console.log('Seeded: 3 users, 2 groups (Flat 12, Dubai trip), 5 expenses, 1 settlement.');
console.log('');
console.log('Demo login: sara@flat12.ae / demo1234');
console.log('Also:       omar@flat12.ae / demo1234');
console.log('            lina@flat12.ae / demo1234');
