// End-to-end check of Phase 2: build an estimate on a phone, send the customer
// link, the customer signs on their own phone, then a change order and crew view.
//
//   APP_URL=http://127.0.0.1:5173/ node e2e/estimate-flow.mjs [screenshot-dir]
//   E2E_FAKE=1 APP_URL=... node e2e/estimate-flow.mjs [screenshot-dir]   (in-memory stand-in)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
  const body = await page.locator('body').innerText();
  if (pattern.test(body)) await fail(page, `${msg} (found ${pattern})`);
  ok(msg);
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
async function draw(page, canvas) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 18, box.y + box.height * (0.6 + 0.25 * Math.sin(i)));
  await page.mouse.up();
}

const browser = await chromium.launch();
const ownerCtx = await browser.newContext({ ...devices['iPhone 13'] });
const customerCtx = await browser.newContext({ ...devices['Pixel 7'] });
const crewCtx = await browser.newContext({ ...devices['iPad Pro 11 landscape'] });
const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
if (process.env.E2E_FAKE) {
  const fake = createFakeBackend();
  for (const c of [ownerCtx, customerCtx, crewCtx, deskCtx]) await fake.install(c);
}
const o = await ownerCtx.newPage();
for (const p of [o]) {
  p.on('pageerror', (e) => console.error('page error:', e.message, (e.stack || '').split('\n').slice(0, 6).join(' | ')));
  p.on('dialog', (d) => d.accept());
}

async function signUp(page, who) {
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.locator('form button[type=submit]').click();
}
const next = (page) => page.locator('.bottombar .btn.primary').click();

// ---------------------------------------------------------------- owner setup
await o.goto(APP);
await signUp(o, owner);
await o.getByLabel('Your name').fill('Joey');
await o.getByRole('button', { name: 'Create company' }).click();
await see(o, 'Coming in Phase 4', 'owner is in');
await o.goto(`${APP}#/company`);
await o.getByLabel('Phone').fill('231-555-0000');
await o.getByRole('button', { name: 'Save', exact: true }).click();
await see(o, 'Saved', 'owner adds the company phone');
await o.goto(`${APP}#/account`);
await draw(o, o.locator('canvas.sig'));
ok('owner signs once for all estimates');

// ---------------------------------------------------------------- wizard
await o.goto(`${APP}#/estimates`);
await o.getByRole('button', { name: '＋ New estimate' }).click();
await see(o, 'Client & Site', 'new estimate opens on Client & Site');
await see(o, 'E-1001', 'it gets the first estimate number');
await o.getByLabel('First name').fill('Dana');
await o.getByLabel('Last name').fill('Smith');
await o.getByLabel('Phone').fill('231-555-0101');
await o.getByLabel('Town').fill('Traverse City');
await o.getByRole('button', { name: 'Haul all' }).click();
await o.getByLabel('Notes for the client').fill('We will protect the garden bed.');
await o.getByLabel('Internal notes').fill('SECRET-JOB gate code 4411, dog in yard');
await shot(o, '01-client-site');
await next(o);

await see(o, 'No trees added yet', 'trees step');
await o.getByRole('button', { name: '＋ Add tree' }).click();
await o.getByRole('button', { name: 'Sugar Maple' }).click();
await o.getByRole('button', { name: 'Removal', exact: true }).click();
await o.getByRole('button', { name: '24–36″' }).click();
await o.locator('dialog .internal textarea').fill('SECRET-TREE rig over the garage');
await shot(o, '02-tree-sheet');
await o.getByRole('button', { name: 'Save tree' }).click();
await see(o, 'Sugar Maple — Removal', 'tree added');
await shot(o, '03-trees');
await next(o);

await o.getByRole('button', { name: '2 days' }).click();
await o.getByRole('button', { name: '＋ Stump grinder' }).click();
await see(o, 'Customer price $342.00/day', 'equipment shows the customer price with markup built in');
await see(o, 'Your cost $570.00', 'owner sees the private cost and markup');
await shot(o, '04-pricing');
await next(o);

await see(o, '$4,684.00', 'review total is labor $4,000 + grinder 2 × $342');
await shot(o, '05-review');
await next(o);

await see(o, 'Send to client', 'send step');
await notSee(o, /SECRET|285|markup/i, 'the customer document has no internal notes, cost or markup');
await o.getByRole('button', { name: '🔗 Customer link' }).click();
const link = await o.getByLabel('Customer link').inputValue();
if (!link.includes('#/c/')) await fail(o, 'customer link not created');
ok('customer link created');
await shot(o, '06-send');

