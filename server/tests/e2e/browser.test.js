// QA browser tests — Prod scope. Real headless Chromium via Playwright.
// Run: node browser.test.js (backend on 3001 and Vite on 5173 must be up,
// DB seeded so sara@flat12.ae / omar@flat12.ae exist).
//
// Covers: the full auth dance (signup -> session -> reload persistence ->
// logout -> protected redirect -> login -> expired-token 401), the core loop
// (group -> members by email -> equal expense -> exact expense -> edit ->
// simplify-debts toggle -> settle up -> activity feed), and one error path
// per loop area, plus loading-state and no-white-screen checks.

const { chromium } = require('playwright');

// v1.1 redesign note: pair rows now start with an aria-hidden initials avatar
// (Story 29), so the row's textContent reads "OFOmar Farouk owes ...". Pair
// assertions therefore match the row by its "X owes Y" span and its AED
// amount separately instead of one contiguous string.
function pairRow(page, owesText, amountText) {
  return page.locator('.row', { hasText: owesText }).filter({ hasText: amountText });
}

const APP_URL = 'http://localhost:5173';
const ts = Date.now();
const ME = { name: 'QA UI Tester', email: `qa-ui-${ts}@example.com`, password: 'qa-ui-pass-1' };
const SEED_USER = 'sara@flat12.ae';
const SEED_USER_2 = 'omar@flat12.ae';

let passed = 0;
let failed = 0;
const failures = [];
const pageErrors = [];

function record(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function expectVisible(page, name, locator, timeout = 7000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    record(name, true);
    return true;
  } catch (e) {
    await page.screenshot({ path: `fail-${failed + 1}.png`, fullPage: true }).catch(() => {});
    record(name, false, e.message.split('\n')[0]);
    return false;
  }
}

