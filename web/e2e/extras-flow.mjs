// End-to-end check of Phase 5, step 7: importing contacts from an iPhone
// contacts file, the Archive for paid jobs, and the notification bell.
//
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173/ node e2e/extras-flow.mjs [screenshot-dir]
import { createFakeBackend } from './fake-backend.mjs';
import { APP, chromium, crewJoin, devices, done, fail, notSee, ok, ownerSetup, page, see, shot, signedEstimate, syncNow } from './helpers.mjs';

if (!process.env.E2E_FAKE) {
  console.log('extras-flow needs E2E_FAKE=1 (it marks a job paid inside the stand-in backend).');
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

await ownerSetup(o, { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' });
await crewJoin(o, c, { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' }, 'Sam Rivera');
await syncNow(o);
ok('owner and crew are set up');

// ---------------------------------------------------------------- import contacts from the iPhone
const vcf = {
  name: 'Customers.vcf', mimeType: 'text/vcard', buffer: Buffer.from([
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Kowalski;Nadia;;;', 'TEL;type=CELL:(231) 555-0199', 'item1.ADR;type=HOME:;;4120 Peninsula Dr;Traverse City;MI;49686;', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Dunlap;Mike;;;', 'TEL:231-555-0112', 'EMAIL:mike@example.com', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'ORG:Hollis Point Cottage Assn', 'TEL:+1 231 555 0177', 'END:VCARD',
  ].join('\r\n')),
};
await o.goto(`${APP}#/contacts`);
await o.getByRole('button', { name: 'Import' }).click();
await see(o, 'Press and hold a list', 'Import explains how to export contacts from an iPhone');
await o.getByLabel('Contacts file').setInputFiles(vcf);
await see(o, '3 new', 'the preview finds 3 new contacts');
await shot(o, '01-import-preview');
await o.getByRole('button', { name: 'Import 3 contacts' }).click();
await see(o, '3 contacts added to Customers', 'they are imported');
for (const n of ['Nadia Kowalski', 'Mike Dunlap', 'Hollis Point Cottage Assn']) await see(o, n, `${n} is in Customers`);
await o.getByRole('button', { name: 'Import' }).click();
await o.getByLabel('Contacts file').setInputFiles(vcf);
await see(o, '0 new', 'importing the same file again finds nobody new');
await see(o, 'Already in Customers as Nadia Kowalski', 'and says who each one already is');
if (await o.getByRole('button', { name: /^Import \d+ contact/ }).isEnabled()) await fail(o, 'import button should be off with nothing picked');
ok('so nothing gets doubled up');
await o.getByRole('button', { name: 'Close' }).click();

// ---------------------------------------------------------------- the bell: crew mark a job blocked
await signedEstimate(o, 'Dana', 'Smith', 'Traverse City');
const jobUrl = o.url().replace(/\/review$/, '');
await syncNow(o);
await o.goto(`${APP}#/calendar`);
await o.getByRole('button', { name: 'Next month' }).click();
await o.locator('.sched-card', { hasText: 'Dana Smith' }).click();
await o.locator('.mcell:not(.outside):not(.sunday)').nth(3).click();
await syncNow(o);
await c.goto(`${APP}#/board`);
await syncNow(c);
await c.getByRole('button', { name: 'More actions for Dana Smith' }).click();
await c.getByRole('menuitem', { name: 'Blocked…' }).click();
await c.getByRole('button', { name: 'Weather' }).click();
await syncNow(c);
ok('crew mark the job blocked: weather');
await o.goto(`${APP}#/`);
await syncNow(o);
await o.getByRole('button', { name: 'Notifications, 1 new' }).waitFor({ timeout: 10000 }).catch(() => fail(o, 'the bell did not ring'));
ok('the owner’s bell shows 1 new');
await o.getByRole('button', { name: 'Notifications, 1 new' }).click();
await see(o, 'Dana Smith is blocked: weather', 'it says what happened');
await shot(o, '02-bell');
await o.locator('.bell-item', { hasText: 'Dana Smith is blocked' }).click();
await o.waitForURL(new RegExp(jobUrl.split('#')[1]), { timeout: 5000 }).catch(() => fail(o, 'tapping it did not open the job'));
ok('tapping it opens the job');
await o.getByRole('button', { name: 'Notifications', exact: true }).waitFor({ timeout: 8000 }).catch(() => fail(o, 'the count did not clear'));
ok('and the count clears once seen');
const crewBell = await c.getByRole('button', { name: /^Notifications/ }).getAttribute('aria-label');
if (crewBell !== 'Notifications') await fail(c, `crew’s own change rang their bell (${crewBell})`);
ok('things you did yourself don’t ring your own bell');

// ---------------------------------------------------------------- the archive: paid jobs leave the board
const j = fake.tables.jobs.find((x) => x.client?.firstName === 'Dana');
Object.assign(j, { stage: 'paid', _seq: 1e9 });
await o.goto(`${APP}#/board`);
await syncNow(o);
await notSee(o, /Dana Smith/, 'once paid, the job leaves the Jobs board');
await o.getByRole('link', { name: 'Archive' }).first().click();
await see(o, 'Dana Smith', 'and is in the Archive');
await o.getByLabel('Search the archive').fill('traverse');
await see(o, 'E-1001', 'searching the archive by town finds it');
await o.getByLabel('Search the archive').fill('nobody');
await see(o, 'No matches.', 'and a search for someone else finds nothing');
await shot(o, '03-archive');

// ---------------------------------------------------------------- notes from a card
await signedEstimate(o, 'Lee', 'Park', 'Kingsley');
await o.goto(`${APP}#/board`);
await syncNow(o);
const lee = o.locator('.jcard', { hasText: 'Lee Park' });
await lee.getByRole('button', { name: 'Notes' }).click();
await o.locator('dialog[open]').getByLabel('Add a note').fill('Gate code 4471');
await o.locator('dialog[open]').getByRole('button', { name: 'Add note', exact: true }).click();
await see(o, 'Gate code 4471', 'notes open from the board card, and a note can be added there');
await o.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
await lee.getByRole('button', { name: 'Notes, 1' }).waitFor({ timeout: 5000 }).catch(() => fail(o, 'card notes icon did not show 1'));
ok('the card\u2019s notes icon now shows 1');
if (!o.url().includes('#/board')) await fail(o, 'opening notes left the board');
ok('all without leaving the board');

// ---------------------------------------------------------------- a new lead: schedule the visit, then write the estimate
await o.getByRole('button', { name: 'New lead' }).click();
await o.getByLabel('First name').fill('Jim');
await o.getByLabel('Last name').fill('Peterson');
await o.getByLabel('Town').fill('Beulah');
await o.waitForTimeout(600); // the draft saves itself after typing stops
await o.goto(`${APP}#/`);
await see(o, 'New lead, no visit scheduled', 'the dashboard flags a new lead with no visit');
await o.goto(`${APP}#/board`);
await o.getByRole('tab', { name: /^New/ }).click();
const jim = o.locator('.board-col[data-col="new"] .jcard', { hasText: 'Jim Peterson' });
await jim.waitFor({ timeout: 5000 }).catch(() => fail(o, 'lead not in the New column'));
ok('the lead is in the New column');
await see(o, 'No visit scheduled yet', 'with no visit yet');
await shot(o, '04-new-lead');
await jim.getByRole('button', { name: 'Schedule visit' }).click();
const visitTitle = await o.locator('dialog[open]').getByLabel('Title').inputValue();
if (visitTitle !== 'Bid · Jim Peterson') await fail(o, `visit title was "${visitTitle}"`);
ok('Schedule visit opens a bid filled in from the lead');
await o.locator('dialog[open]').getByRole('button', { name: 'Save', exact: true }).first().click();
await jim.getByText(/^Visit /).waitFor({ timeout: 5000 }).catch(() => fail(o, 'visit not shown on the card'));
ok('the card shows the visit');
await jim.getByRole('button', { name: 'Write estimate' }).click();
await see(o, 'Client & Site', 'after the visit, Write estimate opens the estimate');
await o.goto(`${APP}#/`);
await notSee(o, /New lead, no visit scheduled/, 'and the dashboard no longer flags it');

await browser.close();
done('extras');
