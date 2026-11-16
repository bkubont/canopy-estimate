// End-to-end check of the month calendar (Phase 5, step 2): jobs waiting for a
// day sit beside the month; tap or drag them onto a day (Sundays skipped); a
// day's list can be reordered and checked off; the jobs board follows.
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

// Dates in next month, so they're always in the future: its first Saturday, and the Tuesday after.
const mi = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Detroit' }));
const first = new Date(Date.UTC(mi.getFullYear(), mi.getMonth() + 1, 1));
const ymd = (d) => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86400000);
const sat = plus(first, (6 - first.getUTCDay() + 7) % 7);
const [SAT, SUN, MON, TUE, WED] = [0, 1, 2, 3, 4].map((n) => ymd(plus(sat, n)));
const day = (p, d) => p.locator(`.mcell[data-day="${d}"]`);
/** How many entries with `text` are on day `d`, after giving the screen a moment to update. */
async function chipsOn(p, d, text, expectSome = true) {
  const loc = day(p, d).locator('.mchip', { hasText: text });
  await loc.first().waitFor({ state: expectSome ? 'attached' : 'detached', timeout: 5000 }).catch(() => {});
  return loc.count();
}

await ownerSetup(o, { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' });
ok('owner lands on the dashboard');
await crewJoin(o, c, { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' }, 'Sam Rivera');
ok('crew member Sam joins');
await syncNow(o);

// ---------------------------------------------------------------- a signed job waits for a day
await signedEstimate(o, 'Dana', 'Smith', 'Traverse City');
await see(o, 'Not on the calendar yet', 'a newly signed job has no dates');
await o.goto(`${APP}#/board`);
await see(o, 'Approved (1)', 'the board shows it under Approved');

// ---------------------------------------------------------------- Schedule from the board → tap a day; Sunday is skipped
await o.getByRole('button', { name: 'Schedule', exact: true }).click();
await see(o, 'Tap a day for Dana Smith (2 days, Sundays skipped)', 'Schedule opens the month, waiting for a day');
await o.getByRole('button', { name: 'Next month' }).click();
await day(o, SAT).click();
await see(o, 'Sunday skipped', 'dropping a 2-day job on a Saturday says Sunday was skipped');
if (!(await chipsOn(o, SAT, 'Dana Smith')) || !(await chipsOn(o, MON, 'Dana Smith')) || (await chipsOn(o, SUN, 'Dana Smith', false))) await fail(o, 'expected Saturday and Monday, not Sunday');
ok('it lands on Saturday and Monday, not Sunday');
await shot(o, '01-sunday-skipped');
await o.getByRole('button', { name: 'Undo' }).click();
await o.locator('.sched-panel').getByText('Dana Smith').waitFor({ timeout: 10000 });
if (await chipsOn(o, SAT, 'Dana Smith', false)) await fail(o, 'undo left the job on the calendar');
ok('Undo takes it off again and back to the To schedule list');

// ---------------------------------------------------------------- tap the job in the list, then a day
await o.locator('.sched-panel .sched-card', { hasText: 'Dana Smith' }).click();
await see(o, 'Tap a day for Dana Smith', 'tapping a job in the list picks it');
await day(o, TUE).click();
if (!(await chipsOn(o, TUE, 'Dana Smith')) || !(await chipsOn(o, WED, 'Dana Smith'))) await fail(o, 'expected Tuesday and Wednesday');
ok('then tapping Tuesday books Tuesday and Wednesday');
if (await o.locator('.sched-panel .sched-card', { hasText: 'Dana Smith' }).count()) await fail(o, 'job still in To schedule');
ok('and it leaves the To schedule list');
await o.goto(`${APP}#/board`);
await see(o, 'Scheduled (1)', 'the board moves it to Scheduled');

// ---------------------------------------------------------------- the day list: crew, a rental, order, check-off
await o.goto(`${APP}#/calendar`);
await o.getByRole('button', { name: 'Next month' }).click();
await day(o, TUE).click();
const sheet = o.locator('dialog[open]');
await sheet.locator('.day-row-main', { hasText: 'Dana Smith' }).click();
await o.locator('dialog[open]').last().getByRole('button', { name: 'Sam Rivera' }).click();
await o.locator('dialog[open]').last().getByRole('button', { name: 'Save', exact: true }).first().click();
ok('Sam is put on the job from the day list');
await sheet.getByRole('button', { name: 'Add to this day' }).click();
const add = o.locator('dialog[open]').last();
await add.getByRole('button', { name: 'Equipment rental' }).click();
await add.getByLabel('Title').fill('Pick up boom lift');
await add.getByRole('button', { name: 'Sam Rivera' }).click();
await see(o, 'Double-booked', 'putting Sam on a rental the same day warns about double-booking');
await add.getByRole('button', { name: 'Save', exact: true }).first().click();
await sheet.getByText('Pick up boom lift').waitFor();
const order = async () => (await sheet.locator('.day-row-main b').allInnerTexts()).join(' | ');
if (!(await order()).startsWith('Dana Smith')) await fail(o, `job should come first, got ${await order()}`);
await sheet.getByRole('button', { name: 'Move Pick up boom lift up' }).click();
await o.waitForFunction(() => document.querySelector('dialog[open] .day-row-main b')?.textContent === 'Pick up boom lift');
ok('moving the rental up puts it first on the day');
await sheet.getByLabel('Done: Pick up boom lift').check();
await sheet.locator('.day-row.is-done', { hasText: 'Pick up boom lift' }).waitFor();
ok('checking it off marks it done');
await shot(o, '02-day-list');
await sheet.getByRole('button', { name: 'Close' }).click();

// ---------------------------------------------------------------- a rental with no day yet
await o.getByRole('button', { name: '+ Rental' }).click();
const rent = o.locator('dialog[open]');
await rent.getByLabel('Title').fill('Return boom lift');
await rent.getByRole('button', { name: 'Save', exact: true }).first().click();
await o.locator('.sched-panel .sched-card', { hasText: 'Return boom lift' }).waitFor();
ok('a rental with no day waits in the Rentals list');
await o.locator('.sched-panel .sched-card', { hasText: 'Return boom lift' }).click();
await day(o, WED).click();
if (!(await chipsOn(o, WED, 'Return boom lift'))) await fail(o, 'rental not on Wednesday');
ok('tap it, tap Wednesday: the rental is booked');
await syncNow(o);

// ---------------------------------------------------------------- crew
await c.goto(`${APP}#/calendar`);
await syncNow(c);
await c.getByRole('button', { name: 'Next month' }).click();
if (!(await chipsOn(c, TUE, 'Dana Smith'))) await fail(c, 'crew calendar missing the job');
ok('Sam sees the job on the calendar');
if (await c.locator('.sched-panel').count()) await fail(c, 'crew should not get the scheduling list');
ok('crew don’t get the To schedule list');
await c.goto(`${APP}#/board`);
await see(c, 'Scheduled (1)', 'crew Jobs tab is the board');
await notSee(c, /\$|Invoiced|Paid/, 'crew board shows no money columns or prices');
await c.getByRole('button', { name: 'Start', exact: true }).click();
await see(c, 'In progress (1)', 'crew starts the job');
await syncNow(c);

await o.goto(`${APP}#/board`);
await syncNow(o);
await o.getByRole('tab', { name: /In progress/ }).click();
await see(o, 'In progress (1)', 'the office sees it In progress');

// ---------------------------------------------------------------- one main button per card, the rest under "⋯"
await o.getByRole('button', { name: 'Mark done' }).click();
await see(o, 'Done (1)', 'Mark done moves it to Done');
await o.getByRole('tab', { name: /Done/ }).click();
await see(o, 'Create invoice', 'a finished job\u2019s main button is Create invoice');
await o.getByRole('button', { name: 'More actions for Dana Smith' }).click();
await o.getByRole('menuitem', { name: 'Reopen' }).click();
await o.getByRole('tab', { name: /Scheduled/ }).click();
await see(o, 'Scheduled (1)', 'Reopen (under ⋯) puts it back to Scheduled');
await shot(o, '04-board-card');

// ---------------------------------------------------------------- removing the day puts it back
await o.getByRole('button', { name: 'More actions for Dana Smith' }).click();
await o.getByRole('menuitem', { name: 'Calendar entry' }).click();
await o.getByRole('button', { name: 'Remove from calendar' }).click();
await see(o, 'Approved (1)', 'removing the calendar day puts the job back to Approved');

// ---------------------------------------------------------------- iPad: drag a job onto a day
const t = await page(tabletCtx);
await ownerSetup(t, { email: `tablet-${stamp}@ats.test`, password: 'correct-horse-3' });
await signedEstimate(t, 'Lee', 'Park', 'Kingsley');
await t.goto(`${APP}#/calendar`);
await t.getByRole('button', { name: 'Next month' }).click();
const cardBox = await t.locator('.sched-card', { hasText: 'Lee Park' }).boundingBox();
const target = await day(t, TUE).boundingBox();
await t.mouse.move(cardBox.x + 30, cardBox.y + cardBox.height / 2);
await t.mouse.down();
await t.mouse.move(cardBox.x + 60, cardBox.y + 40, { steps: 5 });
await t.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
if (!(await t.locator('.drag-ghost', { hasText: 'Lee Park' }).count())) await fail(t, 'no drag preview while dragging');
await t.mouse.up();
if (!(await chipsOn(t, TUE, 'Lee Park')) || !(await chipsOn(t, WED, 'Lee Park'))) await fail(t, 'drag did not book Tuesday and Wednesday');
ok('iPad: dragging the job onto Tuesday books Tuesday and Wednesday');
const grid = await t.locator('.mgrid').boundingBox();
if (grid.x + grid.width > t.viewportSize().width + 1) await fail(t, 'month cut off on iPad');
ok('iPad: the whole month and the side list fit on screen');
await shot(t, '03-ipad-month');

// ---------------------------------------------------------------- iPad: drag a card between board columns
async function dragCard(name, col) {
  const grip = await t.getByRole('button', { name: `Drag ${name} to another column` }).boundingBox();
  const target = await t.locator(`.board-col[data-col="${col}"] > header`).boundingBox();
  await t.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await t.mouse.down();
  await t.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 15 });
  await t.mouse.up();
}
await t.goto(`${APP}#/board`);
await t.locator('.board-col[data-col="scheduled"] .jcard', { hasText: 'Lee Park' }).waitFor();
await dragCard('Lee Park', 'in_progress');
await t.locator('.board-col[data-col="in_progress"] .jcard', { hasText: 'Lee Park' }).waitFor({ timeout: 5000 }).catch(() => fail(t, 'card did not move to In progress'));
ok('iPad: dragging a card to In progress starts the job');
await dragCard('Lee Park', 'approved');
await see(t, 'It has days on the calendar', 'dragging a scheduled job back to Approved is refused with a reason');
await shot(t, '05-ipad-board');

await browser.close();
done('calendar');
