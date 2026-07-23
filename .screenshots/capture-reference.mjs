// Visual Proof Gate capture — Reference / Masters hub
// Run from worktree root: node .screenshots/capture-reference.mjs
// Dev server must be up on PORT (default 3105) with the REAL service-role key.

import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL || 'http://localhost:3105';
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
await page.screenshot({ path: '.screenshots/reference-hub.png' });
shots.push('reference-hub.png');

// 3. generic catalog browse
await page.goto(`${BASE}/reference/cdc_drive_types`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: '.screenshots/reference-browse-cdc-drive-types.png' });
shots.push('reference-browse-cdc-drive-types.png');

// 4. New-entry dialog (via ?new=1 deep link from hub "+ New" buttons)
await page.goto(`${BASE}/reference/community_categories?new=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: '.screenshots/reference-new-dialog.png' });
shots.push('reference-new-dialog.png');

await browser.close();
console.log('captured:', shots.join(', '));
