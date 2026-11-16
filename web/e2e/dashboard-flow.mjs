// End-to-end check of Phase 5 step 1: the new top bar, menu, bottom tabs,
// dashboard, search and Quick Add, for owner and crew, on phone and iPad.
//
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173/ node e2e/dashboard-flow.mjs [screenshot-dir]
import { APP, chromium, contexts, crewJoin, devices, done, fail, notSee, ok, ownerSetup, page, see, shot, signedEstimate, syncNow } from './helpers.mjs';

const stamp = Date.now();
const browser = await chromium.launch();
const [ownerCtx, crewCtx, tabletCtx] = await contexts(browser, [
  { ...devices['iPhone 13'] },
  { ...devices['iPhone 13'] },
  { ...devices['iPad Pro 11 landscape'] },
]);
const o = await page(ownerCtx);
const c = await page(crewCtx);

// ---------------------------------------------------------------- owner on a phone
await ownerSetup(o, { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' });
ok('owner lands on the dashboard');
const tabs = await o.locator('nav.tabnav a').allInnerTexts();
if (tabs.map((t) => t.trim()).join(',') !== 'Home,Calendar,Estimates,Jobs,Invoices') await fail(o, `bottom tabs are ${tabs.join(',')}`);
ok('phone bottom bar: Home, Calendar, Estimates, Jobs, Invoices');
await see(o, 'Owed to you', 'owner sees the money tiles');

await signedEstimate(o, 'Dana', 'Smith', 'Traverse City');
await o.locator('nav.tabnav a', { hasText: 'Home' }).click();
await see(o, 'not on the calendar', 'a signed job shows under Needs attention as not scheduled');
const row = o.locator('.attn', { hasText: 'Dana Smith' });
if (!(await row.locator('.pill', { hasText: 'Approved' }).count())) await fail(o, 'no Approved pill on the attention row');
ok('it carries the orange Approved pill');
await shot(o, '01-phone-dashboard');

// Search finds the job from anywhere.
await o.locator('.top-search label').click(); // on a phone the search opens from the magnifying glass
await o.getByLabel('Search jobs and customers').fill('dana');
await o.getByRole('option', { name: /Dana Smith/ }).first().click();
await see(o, 'Signed by Dana Smith', 'search opens the job');

// Quick Add → calendar entry opens a new entry on the calendar.
await o.getByRole('button', { name: 'Quick add' }).click();
await o.getByRole('menuitem', { name: 'Calendar entry' }).click();
await see(o, 'Save', 'Quick Add opens a new calendar entry');
await o.keyboard.press('Escape');

// The phone menu opens as a drawer with the money section.
await o.getByRole('button', { name: 'Menu' }).click();
const drawerLinks = await o.locator('.sidebar a').allInnerTexts();
if (!drawerLinks.some((t) => t.includes('Invoices'))) await fail(o, `drawer missing Invoices: ${drawerLinks.join(',')}`);
ok('the phone menu opens with Work, Money and Settings');
await shot(o, '02-phone-menu');
await o.locator('.sidebar a', { hasText: 'Customers' }).click();
await o.locator('.shell.drawer-open').waitFor({ state: 'detached', timeout: 3000 }).catch(() => fail(o, 'drawer stayed open after choosing a page'));
ok('choosing a page closes the menu');

// ---------------------------------------------------------------- crew
await crewJoin(o, c, { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' }, 'Sam Rivera');
ok('crew lands on the dashboard');
const crewTabs = (await c.locator('nav.tabnav a').allInnerTexts()).map((t) => t.trim());
if (crewTabs.join(',') !== 'Home,Calendar,Jobs,Customers') await fail(c, `crew tabs are ${crewTabs.join(',')}`);
ok('crew bottom bar has no Estimates or Invoices');
await notSee(c, /Owed to you|\$\d/, 'crew dashboard shows no money');
await c.getByRole('button', { name: 'Quick add' }).click();
if (await c.getByRole('menuitem', { name: 'New estimate' }).count()) await fail(c, 'crew can start an estimate');
ok('crew Quick Add has no New estimate');

// ---------------------------------------------------------------- iPad: collapse the menu, and it stays collapsed
await syncNow(o);
const t = await page(tabletCtx);
await ownerSetup(t, { email: `tablet-${stamp}@ats.test`, password: 'correct-horse-3' });
await see(t, 'Collapse menu', 'iPad shows the full side menu');
await t.getByRole('button', { name: 'Collapse menu' }).click();
const w = await t.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
if (w > 80) await fail(t, `collapsed menu is ${w}px wide`);
ok('collapsing leaves a narrow icon strip');
await t.reload();
await t.getByText('Needs attention').first().waitFor();
const w2 = await t.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
if (w2 > 80) await fail(t, 'menu did not stay collapsed after reload');
ok('the iPad remembers the collapsed menu');
await shot(t, '03-ipad-collapsed');
await t.getByRole('button', { name: 'Expand menu' }).click();
ok('and it expands again');

await browser.close();
done('dashboard');
