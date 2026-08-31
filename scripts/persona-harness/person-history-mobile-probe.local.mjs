// scripts/persona-harness/person-history-mobile-probe.local.mjs
//
// Local, read-only verification probe for the "Past meetings with this person"
// panel at a REAL 390px viewport (iPhone width — the Director's screen).
//
// Why a probe and not a screenshot: a headless window-size does not set the
// viewport, and eyeballing a screenshot has produced a false "clipped layout"
// reading before. Overflow is a MEASUREMENT — scrollWidth vs clientWidth — and
// a tap target is a measured height, not an impression.
//
// Reuses the persona harness's cookie minting verbatim so the session is
// byte-correct. Never clicks a write action.
//
//   PERSONA_BASE_URL=http://localhost:3108 node \
//     scripts/persona-harness/person-history-mobile-probe.local.mjs <uid>

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(resolve(SCRIPT_DIR, 'personas.json'), 'utf8'));
const BASE = process.env.PERSONA_BASE_URL || CONFIG.baseUrl;
const HOST = new URL(BASE).hostname;
const PASSWORD = process.env.PERSONA_PASSWORD || CONFIG.password;
const EMAIL = CONFIG.accounts.superadmin;
const UID = process.argv[2];
if (!UID) throw new Error('usage: node person-history-mobile-probe.local.mjs <booking-uid>');

const ENV_PATH = resolve(SCRIPT_DIR, CONFIG.envPath || '../../.env.local');
function readEnv(key) {
  const m = readFileSync(ENV_PATH, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) throw new Error(`missing ${key}`);
  return m[1].trim().replace(/^["']|["']$/g, '');
}

async function mintCookies(email) {
  const store = {};
  const sb = createServerClient(readEnv('NEXT_PUBLIC_SUPABASE_URL'), readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => { store[name] = value; }),
    },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn: ${error.message}`);
  return Object.entries(store).map(([name, value]) => ({
    name, value, domain: HOST, path: '/',
    secure: BASE.startsWith('https'), httpOnly: false, sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }));
}

const measure = () => {
  const de = document.documentElement;
  const panel = [...document.querySelectorAll('div')].find((d) =>
    /Past meetings with this person/.test(d.textContent || '') && d.clientHeight < 4000
      && d.querySelector('a[href^="/meetings/"]'));
  const rows = panel ? [...panel.querySelectorAll('a[href^="/meetings/"]')] : [];
  return {
    viewport: { w: de.clientWidth, h: de.clientHeight },
    // THE overflow test. scrollWidth > clientWidth means the page scrolls
    // sideways, which is the failure this probe exists to catch.
    pageScrollWidth: de.scrollWidth,
    pageClientWidth: de.clientWidth,
    horizontalOverflowPx: de.scrollWidth - de.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    panelFound: !!panel,
    summaryLine: panel ? (panel.querySelector('p')?.textContent || '').trim() : null,
    rowCount: rows.length,
    rowHeights: rows.map((a) => Math.round(a.getBoundingClientRect().height)),
    rowRights: rows.map((a) => Math.round(a.getBoundingClientRect().right)),
    rowHrefs: rows.map((a) => a.getAttribute('href')),
    outcomeChips: panel
      ? [...panel.querySelectorAll('span')].map((s) => (s.textContent || '').trim())
          .filter((t) => /^(Happened|No-show|Cancelled|Not recorded)$/.test(t))
      : [],
    // Anything anywhere on the page sticking out past the viewport.
    widestOffenders: [...document.querySelectorAll('main *')]
      .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), r: Math.round(el.getBoundingClientRect().right) }))
      .filter((o) => o.r > de.clientWidth + 1)
      .slice(0, 8),
  };
};

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const cookies = await mintCookies(EMAIL);
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setCookie(...cookies);
    await page.evaluateOnNewDocument((t) => {
      try { localStorage.setItem('theme', t); } catch { /* private mode */ }
    }, theme);
    await page.goto(`${BASE}/meetings/${UID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 5000));
    // next-themes writes the class; force it too so the shot cannot silently
    // fall back to system and produce two identical images.
    await page.evaluate((t) => {
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.documentElement.style.colorScheme = t;
    }, theme);
    await new Promise((r) => setTimeout(r, 800));

    const m = await page.evaluate(measure);
    console.log(`\n===== ${theme.toUpperCase()} @ 390px =====`);
    console.log(JSON.stringify(m, null, 2));

    // Scroll the panel into view so the shot shows the thing under test.
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('*')]
        .find((e) => e.children.length === 0 && /Past meetings with this person/.test(e.textContent || ''));
      h?.scrollIntoView({ block: 'start' });
    });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: `.screenshots/person-history-390-${theme}.png` });
    await page.screenshot({ path: `.screenshots/person-history-390-${theme}-full.png`, fullPage: true });
    await ctx.close();
  }
} finally {
  await browser.close();
}
