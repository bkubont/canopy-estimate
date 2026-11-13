// End-to-end check of Phase 4: the calendar owns work dates; the jobs board
// reads them; crews see their own days; the week fits an iPad.
//
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173/ node e2e/calendar-flow.mjs [screenshot-dir]
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

await ownerSetup(o, { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' });
ok('owner lands on the calendar');
await crewJoin(o, c, { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' }, 'Sam Rivera');
ok('crew member Sam joins');
await syncNow(o);

// ---------------------------------------------------------------- a signed job starts as Approved
await signedEstimate(o, 'Dana', 'Smith', 'Traverse City');
await see(o, 'Not on the calendar yet', 'a newly signed job has no dates');
await o.goto(`${APP}#/board`);
await see(o, 'Approved (1)', 'the board shows it under Approved');
await shot(o, '01-board-approved');

// ---------------------------------------------------------------- schedule it from the board
await o.getByRole('button', { name: '📅 Schedule' }).click();
await see(o, 'Add to calendar', 'Schedule opens the calendar entry');
const title = await o.getByLabel('Title').inputValue();
if (!title.includes('Dana Smith')) await fail(o, `title should come from the job, got "${title}"`);
ok('the entry is filled in from the job');
await see(o, 'Estimate is for 2 days', 'and knows the job takes 2 days');
await o.locator('dialog').getByRole('button', { name: 'Sam Rivera' }).click();
await shot(o, '02-schedule-sheet');
await o.locator('dialog').getByRole('button', { name: 'Save', exact: true }).first().click();
await see(o, 'Scheduled (1)', 'the job moves to Scheduled');
await see(o, '👷 Sam Rivera', 'with Sam as crew');
await shot(o, '03-board-scheduled');

// ---------------------------------------------------------------- same entry from the estimate and the calendar
await o.getByRole('link', { name: 'Open' }).first().click();
await see(o, 'Change dates', 'the signed estimate shows the dates from the calendar');
await o.goto(`${APP}#/calendar`);
await see(o, 'Dana Smith · Traverse City', 'the job is on the calendar');
await shot(o, '04-calendar-week-phone');

// ---------------------------------------------------------------- task list
await o.getByRole('button', { name: '＋ Task' }).click();
await o.locator('dialog').getByLabel('Title').fill('Dump run to county site');
await o.locator('dialog').getByRole('button', { name: 'Save', exact: true }).first().click();
const pool = o.locator('.cal-pool');
await pool.getByText('Dump run to county site').waitFor({ timeout: 10000 });
ok('a dump run waits in the task list with no day');
await pool.getByText('Dump run to county site').click();
await o.getByLabel('No day yet').uncheck();
await o.locator('dialog').getByRole('button', { name: 'Sam Rivera' }).click();
await see(o, 'Double-booked', 'putting Sam on it the same day warns about double-booking');
await o.locator('dialog').getByRole('button', { name: 'Save', exact: true }).first().click();
try {
  await pool.getByText('Dump run to county site').waitFor({ state: 'detached', timeout: 10000 });
} catch {
  await fail(o, 'task should leave the task list');
}
ok('saving anyway moves the task onto the day');
await syncNow(o);

// ---------------------------------------------------------------- crew view
await c.goto(`${APP}#/calendar`);
await syncNow(c);
await see(c, 'Dana Smith · Traverse City', 'Sam sees the job on their calendar ("Only mine" is on for crew)');
await shot(c, '05-crew-calendar');
await c.goto(`${APP}#/board`);
await see(c, 'Scheduled (1)', 'crew Jobs tab is the board');
await notSee(c, /\$|Invoiced|Paid/, 'crew board shows no money columns or prices');
await c.getByRole('button', { name: '▶ Start' }).click();
await see(c, 'In progress (1)', 'crew starts the job');
await syncNow(c);

await o.goto(`${APP}#/board`);
await syncNow(o);
await o.getByRole('tab', { name: /In progress/ }).click();
await see(o, 'In progress (1)', 'the office sees it In progress');

// ---------------------------------------------------------------- removing the day puts it back
await o.getByRole('tab', { name: /In progress/ }).click();
await o.getByRole('button', { name: '✓ Done' }).click();
await see(o, 'Done (1)', 'marked done');
await o.getByRole('tab', { name: /Done/ }).click();
await o.getByRole('button', { name: 'Reopen' }).click();
await o.getByRole('tab', { name: /Scheduled/ }).click();
await o.getByRole('button', { name: 'Calendar entry' }).click();
await o.getByRole('button', { name: 'Remove from calendar' }).click();
await see(o, 'Approved (1)', 'removing the calendar day puts the job back to Approved');

// ---------------------------------------------------------------- iPad week view
const t = await page(tabletCtx);
await ownerSetup(t, { email: `tablet-${stamp}@ats.test`, password: 'correct-horse-3' });
const cols = await t.locator('.cal-week .cal-day').count();
if (cols !== 7) await fail(t, `expected 7 day columns, got ${cols}`);
const sat = t.locator('.cal-week .cal-day').nth(6);
const box = await sat.boundingBox();
const vw = t.viewportSize().width;
if (!box || box.x + box.width > vw + 1) await fail(t, `Saturday column cut off on iPad landscape (right edge ${box && box.x + box.width}, screen ${vw})`);
ok('iPad landscape: the whole week fits on screen, Sunday to Saturday');
await t.locator('.cal-week').evaluate((el) => el.scrollTo({ left: 0 }));
await shot(t, '06-ipad-week');

await browser.close();
done('calendar');
