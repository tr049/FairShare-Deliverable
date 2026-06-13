// lib/balances.js — all derived-balance math, in integer fils.
// Balances are never stored: every function here recomputes from expenses,
// splits, and settlements at read time, per the contract's ledger rules.

const db = require('../db');

// Current members of a group as [{ id, name, email }], ordered by user id.
function groupMembers(groupId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY u.id`
    )
    .all(groupId);
}

// Net fils per user in a group:
// paid − own splits + settlements paid − settlements received.
// Returns a Map(userId -> net). Covers everyone in the ledger; callers read
// the entries for current members (nets across a group always sum to 0).
function netsByUser(groupId) {
  const nets = new Map();
  const add = (id, delta) => nets.set(id, (nets.get(id) || 0) + delta);

  const paid = db
    .prepare('SELECT payer_id AS id, SUM(amount_fils) AS s FROM expenses WHERE group_id = ? GROUP BY payer_id')
    .all(groupId);
  for (const r of paid) add(r.id, r.s);

  const owed = db
    .prepare(
      `SELECT es.user_id AS id, SUM(es.amount_fils) AS s
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = ?
       GROUP BY es.user_id`
    )
    .all(groupId);
  for (const r of owed) add(r.id, -r.s);

  const settlePaid = db
    .prepare('SELECT payer_id AS id, SUM(amount_fils) AS s FROM settlements WHERE group_id = ? GROUP BY payer_id')
    .all(groupId);
  for (const r of settlePaid) add(r.id, r.s);

  const settleReceived = db
    .prepare('SELECT payee_id AS id, SUM(amount_fils) AS s FROM settlements WHERE group_id = ? GROUP BY payee_id')
    .all(groupId);
  for (const r of settleReceived) add(r.id, -r.s);

  return nets;
}

// Raw pairwise debts for a group: Map("lo:hi" -> fils the higher id owes the
// lower id; negative means the lower id owes the higher id).
// A split on someone else's expense creates debt toward the payer; a
// settlement reduces the payer's debt to the payee (overpayment flips it).
function pairwiseMap(groupId) {
  const map = new Map();
  const addDebt = (ower, owee, fils) => {
    const lo = Math.min(ower, owee);
    const hi = Math.max(ower, owee);
    const signed = ower === hi ? fils : -fils; // stored as "hi owes lo"
    const key = `${lo}:${hi}`;
    map.set(key, (map.get(key) || 0) + signed);
  };

  const owedToPayer = db
    .prepare(
      `SELECT e.payer_id AS payer, es.user_id AS ower, SUM(es.amount_fils) AS s
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = ? AND es.user_id != e.payer_id
       GROUP BY e.payer_id, es.user_id`
    )
    .all(groupId);
  for (const r of owedToPayer) addDebt(r.ower, r.payer, r.s);

  const settlements = db
    .prepare(
      `SELECT payer_id, payee_id, SUM(amount_fils) AS s
       FROM settlements WHERE group_id = ? GROUP BY payer_id, payee_id`
    )
    .all(groupId);
  for (const r of settlements) addDebt(r.payer_id, r.payee_id, -r.s);

  return map;
}

// Signed pairwise amount `other` owes `me` in one group (raw, no simplify).
function pairAmountOwedTo(map, meId, otherId) {
  const lo = Math.min(meId, otherId);
  const hi = Math.max(meId, otherId);
  const v = map.get(`${lo}:${hi}`) || 0; // hi owes lo
  return otherId === hi ? v : -v;
}

// Raw pairs for the balances response: [{ from, to, amount_fils }] where
// `from` owes `to`. Zero pairs are omitted. memberRefs is [{ id, name }]
// sorted by id, which makes the output order deterministic.
function rawPairs(groupId, memberRefs) {
  const map = pairwiseMap(groupId);
  const pairs = [];
  for (let i = 0; i < memberRefs.length; i++) {
    for (let j = i + 1; j < memberRefs.length; j++) {
      const lo = memberRefs[i];
      const hi = memberRefs[j];
      const v = map.get(`${lo.id}:${hi.id}`) || 0; // positive: hi owes lo
      if (v > 0) pairs.push({ from: hi, to: lo, amount_fils: v });
      else if (v < 0) pairs.push({ from: lo, to: hi, amount_fils: -v });
    }
  }
  return pairs;
}

// Greedy minimum cash flow: repeatedly match the largest creditor with the
// largest debtor, emit a payment of the smaller magnitude, repeat until done.
// Ties break toward the lower user id, so the plan is deterministic. Produces
// at most (members − 1) payments and never changes anyone's net.
function simplifyPairs(memberRefs, nets) {
  const creditors = [];
  const debtors = [];
  for (const m of memberRefs) {
    const n = nets.get(m.id) || 0;
    if (n > 0) creditors.push({ user: m, amount: n });
    else if (n < 0) debtors.push({ user: m, amount: -n });
  }

  const largest = (list) => {
    let best = list[0];
    for (const item of list) {
      if (item.amount > best.amount || (item.amount === best.amount && item.user.id < best.user.id)) {
        best = item;
      }
    }
    return best;
  };

  const pairs = [];
  while (creditors.length > 0 && debtors.length > 0) {
    const c = largest(creditors);
    const d = largest(debtors);
    const pay = Math.min(c.amount, d.amount);
    pairs.push({ from: d.user, to: c.user, amount_fils: pay });
    c.amount -= pay;
    d.amount -= pay;
    if (c.amount === 0) creditors.splice(creditors.indexOf(c), 1);
    if (d.amount === 0) debtors.splice(debtors.indexOf(d), 1);
  }
  return pairs;
}

module.exports = { groupMembers, netsByUser, pairwiseMap, pairAmountOwedTo, rawPairs, simplifyPairs };
