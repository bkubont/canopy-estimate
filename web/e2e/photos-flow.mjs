// End-to-end check of photos (Phase 5, step 4): before/during/after on a job,
// a photo taken with no signal uploads later, crew see and add photos, tree
// photos on the estimate (never on the customer's copy), counts on the board.
//
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173/ node e2e/photos-flow.mjs [screenshot-dir]
import { createFakeBackend } from './fake-backend.mjs';
import { APP, chromium, crewJoin, devices, done, fail, notSee, ok, ownerSetup, page, see, shot, signedEstimate, syncNow } from './helpers.mjs';

if (!process.env.E2E_FAKE) {
  console.log('photos-flow needs E2E_FAKE=1 (it checks uploads inside the stand-in backend).');
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

// A real (tiny) picture, as if it came from the camera.
const png = { name: 'IMG_0001.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64') };
const loaded = (p, scope) => p.locator(`${scope} .thumb img`).evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length);
async function waitLoaded(p, scope, n, msg) {
  try {
    await p.waitForFunction(([s, k]) => [...document.querySelectorAll(`${s} .thumb img`)].filter((i) => i.complete && i.naturalWidth > 0).length >= k, [scope, n], { timeout: 15000 });
  } catch {
    await fail(p, `${msg} (only ${await loaded(p, scope)} of ${n} pictures showing)`);
  }
  ok(msg);
}
const photoFiles = () => [...fake.files.keys()].filter((k) => k.includes('/photos/')).length;

await ownerSetup(o, { email: `owner-${stamp}@ats.test`, password: 'correct-horse-1' });
await crewJoin(o, c, { email: `crew-${stamp}@ats.test`, password: 'correct-horse-2' }, 'Sam Rivera');
await syncNow(o);
ok('owner and crew are set up');

// ---------------------------------------------------------------- a tree photo while estimating
await o.goto(`${APP}#/estimates`);
await o.getByRole('button', { name: 'New estimate' }).click();
await o.getByLabel('First name').fill('Dana');
await o.getByLabel('Last name').fill('Smith');
await o.locator('.bottombar .btn.primary').click();
await o.getByRole('button', { name: 'Add tree' }).click();
await o.getByRole('button', { name: 'Ash', exact: true }).click();
await o.getByLabel('Add tree photo').setInputFiles(png);
await waitLoaded(o, 'dialog[open]', 1, 'a tree photo shows in the tree sheet right away');
await o.getByRole('button', { name: 'Save tree' }).click();
await o.getByLabel('1 photo').first().waitFor({ timeout: 5000 }).catch(() => fail(o, 'no photo count on the tree line'));
ok('the tree line shows "1 photo"');
await shot(o, '01-tree-photo');

// finish and sign it
await o.locator('.bottombar .btn.primary').click();
await o.getByRole('button', { name: '2 days' }).click();
await o.locator('.bottombar .btn.primary').click();
const { draw } = await import('./helpers.mjs');
await draw(o, o.locator('canvas.sig').first());
await o.getByRole('button', { name: /Client accepts/ }).click();
await see(o, 'Signed by Dana Smith', 'client signs');
if (await o.locator('.doc .thumb, .doc-preview img[src^="blob:"], .doc-preview img[src*="sign/"]').count()) await fail(o, 'a photo is on the customer document');
ok('no photo appears on the customer’s estimate');

// ---------------------------------------------------------------- before photo, then one with no signal
await o.getByLabel('Add before photo').setInputFiles(png);
await waitLoaded(o, '.photo-group:nth-of-type(1)', 1, 'a before photo is added to the job');
await o.waitForFunction(() => true);
for (let i = 0; i < 30 && photoFiles() < 2; i++) await o.waitForTimeout(200);
if (photoFiles() !== 2) await fail(o, `expected 2 uploaded files (tree + before), got ${photoFiles()}`);
ok('both photos reach file storage');

await fake.setOffline(ownerCtx, true);
await o.getByLabel('Add during photo').setInputFiles(png);
await waitLoaded(o, '.card', 3, 'with no signal, the during photo still shows (kept on the phone)');
await o.waitForTimeout(800);
if (photoFiles() !== 2) await fail(o, 'a photo uploaded while offline?');
ok('and it has not uploaded yet');
await fake.setOffline(ownerCtx, false);
await o.evaluate(() => window.dispatchEvent(new Event('online')));
for (let i = 0; i < 50 && photoFiles() < 3; i++) await o.waitForTimeout(200);
if (photoFiles() !== 3) await fail(o, `the offline photo did not upload when the signal came back (${photoFiles()} files)`);
ok('when the signal comes back, it uploads by itself');
await syncNow(o);
await shot(o, '02-job-photos');

// ---------------------------------------------------------------- crew
await c.goto(`${APP}#/estimates`);
await syncNow(c);
await c.getByText('Dana Smith').first().click();
await waitLoaded(c, '.card', 3, 'crew see the before, during and tree photos (loaded from storage)');
await c.getByLabel('Add after photo').setInputFiles(png);
await waitLoaded(c, '.card', 4, 'crew add an after photo');
await syncNow(c);
await c.locator('.thumb:not(.add)', { has: c.locator('img') }).first().click();
await see(c, 'Remove photo', 'tapping a photo opens it full size');
await notSee(c, /\$/, 'no prices anywhere near the photos for crew');
await c.getByRole('button', { name: 'Close' }).click();

// ---------------------------------------------------------------- board count, removing a photo
await o.goto(`${APP}#/board`);
await syncNow(o);
await o.getByRole('button', { name: 'Photos, 4' }).first().waitFor({ timeout: 10000 }).catch(() => fail(o, 'board card should say 4 photos'));
ok('the board card shows 4 photos');
await o.getByRole('link', { name: 'Dana Smith' }).first().click();
// The photo itself, not the "Add" button next to it (which is there first while the job loads).
await o.locator('.photo-group').filter({ hasText: 'After' }).locator('.thumb:not(.add)').first().click();
await o.getByRole('button', { name: 'Remove photo' }).click();
await o.waitForFunction(() => document.querySelectorAll('.card .thumb img').length === 3, null, { timeout: 10000 }).catch(() => fail(o, 'photo not removed'));
ok('removing a photo takes it off the job');
await o.goto(`${APP}#/board`);
await o.getByRole('button', { name: 'Photos, 3' }).first().waitFor({ timeout: 10000 }).catch(() => fail(o, 'board count did not drop to 3'));
ok('and the board count drops to 3');
await o.getByRole('button', { name: 'Photos, 3' }).first().click();
await waitLoaded(o, 'dialog[open]', 3, 'the photo icon on the board card opens the job\u2019s photos right there');
if (!o.url().includes('#/board')) await fail(o, 'opening photos left the board');
ok('without leaving the board');

await browser.close();
done('photo');
