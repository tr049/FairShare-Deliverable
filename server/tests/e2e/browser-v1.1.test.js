// QA browser tests — v1.1 amendment (2026-06-12). Real headless Chromium via
// Playwright. Run: node browser-v1.1.test.js (backend on 3001 and Vite on
// 5173 up, DB seeded so sara@flat12.ae exists).
//
// Covers: expense categories (select values, saved chip, breakdown totals),
// client-side search + category/payer filters + no-matches + reset, CSV
// export download, avatars (header + member rows, deterministic color), and
// the /profile page (rename propagation, wrong-password inline error, short
// password validation, successful password change verified by re-login).
// Uses a throwaway qa-*@example.com account so the seed data stays pristine.

const { chromium } = require('playwright');
const fs = require('fs');

const APP_URL = 'http://localhost:5173';
const ts = Date.now();
const ME = { name: 'QA Vee Tester', email: `qa-v11-${ts}@example.com`, password: 'qa-v11-pass-1' };
const ME_NEW_NAME = 'QA Vee Renamed';
const ME_NEW_PASSWORD = 'qa-v11-pass-2';
const SEED_USER = 'sara@flat12.ae';
const CONTRACT_CATEGORIES = ['general', 'food', 'groceries', 'transport', 'utilities', 'rent', 'entertainment', 'travel', 'other'];

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
    await page.screenshot({ path: `fail-v11-${failed + 1}.png`, fullPage: true }).catch(() => {});
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
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // Sections the page renders; expense rows live only in the Expenses card.
  const expensesCard = () =>
    page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Expenses', exact: true }) });
  const expenseRows = () => expensesCard().locator('ul.rows > li.row');

  // ------------------------------------------------------------------ set up
  console.log('\n-- setup: throwaway account + group --');
  await page.goto(APP_URL + '/signup');
  await page.getByTestId('name-input').fill(ME.name);
  await page.getByTestId('email-input').fill(ME.email);
  await page.getByTestId('password-input').fill(ME.password);
  await page.getByTestId('signup-button').click();
  await expectUrl(page, 'signup lands on /', /:5173\/$/);

  // Avatars: header shows my colored-initials avatar next to the profile link.
  await expectVisible(page, 'header shows avatar (colored initials)', page.locator('.topbar .avatar'));
  const headerInitials = await page.locator('.topbar .avatar').first().innerText();
  record('header avatar initials derived from name (QT)', headerInitials === 'QT', `got "${headerInitials}"`);

  const groupName = `QA Trip v11 ${ts}`;
  await page.getByRole('button', { name: 'New group' }).click();
  await page.locator('#new-group-name').fill(groupName);
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByRole('link', { name: groupName }).first().click();
  await expectUrl(page, 'group page open', /\/groups\/\d+$/);
  await page.locator('#add-member-email').fill(SEED_USER);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expectVisible(page, 'Sara added as second member', page.locator('.row', { hasText: 'Sara Haddad' }).first());

  // Avatars in member rows; deterministic color (same user -> same color).
  const membersCard = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Members', exact: true }) });
  await expectVisible(page, 'member rows show avatars', membersCard.locator('.avatar'));

  // ------------------------------------------------------------- categories
  console.log('\n-- expense categories --');

  await page.getByRole('button', { name: 'Add expense' }).click();
  const options = await page.locator('#expense-category option').allTextContents();
  record('category select offers exactly the nine contract values',
    JSON.stringify(options) === JSON.stringify(CONTRACT_CATEGORIES), JSON.stringify(options));
  const selected = await page.locator('#expense-category').inputValue();
  record('category defaults to general', selected === 'general', `got "${selected}"`);

  // Expense 1: food, AED 30.00, paid by me, equal across both members.
  await page.locator('#expense-description').fill('Karak run');
  await page.locator('#expense-amount').fill('30.00');
  await page.locator('#expense-category').selectOption('food');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expectVisible(page, 'expense saved with category', page.locator('.row', { hasText: 'Karak run' }).first());
  // Chip text compares case-insensitively: the warm-ledger stylesheet renders
  // chips with text-transform: uppercase, and innerText reflects that.
  const chip = await page.locator('.row', { hasText: 'Karak run' }).first().locator('.chip').innerText();
  record('saved category chip "food" visible on the row', chip.toLowerCase() === 'food', `got "${chip}"`);

  // Expense 2: transport, AED 20.00, paid by Sara (gives the payer filter a target).
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#expense-description').fill('Taxi to JBR');
  await page.locator('#expense-amount').fill('20.00');
  await page.locator('#expense-category').selectOption('transport');
  await page.locator('#expense-payer').selectOption({ label: 'Sara Haddad' });
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expectVisible(page, 'second expense saved', page.locator('.row', { hasText: 'Taxi to JBR' }).first());

  // Expense 3: category left at the default.
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#expense-description').fill('Beach mats');
  await page.locator('#expense-amount').fill('10.00');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expectVisible(page, 'third expense saved', page.locator('.row', { hasText: 'Beach mats' }).first());
  const defaultChip = await page.locator('.row', { hasText: 'Beach mats' }).first().locator('.chip').innerText();
  record('omitted category renders as general chip', defaultChip.toLowerCase() === 'general', `got "${defaultChip}"`);

  // Category breakdown: visible, totals plausible, bars sum to group spend.
  const breakdown = page.getByTestId('category-breakdown');
  await expectVisible(page, 'category breakdown visible', breakdown);
  await expectVisible(page, 'breakdown total reads AED 60.00', breakdown.getByText('AED 60.00'));
  const barAmounts = await breakdown.locator('.bar-amount').allTextContents();
  const barSum = barAmounts.reduce((s, t) => s + Math.round(parseFloat(t.replace(/[^0-9.]/g, '')) * 100), 0);
  record('breakdown categories sum to the group total (6000 fils)', barSum === 6000, `${JSON.stringify(barAmounts)} -> ${barSum}`);
  const barLabels = await breakdown.locator('.bar-label').allTextContents();
  record('breakdown lists food, transport, general',
    barLabels.includes('food') && barLabels.includes('transport') && barLabels.includes('general'), JSON.stringify(barLabels));

  // Avatar determinism: Sara's avatar color in the members list matches her
  // payer avatar on the Taxi expense row.
  const colorMembers = await membersCard.locator('.row', { hasText: 'Sara Haddad' }).first().locator('.avatar')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const colorExpense = await expenseRows().filter({ hasText: 'Taxi to JBR' }).first().locator('.avatar')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  record('avatar color deterministic per user (members list == expense row)',
    colorMembers === colorExpense && colorMembers !== '', `${colorMembers} vs ${colorExpense}`);

  // -------------------------------------------------------- search + filters
  console.log('\n-- search and filters --');

  await page.getByTestId('expense-search').fill('kArAk');
  await expectVisible(page, 'case-insensitive search narrows to Karak run', expenseRows().filter({ hasText: 'Karak run' }));
  record('search hides non-matching rows', (await expenseRows().count()) === 1, `${await expenseRows().count()} rows`);

  await page.getByTestId('expense-search').fill('no-such-expense-zzz');
  await expectVisible(page, '"no matches" state appears', page.getByTestId('no-matches'));

  await page.getByTestId('expense-search').fill('');
  await page.getByTestId('category-filter').selectOption('transport');
  record('category filter narrows to the transport expense',
    (await expenseRows().count()) === 1 && (await expenseRows().first().innerText()).includes('Taxi to JBR'),
    `${await expenseRows().count()} rows`);

  await page.getByTestId('category-filter').selectOption('');
  await page.getByTestId('payer-filter').selectOption({ label: 'Sara Haddad' });
  record('payer filter narrows to expenses Sara paid',
    (await expenseRows().count()) === 1 && (await expenseRows().first().innerText()).includes('Taxi to JBR'),
    `${await expenseRows().count()} rows`);

  await page.getByTestId('payer-filter').selectOption({ label: 'Sara Haddad' }); // keep a filter active so Reset shows
  await page.getByRole('button', { name: 'Reset' }).click();
  record('Reset restores the full list', (await expenseRows().count()) === 3, `${await expenseRows().count()} rows`);
  record('search input cleared by reset', (await page.getByTestId('expense-search').inputValue()) === '');

  // -------------------------------------------------------------- CSV export
  console.log('\n-- CSV export --');

  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await page.getByTestId('export-csv-button').click();
  const download = await downloadPromise;
  record('Export CSV triggers a browser download', download !== null);
  if (download) {
    const suggested = download.suggestedFilename();
    record('download filename is <slug>-ledger.csv',
      new RegExp(`^qa-trip-v11-${ts}-ledger\\.csv$`).test(suggested), suggested);
    const filePath = await download.path();
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    record('downloaded CSV has the exact contract header',
      lines[0] === 'type,date,description,category,amount_aed,payer,participants,created_by,created_at', lines[0]);
    record('downloaded CSV contains the three expenses',
      lines.filter((l) => l.startsWith('expense,')).length === 3, `${lines.length - 1} data rows`);
  }

  // ----------------------------------------------------------------- profile
  console.log('\n-- profile (v1.1) --');

  await page.getByTestId('profile-link').click();
  await expectUrl(page, 'header profile link opens /profile', /\/profile$/);
  await expectVisible(page, 'profile shows my email', page.getByText(ME.email));

  // Rename: header updates immediately, then propagation into the group.
  await page.getByTestId('profile-name-input').fill(ME_NEW_NAME);
  await page.getByTestId('save-name-button').click();
  await expectVisible(page, 'rename shows a success note', page.locator('.success', { hasText: 'Name updated' }));
  await expectVisible(page, 'header name updates immediately (no reload)', page.locator('.topbar .user-name', { hasText: ME_NEW_NAME }));

  await page.goto(APP_URL + '/');
  await page.getByRole('link', { name: groupName }).first().click();
  await expectUrl(page, 'back on the group page', /\/groups\/\d+$/);
  await expectVisible(page, 'members list shows the new name',
    membersCard.locator('.row', { hasText: ME_NEW_NAME }));
  await expectVisible(page, 'expense row payer shows the new name',
    expenseRows().filter({ hasText: 'Karak run' }).filter({ hasText: `paid by ${ME_NEW_NAME}` }));

  // Password change error paths first.
  await page.getByTestId('profile-link').click();
  await expectUrl(page, 'on /profile for password tests', /\/profile$/);

  await page.getByTestId('current-password-input').fill('definitely-wrong');
  await page.getByTestId('new-password-input').fill(ME_NEW_PASSWORD);
  await page.getByTestId('change-password-button').click();
  await expectVisible(page, 'wrong current password shows exact inline message',
    page.getByRole('alert').filter({ hasText: 'Current password is incorrect.' }));

  await page.getByTestId('current-password-input').fill(ME.password);
  await page.getByTestId('new-password-input').fill('123');
  await page.getByTestId('change-password-button').click();
  await expectVisible(page, 'short new password shows inline validation error',
    page.getByRole('alert').filter({ hasText: 'at least 6 characters' }));

  // Happy path: change, then prove it by logging out and back in.
  await page.getByTestId('current-password-input').fill(ME.password);
  await page.getByTestId('new-password-input').fill(ME_NEW_PASSWORD);
  await page.getByTestId('change-password-button').click();
  await expectVisible(page, 'password change shows a success note', page.locator('.success', { hasText: 'Password changed.' }));

  await page.getByTestId('logout-button').click();
  await expectUrl(page, 'logged out to /login', /\/login$/);

  await page.getByTestId('email-input').fill(ME.email);
  await page.getByTestId('password-input').fill(ME.password);
  await page.getByTestId('login-button').click();
  await expectVisible(page, 'old password rejected after change',
    page.getByRole('alert').filter({ hasText: 'Invalid email or password.' }));

  await page.getByTestId('password-input').fill(ME_NEW_PASSWORD);
  await page.getByTestId('login-button').click();
  await expectUrl(page, 'new password logs in', /:5173\/$/);
  await expectVisible(page, 'dashboard renders under the renamed account',
    page.locator('.topbar .user-name', { hasText: ME_NEW_NAME }));

  record('no uncaught page errors during the v1.1 run', pageErrors.length === 0, pageErrors.join('; '));

  await browser.close();

  console.log(`\n${passed}/${passed + failed} v1.1 browser checks passed`);
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
