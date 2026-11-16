// Every main screen fits the smallest iPhone without scrolling sideways,
// even with a long customer name on a signed job.
//
//   E2E_FAKE=1 APP_URL=http://127.0.0.1:5173/ node e2e/phone-fit.mjs [screenshot-dir]
import { APP, chromium, contexts, devices, done, fail, ok, ownerSetup, page, signedEstimate } from './helpers.mjs';

const browser = await chromium.launch();
const [ctx] = await contexts(browser, [{ ...devices['iPhone SE'] }]);
const p = await page(ctx);
await ownerSetup(p, { email: `fit-${Date.now()}@ats.test`, password: 'correct-horse-1' });
await signedEstimate(p, 'Bartholomew', 'Featherstonehaugh-Smythe', 'Lake Leelanau');
const job = p.url().split('#')[1].replace(/\/review$/, '');
for (const r of ['/', '/calendar', '/board', '/estimates', job, '/invoices', '/expenses', '/receipts', '/reports', '/contacts', '/company', '/team', '/account']) {
  await p.goto(`${APP}#${r}`);
  await p.waitForTimeout(600);
  const { sw, cw } = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (sw > cw) await fail(p, `${r} is ${sw - cw}px too wide on a ${cw}px phone`);
  ok(`${r === job ? 'a signed job' : r} fits a ${cw}px-wide phone`);
}
await browser.close();
done('phone-fit');
