// End-to-end check of Phase 3: signed estimate → deposit → invoice → customer
// link → final payment → paid, and crew can't see any of it.
//
//   APP_URL=http://127.0.0.1:5173/ node e2e/invoice-flow.mjs [screenshot-dir]
//   E2E_FAKE=1 APP_URL=... node e2e/invoice-flow.mjs [screenshot-dir]   (in-memory stand-in)
import { createRequire } from 'node:module';
import { createFakeBackend } from './fake-backend.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const APP = process.env.APP_URL || 'http://127.0.0.1:5173/';
const SHOTS = process.argv[2] || '';
const stamp = Date.now();
const owner = { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' };
const crew = { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' };

let step = 0;
const ok = (msg) => console.log(`ok ${++step} - ${msg}`);
async function fail(page, msg) {
  if (SHOTS && page) await page.screenshot({ path: `${SHOTS}/fail-${step + 1}.png`, fullPage: true });
  console.error(`FAILED: ${msg}`);
  process.exit(1);
}
async function see(page, text, msg, timeout = 15000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  } catch {
    await fail(page, `${msg} (did not find "${text}")`);
  }
  ok(msg);
}
async function notSee(page, pattern, msg) {
  if (pattern.test(await page.locator('body').innerText())) await fail(page, `${msg} (found ${pattern})`);
  ok(msg);
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
async function draw(page, canvas) {
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 18, box.y + box.height * (0.6 + 0.25 * Math.sin(i)));
  await page.mouse.up();
}
async function syncNow(page) {
  await page.getByRole('button', { name: /Synced|waiting|Syncing|Offline|not saved/ }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.getByText('Everything on this device is saved').first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Close' }).click();
}
async function signUp(page, who) {
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.locator('form button[type=submit]').click();
}

const browser = await chromium.launch();
const ownerCtx = await browser.newContext({ ...devices['iPhone 13'] });
const customerCtx = await browser.newContext({ ...devices['Pixel 7'] });
const crewCtx = await browser.newContext({ ...devices['iPhone 13'] });
if (process.env.E2E_FAKE) {
  const fake = createFakeBackend();
  for (const c of [ownerCtx, customerCtx, crewCtx]) await fake.install(c);
}
const o = await ownerCtx.newPage();
o.on('pageerror', (e) => console.error('page error:', e.message));
o.on('dialog', (d) => d.accept());

// ---------------------------------------------------------------- setup
await o.goto(APP);
await signUp(o, owner);
await o.getByLabel('Your name').fill('Joey');
await o.getByRole('button', { name: 'Create company' }).click();
await see(o, 'Tasks with no day yet', 'owner is in');
await o.goto(`${APP}#/company`);
await o.getByLabel('Phone').fill('231-555-0000');
await o.getByLabel('How customers can pay').fill('Checks payable to Advanced Tree Service');
await o.getByLabel('Tax rate').fill('6');
await o.getByRole('button', { name: 'Save', exact: true }).click();
await see(o, 'Saved', 'owner adds payment instructions and 6% tax');

// ---------------------------------------------------------------- a signed estimate
await o.goto(`${APP}#/estimates`);
await o.getByRole('button', { name: '＋ New estimate' }).click();
await o.getByLabel('First name').fill('Dana');
await o.getByLabel('Last name').fill('Smith');
await o.getByLabel('Phone').fill('231-555-0101');
await o.locator('.bottombar .btn.primary').click();
await o.getByRole('button', { name: '＋ Add tree' }).click();
await o.getByRole('button', { name: 'Ash', exact: true }).click();
await o.getByRole('button', { name: 'Save tree' }).click();
await o.locator('.bottombar .btn.primary').click();
await o.getByRole('button', { name: '2 days' }).click();
await o.getByRole('button', { name: '＋ Stump grinder' }).click();
await o.locator('.bottombar .btn.primary').click();
await o.getByRole('button', { name: '25%' }).click();
await see(o, '$4,965.04', 'estimate total with 6% tax ($4,684 + $281.04)');
await draw(o, o.locator('canvas.sig').first());
await o.getByRole('button', { name: /Client accepts/ }).click();
await see(o, 'Signed by Dana Smith', 'client signs on the device');
await see(o, 'deposit asked: $1,241.26', 'the 25% deposit is shown');

// ---------------------------------------------------------------- deposit, then invoice
await o.getByRole('button', { name: '＋ Record deposit' }).click();
await o.getByLabel('Amount received').fill('500');
await o.getByLabel('Check number').fill('1042');
await o.getByRole('button', { name: 'Save payment' }).click();
await see(o, '$500.00', 'a $500 check deposit is recorded');
await o.getByRole('button', { name: '🧾 Create invoice' }).click();
await see(o, 'Draft. Check it, then send.', 'invoice starts as a draft from the estimate');
await see(o, 'INV-1001', 'it gets the first invoice number');
await see(o, 'Tree work — 2 days', 'with the labor line');
// The job went faster than planned.
await o.getByLabel('Tree work — 2 days quantity').fill('1.5');
await o.getByLabel('Line description').first().fill('Tree work — 1½ days');
await see(o, '$3,905.04', 'editing the days updates the total (3,000 + 684 + 221.04 tax)');
await o.getByLabel('Internal notes').fill('SECRET-INV pays slow, call first');
await shot(o, '01-invoice-draft');
try {
  await o.getByRole('button', { name: /Send invoice/ }).click({ timeout: 10000 });
} catch (e) {
  const b = o.getByRole('button', { name: /Send invoice/ });
  const boxes = [];
  for (let i = 0; i < 5; i++) { boxes.push(JSON.stringify(await b.boundingBox())); await o.waitForTimeout(150); }
  console.error('send button boxes:', boxes.join(' '), 'scrollY', await o.evaluate(() => window.scrollY));
  console.error('diagnose:', JSON.stringify(await b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      disabled: el.disabled, inert: !!el.closest('[inert]'), inViewport: r.top >= 0 && r.bottom <= innerHeight,
      topElement: top ? `${top.tagName}.${top.className}` : null, topIsButton: top === el || el.contains(top),
      openDialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.querySelector('h3')?.textContent),
    };
  })));
  await fail(o, 'send button not clickable');
}
await see(o, 'Partly paid', 'sent invoice shows Partly paid because of the deposit');
await see(o, '$3,405.04', 'balance due counts the deposit');
await o.getByRole('button', { name: '🔗 Customer link' }).click();
const link = await o.getByLabel('Invoice link').inputValue();
ok('invoice link created');
await shot(o, '02-invoice-sent');

