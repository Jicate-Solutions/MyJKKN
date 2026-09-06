#!/usr/bin/env node
/**
 * One-shot screenshot capture for PR #978 visual proof.
 * Reads the magic-link URL passed via env $MAGIC_LINK, navigates,
 * waits for the auth dance to land on /admin/hr/payroll/periods,
 * screenshots to .screenshots/pr-978-payroll-periods.png, exits.
 *
 * Uses playwright (already installed; chromium binary downloaded above).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const magicLink = process.env.MAGIC_LINK;
  if (!magicLink) {
    console.error('MAGIC_LINK env var required');
    process.exit(1);
  }

  const outputPath = path.resolve('.screenshots/pr-978-payroll-periods.png');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // playwright-core needs explicit executable path
  const chromiumPath = process.env.CHROMIUM_PATH ||
    require('child_process').execSync('find ~/Library/Caches/ms-playwright -name "chrome-headless-shell" -type f -perm +111 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
  if (!chromiumPath) {
    console.error('Could not locate chromium headless_shell binary');
    process.exit(1);
  }
  console.log('→ Using chromium at', chromiumPath);

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[console.error]', msg.text());
    });

    console.log('→ Navigating to magic link (verify endpoint)…');
    try {
      await page.goto(magicLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.log('  (networkidle wait skipped — proceeding with DOM ready)');
    }

    // Wait until we leave /auth/* — any landing page is fine (dashboard, /, etc.)
    console.log('→ Waiting for session to settle (leave /auth/*)…');
    await page.waitForFunction(
      () => !location.pathname.startsWith('/auth/'),
      null,
      { timeout: 25000 },
    );
    console.log('  Settled on:', new URL(page.url()).pathname);

    // Brief pause to let cookie chunks finalize
    await page.waitForTimeout(1500);

    // Now navigate to the target route with auth cookies in place
    console.log('→ Navigating to /admin/hr/payroll/periods…');
    await page.goto('http://localhost:3000/admin/hr/payroll/periods', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    // Let server-rendered + client-hydrated content settle
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {
      console.log('  (networkidle timed out — proceeding anyway)');
    });

    // Verify we actually landed on the periods page (not redirected to login)
    const finalPath = new URL(page.url()).pathname;
    if (finalPath !== '/admin/hr/payroll/periods') {
      throw new Error(`Expected /admin/hr/payroll/periods, got ${finalPath}`);
    }

    // Give React tree a moment to hydrate filters + data
    await page.waitForTimeout(2500);

    console.log('→ Capturing screenshot:', outputPath);
    await page.screenshot({ path: outputPath, fullPage: true });

    console.log('✓ Saved', outputPath, '(' + fs.statSync(outputPath).size + ' bytes)');
  } catch (err) {
    console.error('✗ Capture failed:', err.message);
    try {
      const pages = browser.contexts()[0]?.pages() || [];
      if (pages.length > 0) {
        const page = pages[0];
        const fail = path.resolve('.screenshots/pr-978-capture-FAILED.png');
        await page.screenshot({ path: fail, fullPage: true });
        console.error('  Diagnostic screenshot at', fail, ' last URL:', page.url());
      }
    } catch {}
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