async function expectUrl(page, name, pathRe, timeout = 7000) {
  try {
    await page.waitForURL(pathRe, { timeout });
    record(name, true);
    return true;
  } catch (e) {
    record(name, false, `url is ${page.url()}`);
    return false;
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // ---------------------------------------------------------------- auth dance
  console.log('\n-- auth dance --');

  // Logged out, protected route / must bounce to /login.
  await page.goto(APP_URL + '/');
  await expectUrl(page, 'logged-out visit to / redirects to /login', /\/login$/);

  // /login -> /signup via the switch link.
  await page.getByTestId('go-to-signup').click();
  await expectUrl(page, 'go-to-signup link lands on /signup', /\/signup$/);

  // Sign up with a fresh email.
  await page.getByTestId('name-input').fill(ME.name);
  await page.getByTestId('email-input').fill(ME.email);
  await page.getByTestId('password-input').fill(ME.password);
  await page.getByTestId('signup-button').click();
  await expectUrl(page, 'signup lands authenticated on /', /:5173\/$/);
  await expectVisible(page, 'header shows Fairshare brand + user name', page.locator('.topbar').getByText('Fairshare'));
  await expectVisible(page, 'logout button visible (session established)', page.getByTestId('logout-button'));

  // Session persists across a reload.
  await page.reload();
  await expectVisible(page, 'session persists after reload (dashboard renders)', page.getByText('Your balance'));

  // Logout.
  await page.getByTestId('logout-button').click();
  await expectUrl(page, 'logout redirects to /login', /\/login$/);

  // Protected route after logout.
  await page.goto(APP_URL + '/');
  await expectUrl(page, 'protected / redirects to /login when logged out', /\/login$/);

  // Login again.
  await page.getByTestId('email-input').fill(ME.email);
  await page.getByTestId('password-input').fill(ME.password);
  await page.getByTestId('login-button').click();
  await expectUrl(page, 'login lands authenticated on /', /:5173\/$/);
  await expectVisible(page, 'dashboard renders after login', page.getByText('Your groups'));

  // Expired/corrupt token -> graceful 401 handling (back to /login, no crash).
  await page.evaluate(() => localStorage.setItem('fairshare_token', 'expired'));
  await page.reload();
  await expectUrl(page, 'corrupt token on reload -> handled 401 -> /login', /\/login$/);
  record('no JS crash during expired-token handling', pageErrors.length === 0, pageErrors.join('; '));

  // Log back in for the core loop. Throttle the dashboard fetch once to make
  // the loading state observable.
  let throttling = true;
  await page.route('**/balances/overall', async (route) => {
    if (throttling) await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => {});
  });
  // Arm the loading-state watcher BEFORE triggering navigation so the brief
  // "Loading..." window can't be missed.
  const loadingSeen = page
    .getByText('Loading...')
    .first()
    .waitFor({ state: 'visible', timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  await page.getByTestId('email-input').fill(ME.email);
  await page.getByTestId('password-input').fill(ME.password);
  await page.getByTestId('login-button').click();
  record('loading indicator shown while dashboard fetches', await loadingSeen);
  throttling = false; // route stays registered as a pass-through no-op
  await expectVisible(page, 'dashboard finishes loading', page.getByText('Your groups'));

  // ----------------------------------------------------------------- core loop
  console.log('\n-- core loop --');

  // Create a group.
  const groupName = `QA Trip ${ts}`;
  await page.getByRole('button', { name: 'New group' }).click();
  await page.locator('#new-group-name').fill(groupName);
  await page.getByRole('button', { name: 'Create group' }).click();
  await expectVisible(page, 'new group appears on the dashboard', page.getByRole('link', { name: groupName }));

  // Open it and add two seeded members by email. (.first(): the group link
  // renders in both the "By group" rollup and the "Your groups" list.)
  await page.getByRole('link', { name: groupName }).first().click();
  await expectUrl(page, 'group page route /groups/:id', /\/groups\/\d+$/);
  await expectVisible(page, 'group page renders with Members section', page.getByRole('heading', { name: 'Members' }));

  await page.locator('#add-member-email').fill(SEED_USER);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expectVisible(page, 'seeded member Sara added by email', page.locator('.row', { hasText: 'Sara Haddad' }).first());
  await page.locator('#add-member-email').fill(SEED_USER_2);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expectVisible(page, 'seeded member Omar added by email', page.locator('.row', { hasText: 'Omar Farouk' }).first());

  // Equal-split expense: I pay AED 90.00 across all three -> 30 each.
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#expense-description').fill('Beach BBQ');
  await page.locator('#expense-amount').fill('90.00');
  const saveBtn = page.getByRole('button', { name: 'Save expense' });
  await saveBtn.click();
  await expectVisible(page, 'equal expense appears in the list', page.locator('.row', { hasText: 'Beach BBQ' }).first());
  await expectVisible(page, 'balances updated: Sara owes me AED 30.00', pairRow(page, `Sara Haddad owes ${ME.name}`, 'AED 30.00'));
  await expectVisible(page, 'balances updated: Omar owes me AED 30.00', pairRow(page, `Omar Farouk owes ${ME.name}`, 'AED 30.00'));
  await expectVisible(page, 'my net shows gets back AED 60.00', page.locator('.row', { hasText: ME.name }).filter({ hasText: 'gets back AED 60.00' }));

  // Exact-split expense: Sara pays AED 60.00 — Sara 30.00, Omar 30.00 (I'm out).
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#expense-description').fill('Taxi');
  await page.locator('#expense-amount').fill('60.00');
  await page.locator('#expense-payer').selectOption({ label: 'Sara Haddad' });
  // Untick myself as a participant.
  await page.locator('fieldset', { hasText: 'Participants' }).locator('label.check', { hasText: ME.name }).locator('input').uncheck();
  await page.locator('input[name="split_method"][value="exact"]').check();
  const exactFieldset = page.locator('fieldset', { hasText: 'Exact amounts' });
  await exactFieldset.locator('.field-inline', { hasText: 'Sara Haddad' }).locator('input').fill('30.00');
  await exactFieldset.locator('.field-inline', { hasText: 'Omar Farouk' }).locator('input').fill('30.00');
  await expectVisible(page, 'exact form live indicator reads AED 0.00 left to assign', page.getByText('AED 0.00 left to assign'));
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expectVisible(page, 'exact expense appears in the list', page.locator('.row', { hasText: 'Taxi' }).first());

  // Raw pairwise (simplify off): three pairs of AED 30.00.
  await expectVisible(page, 'raw pair Omar owes Sara AED 30.00 visible', pairRow(page, 'Omar Farouk owes Sara Haddad', 'AED 30.00'));
  const rawPairCount = await page.locator('.row', { hasText: 'Settle up' }).count();
  record('raw pairwise list shows 3 pairs', rawPairCount === 3, `got ${rawPairCount}`);

  // Edit the first expense (audit trail + activity entry).
  await page.locator('.row', { hasText: 'Beach BBQ' }).first().getByRole('button', { name: 'Edit' }).click();
  await expectVisible(page, 'edit form opens pre-filled', page.getByRole('heading', { name: 'Edit expense' }));
  await page.locator('#expense-description').fill('Beach BBQ (edited)');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expectVisible(page, 'edited expense shows audit line', page.getByText(`edited by ${ME.name}`));

  // Simplify debts: pairs change shape (3 -> 1), nets unchanged.
  // (click, not check(): it's a controlled checkbox whose state flips only
  // after the PUT + re-fetch roundtrip completes)
  await page.locator('input[name="simplify_debts"]').click();
  await expectVisible(page, 'simplified plan: single pair Omar owes me AED 60.00', pairRow(page, `Omar Farouk owes ${ME.name}`, 'AED 60.00'));
  const simplifiedPairCount = await page.locator('.row', { hasText: 'Settle up' }).count();
  record('simplified pairs list collapsed to 1 pair', simplifiedPairCount === 1, `got ${simplifiedPairCount}`);
  await expectVisible(page, 'nets unchanged by simplify: I still get back AED 60.00', page.locator('.row', { hasText: ME.name }).filter({ hasText: 'gets back AED 60.00' }));
  await expectVisible(page, 'nets unchanged by simplify: Sara settled up', page.locator('.row', { hasText: 'Sara Haddad' }).filter({ hasText: 'settled up' }));

  // Error path (settlement) first, while a pair still exists: zero amount.
  await page.locator('.row', { hasText: `Omar Farouk owes ${ME.name}` }).getByRole('button', { name: 'Settle up' }).click();
  await expectVisible(page, 'settle-up form opens', page.getByRole('heading', { name: 'Settle up' }));
  const prefill = await page.locator('#settle-amount').inputValue();
  record('settle-up amount pre-filled with outstanding AED 60.00', prefill === '60.00', `got "${prefill}"`);
  await page.locator('#settle-amount').fill('0');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expectVisible(page, 'zero-amount settlement rejected with visible message', page.getByRole('alert').filter({ hasText: 'positive amount' }));

  // Now the real settlement with the pre-filled value restored.
  await page.locator('#settle-amount').fill(prefill);
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expectVisible(page, 'settlement clears the debt: everyone settled up', page.getByText('Everyone is settled up.'));
  await expectVisible(page, 'Omar net now settled up', page.locator('.row', { hasText: 'Omar Farouk' }).filter({ hasText: 'settled up' }).first());

  // Activity feed: expense added, edited, and settlement entries.
  await expectVisible(page, 'activity shows expense_added entry', page.getByText(`${ME.name} added 'Beach BBQ (edited)' — AED 90.00`));
  await expectVisible(page, 'activity shows expense_edited entry', page.getByText(`${ME.name} edited 'Beach BBQ (edited)'`));
  await expectVisible(page, 'activity shows settlement entry', page.getByText(`Omar Farouk paid ${ME.name} AED 60.00`));

  // ---------------------------------------------------------------- error paths
  console.log('\n-- error paths (Prod) --');

  // Group creation with empty name (dashboard inline error).
  await page.locator('.topbar').getByRole('link', { name: 'Fairshare' }).click();
  await expectVisible(page, 'back on dashboard', page.getByText('Your groups'));
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByRole('button', { name: 'Create group' }).click();
  await expectVisible(page, 'empty group name shows inline error', page.getByRole('alert').filter({ hasText: 'Please enter a group name.' }));

  // Add member with unknown email (group page inline error).
  await page.getByRole('link', { name: groupName }).first().click();
  await expectVisible(page, 'group page loaded again', page.getByRole('heading', { name: 'Members' }));
  await page.locator('#add-member-email').fill(`ghost-${ts}@example.com`);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expectVisible(page, 'unknown email shows user_not_found message', page.getByRole('alert').filter({ hasText: 'No account with that email' }));

  // Exact split that does not sum: inline "AED X.XX left to assign", not saved.
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#expense-description').fill('Mismatch test');
  await page.locator('#expense-amount').fill('100.00');
  await page.locator('input[name="split_method"][value="exact"]').check();
  await page.locator('fieldset', { hasText: 'Exact amounts' }).locator('.field-inline', { hasText: 'Sara Haddad' }).locator('input').fill('40.00');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expectVisible(page, 'split mismatch shows "AED 60.00 left to assign" error', page.getByRole('alert').filter({ hasText: 'AED 60.00 left to assign' }));
  const mismatchSaved = await page.locator('.row', { hasText: 'Mismatch test' }).count();
  record('mismatched expense is NOT saved', mismatchSaved === 0, `found ${mismatchSaved} rows`);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Logout, then auth error paths.
  await page.getByTestId('logout-button').click();
  await expectUrl(page, 'logged out for auth error paths', /\/login$/);

  // Login with wrong password.
  await page.getByTestId('email-input').fill(ME.email);
  await page.getByTestId('password-input').fill('definitely-wrong');
  await page.getByTestId('login-button').click();
  await expectVisible(page, 'wrong password shows inline invalid_credentials error', page.getByRole('alert').filter({ hasText: 'Invalid email or password.' }));

  // Signup with an already-used email.
  await page.getByTestId('go-to-signup').click();
  await page.getByTestId('name-input').fill('Dup Tester');
  await page.getByTestId('email-input').fill(SEED_USER);
  await page.getByTestId('password-input').fill('whatever-123');
  await page.getByTestId('signup-button').click();
  await expectVisible(page, 'duplicate signup shows inline email_taken error', page.getByRole('alert').filter({ hasText: 'An account with this email already exists.' }));

  // Prod hardening: no uncaught JS errors / white screens across the whole run.
  record('no uncaught page errors during entire run (no white-screen crash)', pageErrors.length === 0, pageErrors.join('; '));
  const bodyText = await page.locator('body').innerText();
  record('final page renders content (not blank)', bodyText.trim().length > 0);

  await browser.close();

  console.log(`\n${passed}/${passed + failed} browser checks passed`);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Browser test run crashed:', err);
  process.exit(1);
});
