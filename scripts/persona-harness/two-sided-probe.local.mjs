// two-sided-probe.local.mjs — session-scoped DOM probe for the two-sided close.
// .local.mjs = gitignored, never ships. Reuses the harness's own cookie mint so
// the session is byte-correct, then dumps FULL page text (grep-able) + a
// full-page screenshot, and can optionally CLICK the act flow end-to-end.
//
// Usage:
//   node scripts/persona-harness/two-sided-probe.local.mjs <role> <path> [--act]
//   PERSONA_BASE_URL=http://localhost:3105 node ... faculty /academic/session-feedback/faculty --act

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(resolve(SCRIPT_DIR, 'personas.json'), 'utf8'));
const BASE = process.env.PERSONA_BASE_URL || CONFIG.baseUrl;
const PASSWORD = process.env.PERSONA_PASSWORD || CONFIG.password;
const HOST = new URL(BASE).hostname;
const ENV_PATH = resolve(SCRIPT_DIR, CONFIG.envPath || '../../.env.local');
function readEnv(key) {
  const txt = readFileSync(ENV_PATH, 'utf8');
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) throw new Error(`missing ${key} in ${ENV_PATH}`);
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const SUPA_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

async function mintCookies(email) {
  const store = {};
  const sb = createServerClient(SUPA_URL, ANON, {
    cookies: {
      getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => { store[name] = value; }),
    },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  if (Object.keys(store).length === 0 && data?.session) {
    await sb.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }
  return Object.entries(store).map(([name, value]) => ({
    name, value, domain: HOST, path: '/',
    secure: BASE.startsWith('https'), httpOnly: false, sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }));
}

const [role, path, mode] = process.argv.slice(2);
const email = CONFIG.accounts[role];
if (!email || !path) { console.error('usage: <role> <path> [--act]'); process.exit(2); }

const browser = await puppeteer.launch({ headless: 'shell' });
try {
  const cookies = await mintCookies(email);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie(...cookies);
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 4000));

  const slug = path.replace(/\W+/g, '-').replace(/^-|-$/g, '');
  const dump = async (tag) => {
    const text = await page.evaluate(() => document.body.innerText);
    const shot = `.screenshots/probe-${role}-${slug}-${tag}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`--- ${tag} text (${shot}) ---`);
    console.log(text);
  };

  await dump('initial');

  if (mode === '--act') {
    // Click "I acted on this" on the first row, then the first act option.
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /i acted on this/i.test(x.textContent || ''));
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) { console.log('ACT: button not found'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 800));
    const picked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /went over it again in session/i.test(x.textContent || ''));
      if (!b) return false;
      b.click();
      return true;
    });
    if (!picked) { console.log('ACT: option not found'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 2500)); // mutation + query invalidation
    await dump('after-act');
  }
} finally {
  await browser.close();
}
