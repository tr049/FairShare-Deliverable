// Removes QA-created rows from data.db after a test run so the seeded demo
// data is exactly what the PM sees. Safe to run any time: it only targets
// names/emails the QA scripts generate ("QA Trip ..." groups, qa-*@example.com
// users). Run from server/: node tests/cleanup-qa-data.js
// Also sweeps the security-engineer's pen-test artifacts (VictimGroup-*,
// SQLi/XSS-named groups, attacker-*/victim-*/mass-*/xss-* users) so the DB
// ends a run holding exactly the seeded demo data.
const db = require('../db');

const groups = db
  .prepare(
    `SELECT id, name FROM groups
     WHERE name LIKE 'QA Trip %' OR name LIKE 'QA Villa %'
        OR name LIKE 'VictimGroup-%' OR name LIKE '%DROP TABLE%' OR name LIKE '%onerror%'`
  )
  .all();
for (const g of groups) {
  db.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)').run(g.id);
  db.prepare('DELETE FROM expenses WHERE group_id = ?').run(g.id);
  db.prepare('DELETE FROM settlements WHERE group_id = ?').run(g.id);
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(g.id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  console.log(`removed group ${g.id} (${g.name})`);
}

const users = db
  .prepare(
    `SELECT id, email FROM users
     WHERE email LIKE 'qa-%@example.com'
        OR email LIKE 'attacker-%@example.com' OR email LIKE 'victim-%@example.com'
        OR email LIKE 'mass-%@example.com' OR email LIKE 'xss-%@example.com'`
  )
  .all();
for (const u of users) {
  db.prepare('DELETE FROM group_members WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  console.log(`removed user ${u.id} (${u.email})`);
}
console.log('cleanup done');
