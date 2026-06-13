// routes/balances.js — derived balances, never stored.
// groupBalances handles GET /groups/:groupId/balances (raw pairwise, or the
// greedy minimum-cash-flow plan when the group's simplify_debts is on —
// presentation only, the ledger is never mutated).
// overallRouter serves GET /balances/overall, the caller's dashboard rollup.

const express = require('express');
const db = require('../db');
const { userRef } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');
const { groupMembers, netsByUser, pairwiseMap, pairAmountOwedTo, rawPairs, simplifyPairs } = require('../lib/balances');

// GET /groups/:groupId/balances (runs after requireAuth + requireMembership)
function groupBalances(req, res) {
  const members = groupMembers(req.groupId);
  const memberRefs = members.map((m) => ({ id: m.id, name: m.name }));
  const nets = netsByUser(req.groupId);
  const simplify = !!req.group.simplify_debts;

  res.json({
    simplify_debts: simplify,
    members: memberRefs.map((m) => ({ user: m, net_fils: nets.get(m.id) || 0 })),
    pairs: simplify ? simplifyPairs(memberRefs, nets) : rawPairs(req.groupId, memberRefs),
  });
}

// GET /balances/overall — total net, net per group, and a per-person rollup
// netting raw pairwise balances across all shared groups (simplify toggles
// are ignored here by design).
const overallRouter = express.Router();
overallRouter.use(requireAuth);

overallRouter.get('/overall', (req, res) => {
  const me = req.user.id;
  const myGroups = db
    .prepare(
      `SELECT g.id, g.name
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
       ORDER BY g.id`
    )
    .all(me);

  const groups = [];
  const peopleTotals = new Map(); // userId -> fils they owe the caller

  for (const g of myGroups) {
    const nets = netsByUser(g.id);
    groups.push({ id: g.id, name: g.name, net_fils: nets.get(me) || 0 });

    const pairs = pairwiseMap(g.id);
    for (const member of groupMembers(g.id)) {
      if (member.id === me) continue;
      const owesMe = pairAmountOwedTo(pairs, me, member.id);
      peopleTotals.set(member.id, (peopleTotals.get(member.id) || 0) + owesMe);
    }
  }

  const people = [...peopleTotals.entries()]
    .filter(([, fils]) => fils !== 0)
    .sort((a, b) => a[0] - b[0])
    .map(([userId, fils]) => ({ user: userRef(userId), net_fils: fils }));

  res.json({
    total_net_fils: groups.reduce((sum, g) => sum + g.net_fils, 0),
    groups,
    people,
  });
});

module.exports = { groupBalances, overallRouter };
