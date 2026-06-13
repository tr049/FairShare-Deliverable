// QA integration tests — Prod scope: every endpoint in docs/api-contract.md.
// Standalone fetch script: node tests/integration.test.js (backend must be
// running on http://localhost:3001 and seeded). Creates its own timestamped
// test users so it never collides with the seed or previous runs.

const BASE = 'http://localhost:3001';
const ts = Date.now();

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }
  return { status: res.status, data };
}

function isErrorShape(d) {
  return d && typeof d.error === 'string' && typeof d.message === 'string';
}

async function main() {
  const A = { name: 'QA Alpha', email: `qa-a-${ts}@example.com`, password: 'qa-pass-123' };
  const B = { name: 'QA Bravo', email: `qa-b-${ts}@example.com`, password: 'qa-pass-123' };
  const C = { name: 'QA Charlie', email: `qa-c-${ts}@example.com`, password: 'qa-pass-123' };

  console.log('\n-- auth --');
  let r = await req('POST', '/auth/signup', { body: A });
  check('signup A returns 201', r.status === 201, `got ${r.status}`);
  check('signup returns access_token + user {id,name,email}',
    r.data && typeof r.data.access_token === 'string' && r.data.user &&
    r.data.user.name === A.name && r.data.user.email === A.email &&
    Number.isInteger(r.data.user.id));
  const tokA = r.data.access_token; A.id = r.data.user.id;

  r = await req('POST', '/auth/signup', { body: B });
  B.id = r.data.user.id; const tokB = r.data.access_token;
  r = await req('POST', '/auth/signup', { body: C });
  C.id = r.data.user.id; const tokC = r.data.access_token;

  r = await req('POST', '/auth/signup', { body: A });
  check('duplicate signup -> 409 email_taken', r.status === 409 && r.data.error === 'email_taken' && isErrorShape(r.data),
    `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await req('POST', '/auth/signup', { body: { name: 'X', email: `qa-x-${ts}@example.com`, password: '123' } });
  check('short password -> 400 validation', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', '/auth/login', { body: { email: A.email, password: A.password } });
  check('login happy -> 200 with token + user', r.status === 200 && typeof r.data.access_token === 'string' && r.data.user.id === A.id);

  r = await req('POST', '/auth/login', { body: { email: A.email, password: 'wrong-password' } });
  check('wrong password -> 401 invalid_credentials', r.status === 401 && r.data.error === 'invalid_credentials' && isErrorShape(r.data));

  r = await req('GET', '/auth/me', { token: tokA });
  check('GET /auth/me -> 200 {user}', r.status === 200 && r.data.user && r.data.user.id === A.id && r.data.user.email === A.email);

  r = await req('GET', '/auth/me');
  check('missing token -> 401 {error,message}', r.status === 401 && isErrorShape(r.data));

  r = await req('GET', '/groups', { token: 'totally-invalid-token' });
  check('invalid token on protected route -> 401 {error,message}', r.status === 401 && isErrorShape(r.data));

  console.log('\n-- groups --');
  r = await req('POST', '/groups', { token: tokA, body: { name: `QA Villa ${ts}` } });
  check('create group -> 201 with member_count 1, simplify_debts false',
    r.status === 201 && r.data.member_count === 1 && r.data.simplify_debts === false && Number.isInteger(r.data.id),
    JSON.stringify(r.data));
  const gid = r.data.id;

  r = await req('POST', '/groups', { token: tokA, body: { name: '   ' } });
  check('empty group name -> 400 validation', r.status === 400 && r.data.error === 'validation' && isErrorShape(r.data));

  r = await req('GET', '/groups', { token: tokA });
  check('GET /groups lists the new group', r.status === 200 && Array.isArray(r.data.groups) && r.data.groups.some((g) => g.id === gid));

  r = await req('GET', `/groups/${gid}`, { token: tokC });
  check('non-member group access -> 404 (never 403)', r.status === 404 && r.data.error === 'not_found', `got ${r.status}`);

  r = await req('GET', `/groups/${gid}`, { token: tokA });
  check('GET group detail -> 200 with members[] incl. email',
    r.status === 200 && Array.isArray(r.data.members) && r.data.members.length === 1 && r.data.members[0].email === A.email);

  r = await req('PUT', `/groups/${gid}`, { token: tokA, body: { name: `QA Villa ${ts} renamed` } });
  check('PUT group rename -> 200 updated detail', r.status === 200 && r.data.name === `QA Villa ${ts} renamed`);

  r = await req('PUT', `/groups/${gid}`, { token: tokA, body: { name: '' } });
  check('PUT empty name -> 400', r.status === 400 && r.data.error === 'validation');

  console.log('\n-- members --');
  r = await req('POST', `/groups/${gid}/members`, { token: tokA, body: { email: B.email } });
  check('add member B -> 201 {member}', r.status === 201 && r.data.member && r.data.member.id === B.id && r.data.member.email === B.email);

  r = await req('POST', `/groups/${gid}/members`, { token: tokA, body: { email: `nobody-${ts}@example.com` } });
  check('add unknown email -> 404 user_not_found with contract message',
    r.status === 404 && r.data.error === 'user_not_found' &&
    r.data.message === 'No account with that email — they need to sign up first.',
    JSON.stringify(r.data));

  r = await req('POST', `/groups/${gid}/members`, { token: tokA, body: { email: B.email } });
  check('add existing member -> 409 already_member', r.status === 409 && r.data.error === 'already_member' && r.data.message === 'Already a member.');

  await req('POST', `/groups/${gid}/members`, { token: tokA, body: { email: C.email } });

  console.log('\n-- expenses --');
  // Equal-split remainder rule: 10000 across [A, B, C] -> 3334/3333/3333,
  // extra fil to the earliest participant_id entry.
  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokA,
    body: { description: 'QA groceries', amount_fils: 10000, date: '2026-06-10', payer_id: A.id, split_method: 'equal', participant_ids: [A.id, B.id, C.id] },
  });
  check('create equal expense -> 201', r.status === 201 && r.data.amount_fils === 10000);
  const exp1 = r.data.id;
  const splitAmounts = (r.data.splits || []).map((s) => `${s.user.id}:${s.amount_fils}`);
  check('equal split 10000/3 -> 3334,3333,3333 with extra fil to earliest participant',
    r.data.splits && r.data.splits.length === 3 &&
    r.data.splits[0].user.id === A.id && r.data.splits[0].amount_fils === 3334 &&
    r.data.splits[1].user.id === B.id && r.data.splits[1].amount_fils === 3333 &&
    r.data.splits[2].user.id === C.id && r.data.splits[2].amount_fils === 3333,
    splitAmounts.join(', '));
  check('new expense has null audit fields', r.data.last_edited_by === null && r.data.last_edited_at === null);

  r = await req('GET', `/groups/${gid}/expenses`, { token: tokB });
  check('GET expenses list (as member B) -> 200 incl. expense', r.status === 200 && r.data.expenses.some((e) => e.id === exp1));

  r = await req('GET', `/groups/${gid}/expenses/${exp1}`, { token: tokA });
  check('GET single expense -> 200 full object', r.status === 200 && r.data.id === exp1 && r.data.payer.id === A.id);

  r = await req('PUT', `/groups/${gid}/expenses/${exp1}`, {
    token: tokB,
    body: { description: 'QA groceries (edited)', amount_fils: 10000, date: '2026-06-10', payer_id: A.id, split_method: 'equal', participant_ids: [A.id, B.id, C.id] },
  });
  check('PUT expense -> 200 with last_edited_by = caller',
    r.status === 200 && r.data.last_edited_by && r.data.last_edited_by.id === B.id && typeof r.data.last_edited_at === 'string');

  // exact split mismatch: 10000 vs 5000+4500 -> AED 5.00 left to assign
  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokA,
    body: { description: 'QA dinner', amount_fils: 10000, date: '2026-06-11', payer_id: A.id, split_method: 'exact', splits: [{ user_id: A.id, amount_fils: 5000 }, { user_id: B.id, amount_fils: 4500 }] },
  });
  check('exact splits mismatch -> 400 splits_mismatch with "AED 5.00 left to assign"',
    r.status === 400 && r.data.error === 'splits_mismatch' && /AED 5\.00 left to assign/.test(r.data.message),
    JSON.stringify(r.data));

  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokA,
    body: { description: 'QA dinner', amount_fils: 9500, date: '2026-06-11', payer_id: A.id, split_method: 'exact', splits: [{ user_id: A.id, amount_fils: 5000 }, { user_id: B.id, amount_fils: 4500 }] },
  });
  check('create exact expense -> 201, splits in submitted order',
    r.status === 201 && r.data.split_method === 'exact' && r.data.splits[0].user.id === A.id && r.data.splits[1].amount_fils === 4500);
  const exp2 = r.data.id;

  r = await req('POST', `/groups/${gid}/expenses`, { token: tokA, body: { description: '  ', amount_fils: 100, date: '2026-06-11', payer_id: A.id, split_method: 'equal', participant_ids: [A.id] } });
  check('empty description -> 400', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', `/groups/${gid}/expenses`, { token: tokA, body: { description: 'x', amount_fils: 0, date: '2026-06-11', payer_id: A.id, split_method: 'equal', participant_ids: [A.id] } });
  check('amount_fils 0 -> 400', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', `/groups/${gid}/expenses`, { token: tokA, body: { description: 'x', amount_fils: 10.5, date: '2026-06-11', payer_id: A.id, split_method: 'equal', participant_ids: [A.id] } });
  check('non-integer amount -> 400', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', `/groups/${gid}/expenses`, { token: tokA, body: { description: 'x', amount_fils: 100, date: '2026-06-11', payer_id: A.id, split_method: 'equal', participant_ids: [] } });
  check('no participants -> 400', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', `/groups/${gid}/expenses`, { token: tokA, body: { description: 'x', amount_fils: 100, date: '2026-06-11', payer_id: 999999, split_method: 'equal', participant_ids: [A.id] } });
  check('payer not a member -> 400', r.status === 400 && r.data.error === 'validation');

  r = await req('GET', `/groups/${gid}/expenses`, { token: tokC });
  check('expense list ordering: newest date first', r.status === 200 && r.data.expenses[0].id === exp2 && r.data.expenses[1].id === exp1);

  console.log('\n-- balances --');
  // Ledger so far: exp1 A paid 10000 (A 3334, B 3333, C 3333); exp2 A paid 9500 (A 5000, B 4500).
  // Nets: A +11166? A paid 19500, owes 3334+5000=8334 -> +11166. B: -3333-4500 = -7833. C: -3333.
  r = await req('GET', `/groups/${gid}/balances`, { token: tokA });
  const nets = Object.fromEntries(r.data.members.map((m) => [m.user.id, m.net_fils]));
  check('group balances -> 200, simplify_debts false', r.status === 200 && r.data.simplify_debts === false);
  check('nets correct (A +11166, B -7833, C -3333)', nets[A.id] === 11166 && nets[B.id] === -7833 && nets[C.id] === -3333, JSON.stringify(nets));
  check('group nets sum to zero', r.data.members.reduce((s, m) => s + m.net_fils, 0) === 0);
  check('raw pairs: B->A 7833 and C->A 3333',
    r.data.pairs.length === 2 &&
    r.data.pairs.some((p) => p.from.id === B.id && p.to.id === A.id && p.amount_fils === 7833) &&
    r.data.pairs.some((p) => p.from.id === C.id && p.to.id === A.id && p.amount_fils === 3333),
    JSON.stringify(r.data.pairs));

  r = await req('PUT', `/groups/${gid}`, { token: tokA, body: { simplify_debts: true } });
  check('toggle simplify_debts on -> 200', r.status === 200 && r.data.simplify_debts === true);

  r = await req('GET', `/groups/${gid}/balances`, { token: tokA });
  const netsAfter = Object.fromEntries(r.data.members.map((m) => [m.user.id, m.net_fils]));
  check('simplified plan: nets unchanged, pairs cover all debt',
    r.data.simplify_debts === true &&
    netsAfter[A.id] === 11166 && netsAfter[B.id] === -7833 && netsAfter[C.id] === -3333 &&
    r.data.pairs.reduce((s, p) => s + p.amount_fils, 0) === 11166 &&
    r.data.pairs.length <= 2,
    JSON.stringify(r.data.pairs));
  await req('PUT', `/groups/${gid}`, { token: tokA, body: { simplify_debts: false } });

  r = await req('GET', '/balances/overall', { token: tokB });
  check('overall balances: total_net equals sum of group nets',
    r.status === 200 && r.data.total_net_fils === r.data.groups.reduce((s, g) => s + g.net_fils, 0));
  check('overall (B): owes A 7833 in people rollup',
    r.data.people.some((p) => p.user.id === A.id && p.net_fils === -7833), JSON.stringify(r.data.people));

  console.log('\n-- settlements --');
  r = await req('POST', `/groups/${gid}/settlements`, { token: tokC, body: { payer_id: C.id, payee_id: A.id, amount_fils: 0 } });
  check('settlement amount_fils 0 -> 400 validation', r.status === 400 && r.data.error === 'validation' && isErrorShape(r.data));

  r = await req('POST', `/groups/${gid}/settlements`, { token: tokC, body: { payer_id: C.id, payee_id: C.id, amount_fils: 100 } });
  check('payer == payee -> 400 validation', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', `/groups/${gid}/settlements`, { token: tokC, body: { payer_id: C.id, payee_id: A.id, amount_fils: 100, date: 'not-a-date' } });
  check('invalid date -> 400 validation', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', `/groups/${gid}/settlements`, { token: tokC, body: { payer_id: C.id, payee_id: A.id, amount_fils: 3333 } });
  check('settle C->A 3333 -> 201, date defaults to today',
    r.status === 201 && r.data.payer.id === C.id && r.data.payee.id === A.id && /^\d{4}-\d{2}-\d{2}$/.test(r.data.date));
  const settId = r.data.id;

  r = await req('GET', `/groups/${gid}/balances`, { token: tokA });
  check('after settlement: C net 0 and C->A pair gone',
    r.data.members.find((m) => m.user.id === C.id).net_fils === 0 &&
    !r.data.pairs.some((p) => p.from.id === C.id),
    JSON.stringify(r.data));
  check('nets still sum to zero after settlement', r.data.members.reduce((s, m) => s + m.net_fils, 0) === 0);

  r = await req('GET', `/groups/${gid}/settlements`, { token: tokB });
  check('GET settlements list -> 200 incl. new settlement', r.status === 200 && r.data.settlements.some((s) => s.id === settId));

  console.log('\n-- activity --');
  r = await req('GET', `/groups/${gid}/activity`, { token: tokA });
  const types = (r.data.activity || []).map((a) => a.type);
  check('activity has expense_added, expense_edited, settlement entries',
    r.status === 200 && types.includes('expense_added') && types.includes('expense_edited') && types.includes('settlement'), types.join(','));
  const added = r.data.activity.find((a) => a.type === 'expense_added' && a.expense_id === exp2);
  check('activity summary format exact', added && added.summary === `${A.name} added 'QA dinner' — AED 95.00`, added && added.summary);
  const sett = r.data.activity.find((a) => a.type === 'settlement');
  check('settlement summary format exact', sett && sett.summary === `${C.name} paid ${A.name} AED 33.33`, sett && sett.summary);
  const sorted = [...r.data.activity].every((a, i, arr) => i === 0 || arr[i - 1].timestamp >= a.timestamp);
  check('activity newest first', sorted);

  console.log('\n-- member removal rules --');
  r = await req('DELETE', `/groups/${gid}/members/${B.id}`, { token: tokA });
  check('remove member with non-zero balance -> 409 balance_not_zero',
    r.status === 409 && r.data.error === 'balance_not_zero' &&
    r.data.message === "Settle up first — this member's balance isn't zero.", JSON.stringify(r.data));

  r = await req('DELETE', `/groups/${gid}/members/${C.id}`, { token: tokA });
  check('remove zero-balance member C -> 204', r.status === 204);

  r = await req('GET', `/groups/${gid}`, { token: tokC });
  check('removed member loses access -> 404', r.status === 404);

  console.log('\n-- deletes & cleanup --');
  r = await req('DELETE', `/groups/${gid}/settlements/${settId}`, { token: tokA });
  check('DELETE settlement -> 204', r.status === 204);

  r = await req('DELETE', `/groups/${gid}/expenses/${exp2}`, { token: tokA });
  check('DELETE expense -> 204', r.status === 204);
  r = await req('GET', `/groups/${gid}/expenses/${exp2}`, { token: tokA });
  check('deleted expense -> 404', r.status === 404 && r.data.error === 'not_found');

  r = await req('DELETE', `/groups/${gid}`, { token: tokA });
  check('DELETE group -> 204', r.status === 204);
  r = await req('GET', `/groups/${gid}`, { token: tokA });
  check('deleted group -> 404', r.status === 404);

  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