// ---------------------------------------------------------------- customer
const cp = await customerCtx.newPage();
await cp.goto(link);
await see(cp, 'Balance due', 'customer opens the invoice without an account');
await see(cp, '$3,405.04', 'customer sees the balance after the deposit');
await see(cp, 'Checks payable to Advanced Tree Service', 'and how to pay');
await notSee(cp, /SECRET|1042|285|markup/i, 'customer never sees internal notes, check numbers, cost or markup');
await shot(cp, '03-customer-invoice');

// ---------------------------------------------------------------- final payment
await o.getByRole('button', { name: '＋ Record payment' }).click();
await o.getByRole('button', { name: 'Cash' }).click();
await o.getByRole('button', { name: 'Save payment' }).click();
await see(o, 'Paid', 'paying the balance marks the invoice Paid');
await syncNow(o);
await cp.reload();
await see(cp, 'Paid in full', 'customer link shows paid in full');
await o.goto(`${APP}#/invoices`);
await o.getByRole('button', { name: 'Paid', exact: true }).click();
await see(o, 'INV-1001', 'invoice appears under Paid');
await o.goto(`${APP}#/estimates`);
await see(o, 'Paid', 'the estimates list shows the job as Paid');
await shot(o, '04-estimates-paid');

// ---------------------------------------------------------------- crew
await o.goto(`${APP}#/team`);
await o.getByLabel('Their email').fill(crew.email);
await o.getByRole('button', { name: 'Create invite link' }).click();
const invite = await o.getByLabel('Invite link').inputValue();
const c = await crewCtx.newPage();
await c.goto(invite);
await signUp(c, crew);
await c.getByLabel('Your name').fill('Sam');
await c.getByRole('button', { name: 'Join company' }).click();
await see(c, 'Tasks with no day yet', 'crew joins');
if (await c.locator('nav.tabnav a[href="#/invoices"]').count()) await fail(c, 'crew has an Invoices tab');
ok('crew has no Invoices tab');
await c.goto(`${APP}#/invoices`);
try {
  await c.getByRole('heading', { name: 'Jobs board' }).waitFor({ timeout: 15000 });
  ok('crew sent away from invoices to their Jobs board');
} catch {
  await fail(c, 'crew not redirected to Jobs');
}
await notSee(c, /\$|INV-|Invoiced|Paid/, 'crew sees no money anywhere on the jobs board');

await browser.close();
console.log(`All ${step} invoice checks passed.`);
