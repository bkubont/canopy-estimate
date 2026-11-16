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
await o.locator('dialog[open]').getByLabel('Crew-hours').fill('27');
await o.locator('dialog[open]').getByRole('button', { name: 'Save hours' }).click();
await see(o, '27 h', 'owner logs 27 crew-hours');
await see(o, '$173.48', 'and sees it earned $173.48 per crew-hour ($4,684 ÷ 27)');

await o.getByRole('button', { name: 'Start clock' }).click();
await see(o, 'Stop clock', 'the clock starts');
// Pretend it was started 3 hours ago.
await o.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('canopy.clock.'));
  localStorage.setItem(k, new Date(Date.now() - 3 * 3600_000).toISOString());
});
await o.reload();
await see(o, 'Stop clock · 3h 00m', 'it keeps running after the phone reloads (3 hours in)');
await o.getByRole('button', { name: /Stop clock/ }).click();
const dlg = o.locator('dialog[open]');
await dlg.getByRole('button', { name: 'Less People' }).click(); // default is the team size (2) → 1
await dlg.getByRole('button', { name: 'More People' }).click();
await dlg.getByRole('button', { name: 'More People' }).click(); // 3 people
await see(o, '9 h', 'stopping asks how many people: 3 × 3 hours = 9 crew-hours');
await dlg.getByRole('button', { name: 'Save hours' }).click();
await see(o, '36 h', 'the job now has 36 crew-hours');
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
await o.goto(`${APP}#/receipts`);
await o.locator('.receipt img').first().waitFor({ timeout: 10000 }).catch(() => fail(o, 'no receipt picture in Receipts'));
ok('and its picture is in Receipts');

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
await c.goto(jobUrl);
await c.getByRole('button', { name: 'Add hours' }).click();
await c.locator('dialog[open]').getByLabel('Crew-hours').fill('4');
await c.locator('dialog[open]').getByRole('button', { name: 'Save hours' }).click();
await see(c, '4 h', 'crew log 4 crew-hours on the job');
await notSee(c, /\$/, 'crew see hours but no money');
if (!(await c.locator('.hours-row[disabled]').count())) await fail(c, 'crew can edit the owner’s hours');
ok('crew can’t change hours someone else entered');
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
await see(o, '40 h', 'with 40 crew-hours this week');
await shot(o, '02-dashboard');
await o.goto(`${APP}#/board`);
await o.getByLabel('40 h logged').first().waitFor({ timeout: 5000 }).catch(() => fail(o, 'board card has no hours'));
ok('the board card shows 40 h');

await browser.close();
done('money');
