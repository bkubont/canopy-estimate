// End-to-end check of Phase 1. Plays two people on two devices: an owner and a crew member.
//
// Against a real Supabase project (recommended, see SETUP.md):
//   APP_URL=http://127.0.0.1:5173 node e2e/two-devices.mjs [screenshot-dir]
// Against the in-memory stand-in (no Supabase needed; start the app with
// VITE_SUPABASE_URL=http://fake-supabase.test VITE_SUPABASE_ANON_KEY=anon):
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173 node e2e/two-devices.mjs [screenshot-dir]
import { createRequire } from 'node:module';
import { createFakeBackend } from './fake-backend.mjs';

// require() also finds a globally installed Playwright (npm i -g playwright).
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const APP = process.env.APP_URL || 'http://127.0.0.1:5173/';
const SHOTS = process.argv[2] || '';
const stamp = Date.now();
const owner = { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' };
const crew = { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' };

let step = 0;
const ok = (msg) => console.log(`ok ${++step} - ${msg}`);
const fail = (msg) => {
  console.error(`FAILED: ${msg}`);
  process.exit(1);
};
async function expectText(page, text, msg, timeout = 15000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  } catch {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${step + 1}.png`, fullPage: true });
    fail(`${msg} (did not find "${text}")`);
  }
  ok(msg);
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const browser = await chromium.launch();
const ownerCtx = await browser.newContext({ ...devices['iPhone 13'] });
const crewCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
let setOffline = (ctx, value) => ctx.setOffline(value);
if (process.env.E2E_FAKE) {
  const fake = createFakeBackend();
  setOffline = fake.setOffline;
  await fake.install(ownerCtx);
  await fake.install(crewCtx);
}
const o = await ownerCtx.newPage();
const c = await crewCtx.newPage();
for (const p of [o, c]) {
  p.on('pageerror', (e) => console.error('page error:', e.message));
  p.on('dialog', (d) => d.accept());
}

async function signUp(page, who) {
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.locator('form button[type=submit]').click();
}

// ---------------------------------------------------------------- owner
await o.goto(APP);
await expectText(o, 'Sign in', 'owner sees the sign-in screen');
await shot(o, '01-sign-in');
await signUp(o, owner);
await expectText(o, 'Set up your company', 'new account is asked to set up a company');
await o.getByLabel('Your name').fill('Joey');
await o.getByRole('button', { name: 'Create company' }).click();
await expectText(o, 'Coming in Phase 4', 'owner lands in the app');
await expectText(o, 'Synced', 'sync badge reports synced');
await shot(o, '02-home');

await o.goto(`${APP}#/contacts/new`);
await o.getByLabel('First name').fill('Dana');
await o.getByLabel('Last name').fill('Smith');
await o.getByLabel('Phone').fill('231-555-0101');
await o.getByLabel('Town').fill('Traverse City');
await o.getByRole('button', { name: 'Save contact' }).click();
await expectText(o, 'Dana Smith', 'owner adds a contact');
await expectText(o, 'Synced', 'contact uploads to the server');

await o.goto(`${APP}#/company`);
await expectText(o, 'Pricing defaults', 'owner sees pricing defaults');
await shot(o, '03-company-owner');

await o.goto(`${APP}#/team`);
await o.getByLabel('Their email').fill(crew.email);
await o.getByLabel('Role').first().selectOption('crew');
await o.getByRole('button', { name: 'Create invite link' }).click();
await expectText(o, `Send this link to ${crew.email}`, 'owner creates an invite link');
const link = await o.getByLabel('Invite link').inputValue();
await shot(o, '04-team-invite');

// ---------------------------------------------------------------- crew
await c.goto(link);
await expectText(c, 'You’ve been invited', 'invite link asks the crew member to sign in');
await signUp(c, crew);
await expectText(c, 'Join your team', 'after sign-up the invite is offered');
await c.getByLabel('Your name').fill('Sam');
await c.getByRole('button', { name: 'Join company' }).click();
await expectText(c, 'Coming in Phase 4', 'crew member joins the company');

await c.goto(`${APP}#/contacts`);
await expectText(c, 'Dana Smith', 'crew sees the contact the owner added (second device)');
await shot(c, '05-crew-contacts');

await c.goto(`${APP}#/company`);
await expectText(c, 'Only the owner can change company details', 'crew sees company details read-only');
if (await c.getByText('Pricing defaults').count()) fail('crew must not see pricing');
ok('crew does not see pricing');
if ((await c.locator('a[href="#/team"]').count()) > 0) fail('crew must not see Team');
ok('crew has no Team page');
await shot(c, '06-crew-company');

// ---------------------------------------------------------------- offline + sync back
await c.goto(`${APP}#/contacts`);
await setOffline(crewCtx, true);
await c.getByRole('link', { name: '＋ New contact' }).click();
await c.getByLabel('First name').fill('Offline');
await c.getByLabel('Last name').fill('Lead');
await c.getByRole('button', { name: 'Save contact' }).click();
await expectText(c, 'Offline Lead', 'crew adds a contact with no connection');
await c.evaluate(() => window.dispatchEvent(new Event('offline')));
await c.getByRole('button', { name: /waiting|Offline/ }).click();
await expectText(c, 'No connection. Everything is saved on this device', 'app says the change is safe on the device');
await shot(c, '07-crew-offline');
await setOffline(crewCtx, false);
await c.getByRole('button', { name: 'Sync now' }).click();
await expectText(c, 'Everything on this device is saved to the server', 'change uploads when back online');

await o.goto(`${APP}#/contacts`);
await o.reload();
await expectText(o, 'Offline Lead', 'owner sees the contact the crew added offline');
await shot(o, '08-owner-sees-offline-contact');

// ---------------------------------------------------------------- edit on one, see on other
await o.getByText('Dana Smith').click();
await o.getByLabel('Phone').fill('231-555-0199');
await o.getByRole('button', { name: 'Save contact' }).click();
await expectText(o, '231-555-0199', 'owner edit shows in the list right away');
await o.getByRole('button', { name: /waiting|Synced|Syncing/ }).click();
await o.getByRole('button', { name: 'Sync now' }).click();
await expectText(o, 'Everything on this device is saved to the server', 'owner edit uploads');
await c.goto(`${APP}#/calendar`);
await c.goto(`${APP}#/contacts`);
await c.getByRole('button', { name: /Synced|waiting|Syncing/ }).click();
await c.getByRole('button', { name: 'Sync now' }).click();
await expectText(c, '231-555-0199', 'crew device picks up the owner’s edit');

await browser.close();
console.log(`All ${step} end-to-end checks passed.`);
