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
await syncNow(o);
for (let i = 0; i < 30 && fake.tables.customers.filter((c) => !c.deleted_at).length < 3; i++) await o.waitForTimeout(200);
if (fake.tables.customers.length < 3) await fail(o, 'imported contacts never reached the server');
ok('the 3 imported contacts reach the server');

// A whole iPhone address book: 450 contacts, with photos, goes up in batches.
const big = Array.from({ length: 450 }, (_, i) => [
  'BEGIN:VCARD', 'VERSION:3.0', `N:Person${i};Test;;;`, `FN:Test Person${i}`, `item1.TEL;type=pref:(231) 600-${String(1000 + i).slice(-4)}`, 'item1.X-ABLabel:_$!<Mobile>!$_',
  'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAA', ' MqADAAQAAAABAAAAMgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs', 'END:VCARD',
].join('\n')).join('\n');
const before = fake.batches.length;
await o.getByRole('button', { name: 'Import' }).click();
await o.getByLabel('Contacts file').setInputFiles({ name: 'All Contacts.vcf', mimeType: 'text/x-vcard', buffer: Buffer.from(big) });
await see(o, '450 new', 'a 450-contact iPhone export (with photos) reads fine');
await o.getByRole('button', { name: 'Import 450 contacts' }).click();
await see(o, '450 contacts added to Customers', 'and imports in one go');
await syncNow(o);
for (let i = 0; i < 50 && fake.tables.customers.length < 453; i++) await o.waitForTimeout(200);
if (fake.tables.customers.length < 453) await fail(o, `only ${fake.tables.customers.length - 3} of 450 reached the server`);
const sizes = fake.batches.slice(before).filter((b) => b.table === 'customers').map((b) => b.count);
if (sizes.join(',') !== '200,200,50') await fail(o, `uploaded in batches of ${sizes.join(',')}`);
ok('all 450 reach the server in 3 batches (not 450 separate uploads)');
await o.getByRole('button', { name: 'Import' }).click();
await o.getByLabel('Contacts file').setInputFiles({ name: 'IMG_0014.jpeg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
await see(o, 'isn’t a contacts file', 'picking the wrong file says so plainly');
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

// ---------------------------------------------------------------- deposits and payments from a card
await lee.getByRole('button', { name: 'Payments' }).click();
await see(o, 'Nothing recorded yet', 'the $ icon on the card opens the job\u2019s payments');
await see(o, 'Left on the estimate', 'with what\u2019s left to pay');
await o.locator('dialog[open]').getByRole('button', { name: 'Record deposit' }).click();
const dep = o.locator('dialog[open]').last();
await dep.getByLabel('Amount received').fill('500');
await dep.getByLabel('Check number').fill('1042');
await dep.getByRole('button', { name: 'Save payment' }).click();
await see(o, 'Check #1042 · deposit', 'a $500 deposit by check is recorded right there');
await see(o, '$4,184.00', 'and the amount left drops to $4,184.00');
await shot(o, '05-card-payments');
await o.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
await lee.getByRole('button', { name: 'Payments, 1' }).waitFor({ timeout: 5000 }).catch(() => fail(o, 'card $ icon did not show 1'));
ok('the card\u2019s $ icon now shows 1 payment');
await syncNow(o);
await c.goto(`${APP}#/`);
await syncNow(c);
for (const where of ['#/', '#/board', '#/calendar']) {
  await c.goto(`${APP}${where}`);
  await c.waitForTimeout(400);
  if (await c.getByRole('button', { name: /^Payments/ }).count()) await fail(c, `crew see a $ icon on ${where}`);
}
ok('crew never get the $ icon');

// ---------------------------------------------------------------- a new lead: schedule the visit, then write the estimate
await o.getByRole('button', { name: 'New lead' }).click();
await o.getByLabel('First name').fill('Jim');
await o.getByLabel('Last name').fill('Peterson');
await o.getByLabel('Town').fill('Beulah');
await o.waitForTimeout(600); // the draft saves itself after typing stops
await o.goto(`${APP}#/`);
await see(o, 'New lead, no visit scheduled', 'the dashboard flags a new lead with no visit');
await o.getByText('New lead, no visit scheduled').click();
await o.locator('[role=tab][aria-selected=true]', { hasText: /^New/ }).waitFor({ timeout: 5000 }).catch(() => fail(o, 'the alert did not open the board on New'));
ok('tapping the alert opens the board on the New column (phone)');
const jim = o.locator('.board-col[data-col="new"] .jcard', { hasText: 'Jim Peterson' });
await jim.waitFor({ timeout: 5000 }).catch(() => fail(o, 'lead not in the New column'));
ok('the lead is in the New column');
await see(o, 'No visit scheduled yet', 'with no visit yet');
if (await jim.locator('.jcard-total').count()) await fail(o, 'a lead with no estimate shows a price');
ok('and no price until the estimate is written');
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

// ---------------------------------------------------------------- cancel: the customer said no
await o.goBack();
await o.getByRole('button', { name: 'Cancel estimate' }).click();
await o.locator('dialog[open]').getByRole('button', { name: 'Went with someone else' }).click();
await see(o, 'calendar entry is cancelled too', 'cancelling warns that the visit is cancelled too');
await o.locator('dialog[open]').getByRole('button', { name: 'Cancel this estimate' }).click();
await see(o, 'Went with someone else', 'the estimate shows it was cancelled, and why');
await shot(o, '06-cancelled');
await o.goto(`${APP}#/board`);
await o.getByRole('tab', { name: /^New/ }).click();
await notSee(o, /Jim Peterson/, 'it leaves the board');
await o.goto(`${APP}#/estimates`);
await see(o, 'Lee Park', 'Estimates shows the open jobs');
await notSee(o, /Jim Peterson/, 'but not cancelled ones');
await o.getByRole('button', { name: 'Cancelled', exact: true }).click();
await see(o, 'Jim Peterson', 'they are under Cancelled');
await o.getByText('Jim Peterson').first().click();
await o.getByRole('button', { name: 'Reopen' }).click();
await notSee(o, /Went with someone else/, 'Reopen brings it back');
await o.goto(`${APP}#/board`);
await o.getByRole('tab', { name: /^New/ }).click();
await see(o, 'Jim Peterson', 'onto the board');
// A signed job with a deposit, from the board menu.
await o.getByRole('tab', { name: /^Approved/ }).click();
await o.locator('.jcard', { hasText: 'Lee Park' }).getByRole('button', { name: /More actions/ }).click();
const menuOk = await o.evaluate(() => {
  const items = [...document.querySelectorAll('[role=menu] [role=menuitem]')];
  return items.length > 0 && items.every((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= 0 && r.bottom <= window.innerHeight && (hit === el || el.contains(hit));
  });
});
if (!menuOk) await fail(o, 'the card menu is cut off or covered');
ok('the card\u2019s \u22ef menu shows every item in full, nothing cut off');
// On a short screen the menu scrolls inside itself; that must not close it.
await o.evaluate(() => { const m = document.querySelector('[role=menu]'); m.style.maxHeight = '40px'; m.scrollTop = 30; m.dispatchEvent(new Event('scroll')); });
await o.waitForTimeout(200);
if (!(await o.locator('[role=menu]').count())) await fail(o, 'scrolling inside the menu closed it');
ok('scrolling inside a long menu keeps it open');
await o.evaluate(() => { const m = document.querySelector('[role=menu]'); m.style.maxHeight = ''; });
await shot(o, '08-card-menu');
await o.getByRole('menuitem', { name: 'Cancel job…' }).click();
await see(o, '$500.00 has been paid on this job', 'cancelling a job with a deposit says money was paid');
await o.locator('dialog[open]').getByRole('button', { name: 'Cancel this job' }).click();
await o.locator('.jcard', { hasText: 'Lee Park' }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail(o, 'Lee Park still on the board'));
ok('and the job leaves the board');
await syncNow(o);
const lee2 = fake.tables.jobs.find((x) => x.client?.firstName === 'Lee');
if (!lee2?.cancelled_at) await fail(o, 'cancel did not reach the server');
ok('the cancel reaches the server');

// ---------------------------------------------------------------- Save to Contacts
// Catch what the iPhone would open, and read the contact card from it.
const catchOpen = (pg) => pg.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
const opened = (pg) => pg.evaluate(async () => (await fetch(window.__opened.at(-1))).text());
await o.goto(`${APP}#/contacts`);
await o.getByText('Nadia Kowalski').click();
await catchOpen(o);
await o.getByRole('button', { name: 'Save to Contacts' }).click();
const card = await opened(o);
for (const want of ['FN:Nadia Kowalski', 'TEL;TYPE=CELL,VOICE:(231) 555-0199', 'ADR;TYPE=HOME:;;4120 Peninsula Dr;Traverse City;MI;49686;USA']) {
  if (!card.includes(want)) await fail(o, `contact card is missing ${want}`);
}
ok('Save to Contacts hands the iPhone a contact card with the name, phone and address');
await o.goto(`${APP}#/contacts`);
await catchOpen(o);
await o.getByRole('button', { name: 'Export all' }).click();
const all = await opened(o);
const count = (all.match(/BEGIN:VCARD/g) ?? []).length;
if (count < 453) await fail(o, `Export all had ${count} cards`);
ok(`Export all puts every customer in one contacts file (${count})`);

// ---------------------------------------------------------------- calendar on your phone
await o.goto(`${APP}#/account`);
await o.getByRole('button', { name: 'Set up calendar link' }).click();
const add = o.getByRole('link', { name: 'Add to iPhone Calendar' });
const href = await add.getAttribute('href').catch(() => null);
if (!href || !/^webcal:\/\/fake-supabase\.test\/functions\/v1\/calendar-feed\?t=[0-9a-f-]{36}$/.test(href)) await fail(o, `calendar link was ${href}`);
ok('Account gives a private calendar link that opens the iPhone Calendar app (webcal)');
await shot(o, '07-calendar-link');
await o.getByRole('button', { name: 'Make a new link' }).click();
await see(o, 'The old one no longer works', 'Make a new link replaces it');
const href2 = await add.getAttribute('href');
if (href2 === href) await fail(o, 'the link did not change');
ok('with a different link');
await c.goto(`${APP}#/account`);
await c.getByRole('button', { name: 'Set up calendar link' }).click();
const crewHref = await c.getByRole('link', { name: 'Add to iPhone Calendar' }).getAttribute('href');
if (!crewHref || crewHref === href2) await fail(c, 'crew should get their own link');
ok('crew get their own link too');

await browser.close();
done('extras');
