// Shared helpers for the end-to-end walkthroughs.
import { createRequire } from 'node:module';
import { createFakeBackend } from './fake-backend.mjs';

export const { chromium, devices } = createRequire(import.meta.url)('playwright');
export const APP = process.env.APP_URL || 'http://127.0.0.1:5173/';
export const SHOTS = process.argv[2] || '';

let step = 0;
export const ok = (msg) => console.log(`ok ${++step} - ${msg}`);
export const done = (what) => console.log(`All ${step} ${what} checks passed.`);
export async function fail(page, msg) {
  if (SHOTS && page) await page.screenshot({ path: `${SHOTS}/fail-${step + 1}.png`, fullPage: true });
  console.error(`FAILED: ${msg}`);
  process.exit(1);
}
export async function see(page, text, msg, timeout = 15000) {
  try {
    await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ timeout });
  } catch {
    await fail(page, `${msg} (did not see "${text}")`);
  }
  ok(msg);
}
export async function notSee(page, pattern, msg) {
  if (pattern.test(await page.locator('body').innerText())) await fail(page, `${msg} (found ${pattern})`);
  ok(msg);
}
export const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
export async function draw(page, canvas) {
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 18, box.y + box.height * (0.6 + 0.25 * Math.sin(i)));
  await page.mouse.up();
}
export async function syncNow(page) {
  await page.getByRole('button', { name: /Synced|waiting|Syncing|Offline|not saved/ }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.getByText('Everything on this device is saved').first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Close' }).click();
}
export async function signUp(page, who) {
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.locator('form button[type=submit]').click();
}
export async function contexts(browser, specs) {
  const ctxs = await Promise.all(specs.map((s) => browser.newContext(s)));
  if (process.env.E2E_FAKE) {
    const fake = createFakeBackend();
    for (const c of ctxs) await fake.install(c);
  }
  return ctxs;
}
export async function page(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  p.on('dialog', (d) => d.accept());
  return p;
}
/** Owner account with a company. */
export async function ownerSetup(p, who) {
  await p.goto(APP);
  await signUp(p, who);
  await p.getByLabel('Your name').fill('Joey');
  await p.getByRole('button', { name: 'Create company' }).click();
  await p.getByText('Tasks with no day yet').first().waitFor({ timeout: 15000 });
}
/** Crew member joins through an invite link made on the owner's page. */
export async function crewJoin(owner, crewPage, who, name) {
  await owner.goto(`${APP}#/team`);
  await owner.getByLabel('Their email').fill(who.email);
  await owner.getByRole('button', { name: 'Create invite link' }).click();
  const invite = await owner.getByLabel('Invite link').inputValue();
  await crewPage.goto(invite);
  await signUp(crewPage, who);
  await crewPage.getByLabel('Your name').fill(name);
  await crewPage.getByRole('button', { name: 'Join company' }).click();
  await crewPage.getByText('Tasks with no day yet').first().waitFor({ timeout: 15000 });
}
/** A quick signed estimate: one tree, 2 days, a stump grinder; client signs on the device. */
export async function signedEstimate(p, first, last, town) {
  await p.goto(`${APP}#/estimates`);
  await p.getByRole('button', { name: '＋ New estimate' }).click();
  await p.getByLabel('First name').fill(first);
  await p.getByLabel('Last name').fill(last);
  await p.getByLabel('Town').fill(town);
  await p.locator('.bottombar .btn.primary').click();
  await p.getByRole('button', { name: '＋ Add tree' }).click();
  await p.getByRole('button', { name: 'Ash', exact: true }).click();
  await p.getByRole('button', { name: 'Save tree' }).click();
  await p.locator('.bottombar .btn.primary').click();
  await p.getByRole('button', { name: '2 days' }).click();
  await p.getByRole('button', { name: '＋ Stump grinder' }).click();
  await p.locator('.bottombar .btn.primary').click();
  await draw(p, p.locator('canvas.sig').first());
  await p.getByRole('button', { name: /Client accepts/ }).click();
  await p.getByText(/Signed by/).first().waitFor({ timeout: 15000 });
}
