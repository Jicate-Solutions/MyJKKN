// Visual Proof Gate capture — Reference / Masters hub
// Run from worktree root: node .screenshots/capture-reference.mjs
// Dev server must be up on PORT (default 3106) with the REAL service-role key.

import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL || 'http://localhost:3106';
const shots = [];

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// 1. test-login as superadmin (dev-only page)
await page.goto(`${BASE}/auth/test-login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
// first hit compiles the page in dev — poll up to 90s for the account list
let clicked = false;
for (let i = 0; i < 45 && !clicked; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, [role="button"], div, li')];
    const el = els.find((e) => /super\s*admin/i.test(e.textContent || '') && (e.textContent || '').length < 120);
    if (el) {
      const target = el.closest('button, a, [role="button"]') || el;
      target.click();
      return true;
    }
    return false;
  });
}
if (!clicked) throw new Error('super admin login button not found on /auth/test-login');
await new Promise((r) => setTimeout(r, 6000));

// 2. hub
await page.goto(`${BASE}/reference`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: '.screenshots/reference-v2-hub.png' });
shots.push('reference-v2-hub.png');

// 3. generic catalog browse
await page.goto(`${BASE}/reference/castes`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: '.screenshots/reference-v2-castes-fk-labels.png' });
shots.push('reference-v2-castes-fk-labels.png');

// 4. New-entry dialog (via ?new=1 deep link from hub "+ New" buttons)
await page.goto(`${BASE}/reference/castes?new=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: '.screenshots/reference-v2-fk-dialog.png' });
shots.push('reference-v2-fk-dialog.png');

await browser.close();
console.log('captured:', shots.join(', '));
