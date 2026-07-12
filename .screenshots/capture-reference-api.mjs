import puppeteer from 'puppeteer';
const BASE = 'http://localhost:3107';
const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(`${BASE}/auth/test-login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
let ok = false;
for (let i = 0; i < 30 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  ok = await p.evaluate(() => {
    const e = [...document.querySelectorAll('button,a,div')].find(
      (x) => /super\s*admin/i.test(x.textContent || '') && (x.textContent || '').length < 120);
    if (e) { (e.closest('button,a') || e).click(); return true; }
    return false;
  });
}
await new Promise((r) => setTimeout(r, 6000));
await p.goto(`${BASE}/application-hub/api-guidelines`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 8000));
// Radix TabsTrigger needs pointer events (deploy-skill lesson 9)
await p.evaluate(() => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((t) =>
    /reference data api/i.test(t.textContent || ''));
  if (!tab) throw new Error('Reference Data API tab not found');
  tab.focus();
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    tab.dispatchEvent(new Ev(type, { bubbles: true, pointerType: 'mouse', button: 0 }));
  }
  tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: '.screenshots/reference-api-docs-tab.png' });
await b.close();
console.log('captured reference-api-docs-tab.png');
