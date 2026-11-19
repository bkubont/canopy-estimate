// End-to-end check of expenses, receipts and hours (Phase 5, step 5).
//
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173/ node e2e/money-flow.mjs [screenshot-dir]
import { createFakeBackend } from './fake-backend.mjs';
import { APP, chromium, crewJoin, devices, done, fail, notSee, ok, ownerSetup, page, see, shot, signedEstimate, syncNow } from './helpers.mjs';

if (!process.env.E2E_FAKE) {
  console.log('money-flow needs E2E_FAKE=1 (it checks receipts inside the stand-in backend).');
  process.exit(0);
}
const stamp = Date.now();
const browser = await chromium.launch();
const ownerCtx = await browser.newContext({ ...devices['iPhone 13'] });
const crewCtx = await browser.newContext({ ...devices['iPhone 13'] });
const fake = createFakeBackend();
for (const c of [ownerCtx, crewCtx]) await fake.install(c);
const o = await page(ownerCtx);
const c = await page(crewCtx);
const png = { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64') };
const receiptFiles = () => [...fake.files.keys()].filter((k) => k.includes('/receipts/')).length;

await ownerSetup(o, { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' });
await crewJoin(o, c, { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' }, 'Sam Rivera');
await syncNow(o);
await signedEstimate(o, 'Dana', 'Smith', 'Traverse City');
ok('a signed job: 2 days + stump grinder for 2 days = $4,684 before tax');
const jobUrl = o.url();

// ---------------------------------------------------------------- hours typed in, then by the clock
await o.getByRole('button', { name: 'Add hours' }).click();
if (!(await o.locator('dialog[open]').getByLabel('Whose hours').count())) await fail(o, 'owner can\u2019t choose whose hours');
ok('the owner can add hours for anyone (Whose hours)');
await o.locator('dialog[open]').getByRole('spinbutton').fill('27');
await o.locator('dialog[open]').getByRole('button', { name: 'Save hours' }).click();
await see(o, '27 h', 'owner logs 27 hours');
await see(o, '$173.48', 'and sees it earned $173.48 per hour worked ($4,684 ÷ 27)');

// A fake clock stands in for hours passing.
await o.clock.install();
await o.reload();
await o.getByRole('button', { name: 'Clock in' }).click();
await see(o, 'You · on the clock since', 'owner clocks in');
await o.clock.fastForward('03:00:00');
await o.reload();
await see(o, 'Clock out · 3h 00m', 'the clock is kept with the job, so it survives a reload (3 hours in)');
await o.getByRole('button', { name: /Clock out/ }).click();
await see(o, '30 h', 'clocking out adds the owner\u2019s 3 hours: 30 h on the job');
await shot(o, '01-job-hours');

// ---------------------------------------------------------------- an expense with a receipt, tied to the job
await o.getByRole('button', { name: 'Quick add' }).click();
await o.getByRole('menuitem', { name: 'Expense or receipt' }).click();
const ex = o.locator('dialog[open]');
await ex.getByLabel('Add receipt photo').setInputFiles(png);
await ex.getByLabel('Amount').fill('64.20');
await ex.getByLabel('Vendor').fill('Marathon');
await ex.getByRole('button', { name: 'Fuel', exact: true }).click();
await ex.getByLabel('Job (optional)').selectOption({ label: 'E-1001 · Dana Smith' });
await ex.getByRole('button', { name: 'Save expense' }).click();
await see(o, 'Job costs $64.20', 'the job shows its costs');
for (let i = 0; i < 30 && receiptFiles() < 1; i++) await o.waitForTimeout(200);
if (receiptFiles() !== 1) await fail(o, 'receipt picture did not upload');
ok('the receipt picture uploads to the receipts folder');

await o.goto(`${APP}#/expenses`);
await see(o, 'Marathon', 'the expense is on the Expenses list');
await see(o, '$64.20', 'with its amount');
const officeMenu = await o.locator('.sidebar a').allInnerTexts();
if (!officeMenu.some((t) => t.trim() === 'Expenses')) await fail(o, 'office menu missing Expenses');
if (officeMenu.some((t) => t.trim() === 'Receipts')) await fail(o, 'office menu still has a sibling Receipts item');
ok('Money menu has Expenses once (receipts are a type filter, not a sibling)');
await o.getByRole('button', { name: 'Receipts', exact: true }).click();
await o.locator('.receipt img').first().waitFor({ timeout: 10000 }).catch(() => fail(o, 'no receipt picture in Receipts filter'));
ok('and its picture is in the Receipts filter');

// ---------------------------------------------------------------- crew send in a receipt and log hours
await c.goto(`${APP}#/`);
await syncNow(c);
const crewMenu = await c.locator('.sidebar a').allInnerTexts();
if (crewMenu.some((t) => /Expenses|Receipts/.test(t))) await fail(c, 'crew menu has Expenses/Receipts');
ok('crew have no Expenses or Receipts in the menu');
await c.getByRole('button', { name: 'Quick add' }).click();
await c.getByRole('menuitem', { name: 'Receipt' }).click();
const cr = c.locator('dialog[open]');
await cr.getByLabel('Add receipt photo').setInputFiles(png);
await cr.getByLabel('Amount').fill('30');
await cr.getByLabel('Vendor').fill('Home Depot');
await cr.getByRole('button', { name: 'Send receipt' }).click();
await see(c, 'Receipt sent to the office', 'crew send in a receipt');
await c.goto(`${APP}#/expenses`);
await c.waitForURL(/#\/$/, { timeout: 5000 }).catch(() => fail(c, 'crew could open Expenses'));
ok('and can’t open the Expenses list');
await c.goto(`${APP}#/receipts`);
await c.waitForURL(/#\/$/, { timeout: 5000 }).catch(() => fail(c, 'crew could open old Receipts URL'));
ok('and can’t open the old Receipts URL either');
await c.clock.install();
await c.goto(jobUrl);
await c.getByRole('button', { name: 'Add hours' }).click();
if (await c.locator('dialog[open]').getByLabel('Whose hours').count()) await fail(c, 'crew can pick whose hours');
await c.locator('dialog[open]').getByRole('spinbutton').fill('8');
await c.locator('dialog[open]').getByRole('button', { name: 'Save hours' }).click();
await see(c, '8 h · Sam Rivera', 'crew add their own 8 hours (no choosing someone else)');
await c.getByRole('button', { name: 'Clock in' }).click();
await see(c, 'You · on the clock since', 'and clock in to the job');
await syncNow(c);
await o.goto(`${APP}#/`);
await syncNow(o);
await see(o, 'On the clock', 'the owner\u2019s dashboard shows who is on the clock');
await o.locator('.on-clock-card', { hasText: 'Sam Rivera' }).getByText('Dana Smith').waitFor({ timeout: 5000 }).catch(() => fail(o, 'Sam not shown on the clock at Dana Smith'));
ok('Sam Rivera, at Dana Smith');
await c.clock.fastForward('02:00:00');
await c.getByRole('button', { name: /Clock out/ }).click();
await see(c, '2 h · Sam Rivera', 'Sam clocks out 2 hours later');
await notSee(c, /\$/, 'crew see hours but no money');
if ((await c.locator('.hours-row:not([disabled])').count()) !== 2) await fail(c, 'crew should be able to edit exactly their own two entries');
if ((await c.locator('.hours-row[disabled]').count()) !== 2) await fail(c, 'crew can edit the owner\u2019s hours');
ok('crew can fix their own hours but not anyone else\u2019s');
await c.locator('.hours-row', { hasText: '2 h · Sam Rivera' }).click();
await c.locator('dialog[open]').getByLabel('Clocked in').waitFor();
await c.locator('dialog[open]').getByLabel('Note').fill('Chipper day');
await c.locator('dialog[open]').getByRole('button', { name: 'Save hours' }).click();
await see(c, 'Chipper day', 'and edit a clocked entry (in and out times, note)');
await syncNow(c);
for (let i = 0; i < 30 && receiptFiles() < 2; i++) await c.waitForTimeout(200);

// ---------------------------------------------------------------- the office sees it all
await o.goto(`${APP}#/expenses`);
await syncNow(o);
await see(o, 'Home Depot', 'the crew’s receipt shows up for the office');
await see(o, 'Added by Sam Rivera', 'marked as added by Sam');
await see(o, '$94.20', 'the month total is $94.20');
await o.goto(`${APP}#/`);
await see(o, 'Hours this week', 'the dashboard has an hours tile');
await see(o, '40 h', 'with 40 hours this week (27 + 3 + 8 + 2)');
await shot(o, '02-dashboard');
await o.goto(`${APP}#/board`);
await o.getByLabel('40 h logged').first().waitFor({ timeout: 5000 }).catch(() => fail(o, 'board card has no hours'));
ok('the board card shows 40 h');

// ---------------------------------------------------------------- reports and the Excel file
const { unzipSync, strFromU8 } = await import('fflate');
const { readFileSync } = await import('node:fs');
await o.goto(`${APP}#/reports`);
await see(o, 'Money out', 'Reports opens on this month');
await see(o, '$94.20', 'money out is $94.20');
await see(o, '40 h', 'with 40 hours worked');
await o.locator('.report-table', { hasText: 'Dana Smith' }).waitFor({ timeout: 5000 }).catch(() => fail(o, 'job missing from the report'));
ok('the Dana Smith job is in the jobs table');
await shot(o, '03-reports');
const [xlsx] = await Promise.all([o.waitForEvent('download'), o.getByRole('button', { name: 'Download Excel' }).click()]);
const files = unzipSync(new Uint8Array(readFileSync(await xlsx.path())));
const wb = strFromU8(files['xl/workbook.xml']);
for (const name of ['Summary', 'Payments received', 'Invoices', 'Expenses', 'Hours', 'Jobs']) if (!wb.includes(`name="${name}"`)) await fail(o, `workbook missing sheet ${name}`);
ok(`Download Excel gives a real workbook (${xlsx.suggestedFilename()}) with all six sheets`);
const cells = Object.entries(files).filter(([k]) => k.startsWith('xl/')).map(([, v]) => strFromU8(v)).join('');
if (!cells.includes('Home Depot') || !cells.includes('Marathon')) await fail(o, 'expenses missing from the workbook');
ok('and both expenses are in it');

await o.goto(`${APP}#/receipts`);
await o.waitForURL(/#\/expenses\?type=receipts/, { timeout: 5000 }).catch(() => fail(o, 'old /receipts did not redirect to Expenses Receipts filter'));
ok('old /receipts URL redirects to Expenses?type=receipts');
await o.locator('.receipt img').first().waitFor();
const [zip] = await Promise.all([o.waitForEvent('download'), o.getByRole('button', { name: 'Download all' }).click()]);
const inZip = Object.keys(unzipSync(new Uint8Array(readFileSync(await zip.path()))));
if (inZip.length !== 2 || !inZip.some((n) => n.includes('Marathon_64.20'))) await fail(o, `receipts zip has ${inZip.join(', ')}`);
ok(`Download all gives a zip of the month’s 2 receipts (${inZip.join(', ')})`);

// ---------------------------------------------------------------- review fixes
// Clocking in on a second job while on the clock at the first switches over.
await signedEstimate(o, 'Lee', 'Park', 'Kingsley');
await o.goto(o.url().replace(/\/review$/, ''));
await o.getByRole('button', { name: 'Clock in' }).click();
await see(o, 'Clock out', 'owner clocks in on a second job (Lee Park)');
await o.locator('.top-search label').click();
await o.getByLabel('Search jobs and customers').fill('dana');
await o.getByRole('option', { name: /Dana Smith/ }).first().click();
await see(o, 'Signed by Dana Smith', 'search goes straight to the Dana Smith job');
await see(o, 'on the clock at Lee Park', 'Dana Smith says you\u2019re on the clock at Lee Park');
await o.getByRole('button', { name: 'Switch to this job' }).click();
await see(o, 'You · on the clock since', 'Switch clocks out there and in here');
await o.locator('.top-search label').click();
await o.getByLabel('Search jobs and customers').fill('lee');
await o.getByRole('option', { name: /Lee Park/ }).first().click();
await o.getByRole('button', { name: 'Switch to this job' }).waitFor({ timeout: 5000 }).catch(() => fail(o, 'Lee Park still has the owner on the clock'));
await o.locator('.hours-row').first().waitFor({ timeout: 5000 }).catch(() => fail(o, 'Lee Park\u2019s time was not saved when switching'));
ok('Lee Park is no longer on the clock, and its time was saved');
// A clock left running overnight asks for the real out time instead of saving 17 hours.
await o.locator('.top-search label').click();
await o.getByLabel('Search jobs and customers').fill('dana');
await o.getByRole('option', { name: /Dana Smith/ }).first().click();
await o.clock.fastForward('17:00:00');
await o.reload();
await o.getByRole('button', { name: /Clock out/ }).click();
await see(o, 'probably left on', 'a 17-hour clock asks when you really stopped');
await o.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();

// One entry can't be more than the database accepts.
await o.getByRole('button', { name: 'Add hours' }).click();
await o.locator('dialog[open]').getByRole('spinbutton').fill('250');
await o.locator('dialog[open]').getByRole('button', { name: 'Save hours' }).click();
await see(o, 'at most 200 hours', '250 hours in one entry is refused with a reason');
await o.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
await see(o, '40 h', 'and nothing was added (still 40 h)');

// Removing an expense takes its receipt with it.
await o.goto(`${APP}#/expenses`);
await o.getByRole('button', { name: /Marathon/ }).click();
await o.getByRole('button', { name: 'Remove expense' }).click();
await o.goto(`${APP}#/expenses?type=receipts`);
await o.locator('.receipt').first().waitFor();
const left = await o.locator('.receipt').allInnerTexts();
if (left.length !== 1 || left.some((t) => /Marathon|syncing/i.test(t))) await fail(o, `receipts left: ${left.join(' | ')}`);
ok('removing the Marathon expense takes its receipt out of Receipts too');

await browser.close();
done('money');