// ---------------------------------------------------------------- customer
const cpage = await customerCtx.newPage();
await cpage.goto(link);
await see(cpage, 'Accept this estimate', 'customer opens the link without an account');
await see(cpage, '$4,684.00', 'customer sees the total');
await notSee(cpage, /SECRET|285|markup|gate code/i, 'customer never sees internal notes, cost or markup');
await shot(cpage, '07-customer-link');
await cpage.getByLabel('Your full name').fill('Dana Smith');
await draw(cpage, cpage.locator('canvas.sig'));
await cpage.getByRole('checkbox').check();
await cpage.getByRole('button', { name: 'Sign and accept' }).click();
await see(cpage, 'Signed by Dana Smith', 'customer signs on their phone');
await shot(cpage, '08-customer-signed');

// ---------------------------------------------------------------- owner sees it signed, adds a change order
await o.goto(`${APP}#/estimates`);
await o.getByRole('button', { name: /Synced|waiting|Syncing|Offline/ }).click();
await o.getByRole('button', { name: 'Sync now' }).click();
await see(o, 'Approved', 'estimate shows Approved after sync');
await o.getByText('Dana Smith').first().click();
await see(o, 'Signed by Dana Smith', 'owner sees who signed');
await see(o, '(online)', 'and that it was signed through the link');
await o.getByRole('button', { name: '＋ Change order' }).click();
await o.getByRole('button', { name: 'Weather delay' }).click();
await o.locator('dialog').getByLabel('Client’s name').fill('Dana Smith');
await draw(o, o.locator('dialog canvas.sig'));
await o.getByRole('button', { name: 'Save change order' }).click();
await see(o, '$6,684.00', 'change order adds a day at $2,000');
await shot(o, '09-signed-with-change-order');
await o.getByRole('button', { name: /Synced|waiting|Syncing|Offline/ }).click();
await o.getByRole('button', { name: 'Sync now' }).click();
await see(o, 'Everything on this device is saved', 'change order uploads');

// ---------------------------------------------------------------- PDF file
const d = await deskCtx.newPage();
d.on('pageerror', (e) => console.error('desk page error:', e.message));
d.on('console', (m) => m.type() === 'error' && console.error('desk console:', m.text().slice(0, 300)));
await d.goto(link);
await see(d, 'Signed by Dana Smith', 'signed copy on a computer');
await see(d, 'Change order 1', 'the customer’s copy includes the change order');
await see(d, '$6,684.00', 'and its new total');
const [download] = await Promise.all([d.waitForEvent('download'), d.getByRole('button', { name: 'Download PDF' }).click()]);
const pdf = readFileSync(await download.path());
if (pdf.subarray(0, 4).toString() !== '%PDF' || pdf.length < 20000) await fail(d, `PDF looks wrong (${pdf.length} bytes)`);
ok(`real PDF file downloads (${Math.round(pdf.length / 1024)} KB)`);
if (SHOTS) (await import('node:fs')).writeFileSync(`${SHOTS}/estimate.pdf`, pdf);

// ---------------------------------------------------------------- crew
await o.goto(`${APP}#/team`);
await o.getByLabel('Their email').fill(crew.email);
await o.getByRole('button', { name: 'Create invite link' }).click();
const invite = await o.getByLabel('Invite link').inputValue();
const c = await crewCtx.newPage();
c.on('dialog', (dlg) => dlg.accept());
await c.goto(invite);
await signUp(c, crew);
await c.getByLabel('Your name').fill('Sam');
await c.getByRole('button', { name: 'Join company' }).click();
await see(c, 'Coming in Phase 4', 'crew joins');
await c.goto(`${APP}#/estimates`);
await see(c, 'Dana Smith', 'crew sees the job');
await notSee(c, /\$/, 'crew list shows no prices');
await c.getByText('Dana Smith').first().click();
await see(c, 'SECRET-JOB gate code 4411', 'crew sees the internal job notes');
await see(c, 'SECRET-TREE rig over the garage', 'crew sees the internal tree notes');
await notSee(c, /\$/, 'crew job sheet shows no prices');
await shot(c, '10-crew-job-sheet');

// ---------------------------------------------------------------- tablet layout
const t = await crewCtx.newPage();
await t.goto(`${APP}#/estimates`);
await shot(t, '11-tablet-estimates');

await browser.close();
console.log(`All ${step} estimate checks passed.`);
