// QA integration tests — v1.1 amendment (2026-06-12): profile (PUT /auth/me,
// PUT /auth/me/password), expense categories, and CSV export, plus quick
// ledger invariants. Standalone fetch script: node tests/integration-v1.1.test.js
// (backend running on http://localhost:3001 and seeded). Uses timestamped
// throwaway users (qa-*@example.com) so the demo data is never touched —
// tests/cleanup-qa-data.js removes them afterwards.

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

async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) {
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  }
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
  // Throwaway users — P exercises profile/password, Q is a second group
  // member, X is the non-member used for the export 404 check.
  const P = { name: 'QA Profile', email: `qa-p-${ts}@example.com`, password: 'qa-pass-123' };
  const Q = { name: 'QA Quincy', email: `qa-q-${ts}@example.com`, password: 'qa-pass-123' };
  const X = { name: 'QA Xeno', email: `qa-x2-${ts}@example.com`, password: 'qa-pass-123' };

  let r = await req('POST', '/auth/signup', { body: P });
  const tokP = r.data.access_token; P.id = r.data.user.id;
  r = await req('POST', '/auth/signup', { body: Q });
  const tokQ = r.data.access_token; Q.id = r.data.user.id;
  r = await req('POST', '/auth/signup', { body: X });
  const tokX = r.data.access_token; X.id = r.data.user.id;

  // ----------------------------------------------------------- PUT /auth/me
  console.log('\n-- profile: PUT /auth/me --');

  r = await req('PUT', '/auth/me', { token: tokP, body: { name: 'QA Profile Renamed' } });
  check('rename -> 200 with new name echoed in {user}',
    r.status === 200 && r.data.user && r.data.user.name === 'QA Profile Renamed' &&
    r.data.user.id === P.id && r.data.user.email === P.email,
    JSON.stringify(r.data));

  r = await req('GET', '/auth/me', { token: tokP });
  check('subsequent GET /auth/me shows the new name', r.status === 200 && r.data.user.name === 'QA Profile Renamed');

  // The rename must propagate into group member lists (joined at read time).
  r = await req('POST', '/groups', { token: tokP, body: { name: `QA Villa v11 ${ts}` } });
  const gid = r.data.id;
  await req('POST', `/groups/${gid}/members`, { token: tokP, body: { email: Q.email } });
  r = await req('GET', `/groups/${gid}`, { token: tokQ });
  check('group member list shows the renamed user',
    r.status === 200 && r.data.members.some((m) => m.id === P.id && m.name === 'QA Profile Renamed'),
    JSON.stringify(r.data.members));

  r = await req('PUT', '/auth/me', { token: tokP, body: { name: '   ' } });
  check('empty name -> 400 validation', r.status === 400 && r.data.error === 'validation' && isErrorShape(r.data));
  r = await req('PUT', '/auth/me', { token: tokP, body: {} });
  check('missing name -> 400 validation', r.status === 400 && r.data.error === 'validation');
  r = await req('GET', '/auth/me', { token: tokP });
  check('name unchanged after rejected updates', r.data.user.name === 'QA Profile Renamed');
  P.name = 'QA Profile Renamed';

  // -------------------------------------------------- PUT /auth/me/password
  console.log('\n-- profile: PUT /auth/me/password --');

  r = await req('PUT', '/auth/me/password', { token: tokP, body: { current_password: 'not-the-password', new_password: 'qa-new-pass-1' } });
  check('wrong current password -> 400 wrong_password with exact message',
    r.status === 400 && r.data.error === 'wrong_password' && r.data.message === 'Current password is incorrect.',
    JSON.stringify(r.data));

  r = await req('PUT', '/auth/me/password', { token: tokP, body: { current_password: P.password, new_password: '123' } });
  check('short new password -> 400 validation', r.status === 400 && r.data.error === 'validation');

  r = await req('POST', '/auth/login', { body: { email: P.email, password: P.password } });
  check('original password still works after rejected changes', r.status === 200);

  r = await req('PUT', '/auth/me/password', { token: tokP, body: { current_password: P.password, new_password: 'qa-new-pass-1' } });
  check('valid password change -> 204 No Content', r.status === 204, `got ${r.status}`);

  r = await req('POST', '/auth/login', { body: { email: P.email, password: P.password } });
  check('old password -> 401 invalid_credentials', r.status === 401 && r.data.error === 'invalid_credentials');

  r = await req('POST', '/auth/login', { body: { email: P.email, password: 'qa-new-pass-1' } });
  check('new password logs in -> 200', r.status === 200 && r.data.user.id === P.id);

  r = await req('GET', '/auth/me', { token: tokP });
  check('existing token still valid after password change', r.status === 200 && r.data.user.id === P.id);

  // ------------------------------------------------------ expense categories
  console.log('\n-- expense categories --');

  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokP,
    body: { description: 'Metro cards', amount_fils: 4200, date: '2026-06-11', category: 'transport', payer_id: P.id, split_method: 'equal', participant_ids: [P.id, Q.id] },
  });
  check('create with valid category -> 201, category echoed', r.status === 201 && r.data.category === 'transport', JSON.stringify(r.data));
  const expCat = r.data.id;

  r = await req('GET', `/groups/${gid}/expenses`, { token: tokQ });
  check('category appears in the list response',
    r.status === 200 && r.data.expenses.find((e) => e.id === expCat)?.category === 'transport');

  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokP,
    body: { description: 'Bad cat', amount_fils: 100, date: '2026-06-11', category: 'shopping', payer_id: P.id, split_method: 'equal', participant_ids: [P.id] },
  });
  check('invalid category -> 400 validation', r.status === 400 && r.data.error === 'validation', JSON.stringify(r.data));

  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokP,
    body: { description: 'No cat', amount_fils: 300, date: '2026-06-10', payer_id: P.id, split_method: 'equal', participant_ids: [P.id, Q.id] },
  });
  check('omitted category defaults to "general"', r.status === 201 && r.data.category === 'general');
  const expDefault = r.data.id;

  r = await req('PUT', `/groups/${gid}/expenses/${expDefault}`, {
    token: tokQ,
    body: { description: 'No cat', amount_fils: 300, date: '2026-06-10', category: 'food', payer_id: P.id, split_method: 'equal', participant_ids: [P.id, Q.id] },
  });
  check('edit changes category and stamps last_edited_by',
    r.status === 200 && r.data.category === 'food' &&
    r.data.last_edited_by && r.data.last_edited_by.id === Q.id && typeof r.data.last_edited_at === 'string',
    JSON.stringify(r.data));

  // ------------------------------------------------------------- CSV export
  console.log('\n-- CSV export --');

  // One settlement so the CSV has both row types. Q pays P 21.00.
  await req('POST', `/groups/${gid}/settlements`, { token: tokQ, body: { payer_id: Q.id, payee_id: P.id, amount_fils: 2100, date: '2026-06-12' } });

  r = await req('GET', `/groups/${gid}/export`, { token: tokP, raw: true });
  check('member export -> 200', r.status === 200);
  check('Content-Type is text/csv', (r.headers.get('content-type') || '').startsWith('text/csv'), r.headers.get('content-type'));
  check('Content-Disposition attachment with slugified filename',
    /^attachment; filename="qa-villa-v11-\d+-ledger\.csv"$/.test(r.headers.get('content-disposition') || ''),
    r.headers.get('content-disposition'));

  const lines = (r.text || '').trim().split('\n');
  check('exact 9-column header row',
    lines[0] === 'type,date,description,category,amount_aed,payer,participants,created_by,created_at', lines[0]);

  const expenseRows = lines.filter((l) => l.startsWith('expense,'));
  const settlementRows = lines.filter((l) => l.startsWith('settlement,'));
  check('expense rows present (2)', expenseRows.length === 2, `got ${expenseRows.length}`);
  check('settlement rows present (1)', settlementRows.length === 1, `got ${settlementRows.length}`);

  const metroRow = expenseRows.find((l) => l.includes('Metro cards'));
  check('expense row carries category and AED two-decimal amount',
    !!metroRow && metroRow.includes(',transport,42.00,') && metroRow.includes('QA Profile Renamed: 21.00; QA Quincy: 21.00'),
    metroRow);
  check('settlement row: empty category, Payment description, payee in participants',
    settlementRows[0].includes('Payment: QA Quincy -> QA Profile Renamed') &&
    settlementRows[0].includes(',,21.00,') &&
    settlementRows[0].includes('QA Profile Renamed: 21.00'),
    settlementRows[0]);
  check('every amount in CSV uses two decimals',
    lines.slice(1).every((l) => /,(\d+\.\d{2}),/.test(l)), lines.slice(1).join(' | '));

  r = await req('GET', `/groups/${gid}/export`, { token: tokX });
  check('non-member export -> 404 JSON not_found', r.status === 404 && r.data && r.data.error === 'not_found', JSON.stringify(r.data));

  r = await req('GET', `/groups/${gid}/export`);
  check('no token export -> 401 {error,message}', r.status === 401 && isErrorShape(r.data));

  // -------------------------------------------------------- quick invariants
  console.log('\n-- quick invariants --');

  r = await req('POST', `/groups/${gid}/members`, { token: tokP, body: { email: X.email } });
  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokP,
    body: { description: 'Three-way split', amount_fils: 10000, date: '2026-06-12', payer_id: P.id, split_method: 'equal', participant_ids: [P.id, Q.id, X.id] },
  });
  check('equal split 10000/3 -> 3334/3333/3333',
    r.status === 201 &&
    r.data.splits[0].amount_fils === 3334 && r.data.splits[1].amount_fils === 3333 && r.data.splits[2].amount_fils === 3333,
    JSON.stringify((r.data.splits || []).map((s) => s.amount_fils)));

  r = await req('GET', `/groups/${gid}/balances`, { token: tokP });
  check('group nets still sum to zero', r.status === 200 && r.data.members.reduce((s, m) => s + m.net_fils, 0) === 0,
    JSON.stringify(r.data.members));

  r = await req('POST', `/groups/${gid}/expenses`, {
    token: tokP,
    body: { description: 'Mismatch', amount_fils: 10000, date: '2026-06-12', payer_id: P.id, split_method: 'exact', splits: [{ user_id: P.id, amount_fils: 5000 }] },
  });
  check('splits_mismatch message exact',
    r.status === 400 && r.data.error === 'splits_mismatch' &&
    r.data.message === 'Splits must sum to the expense amount. AED 50.00 left to assign.',
    JSON.stringify(r.data));

  // Cleanup of the throwaway group (users are removed by cleanup-qa-data.js).
  r = await req('DELETE', `/groups/${gid}`, { token: tokP });
  check('throwaway group deleted -> 204', r.status === 204);

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
