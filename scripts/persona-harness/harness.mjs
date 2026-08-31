// scripts/persona-harness/harness.mjs
// ============================================================================
// Multi-persona test harness (read-only) — works on ANY Supabase + Next.js app
//
// Problem it solves: testing role-gated pages meant logging in and out of real
// accounts, one persona at a time. Chrome profiles are hard-isolated, so a
// single automation session can't hold many personas.
//
// How it works: for each persona it mints a VALID @supabase/ssr session using
// the app's OWN auth library (createServerClient + signInWithPassword against a
// test account) — so the chunked `sb-<ref>-auth-token` cookie is byte-correct,
// no hand-rolled base64. That session is injected into an ISOLATED Puppeteer
// browser context. N personas run in PARALLEL against the live site.
//
// GENERIC across platforms: everything app-specific lives in `personas.json`
// next to this script (accounts, baseUrl, envPath, defaultSet). Drop this script
// + a personas.json into any Supabase+Next.js repo and it works — the cookie name
// and Supabase project are read from THAT repo's own .env.local + @supabase/ssr
// version, so they always match the target app. Nothing here is hardcoded to one
// platform.
//
// READ-ONLY by design (except the opt-in PERSONA_DISMISS_MODALS write).
//
// Usage:
//   node scripts/persona-harness/harness.mjs                 # default set (from config)
//   node scripts/persona-harness/harness.mjs hod:/x admin:/y
//   PERSONA_BASE_URL=http://localhost:3104 node ...          # against a dev server
// Output: JSON on stdout + PNGs in .screenshots/persona-<role>-<page-slug>.png (headless pass)
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ---- per-platform config: personas.json next to this script -----------------
// { "baseUrl": "https://app", "accounts": { "role": "test.x@domain" },
//   "password"?: "<from PERSONA_PASSWORD>", "envPath"?: "../../.env.local",
//   "defaultSet"?: [["role","/path"], ...] }
function loadConfig() {
  const p = resolve(SCRIPT_DIR, 'personas.json');
  let raw;
  try { raw = readFileSync(p, 'utf8'); }
  catch { throw new Error(`Missing ${p}\n  Create it: { "baseUrl": "...", "accounts": { "role": "test.x@domain" } }  — see README.`); }
  const c = JSON.parse(raw);
  if (!c.accounts || !Object.keys(c.accounts).length) throw new Error(`${p}: an "accounts" map is required.`);
  if (!c.baseUrl && !process.env.PERSONA_BASE_URL) throw new Error(`${p}: "baseUrl" required (or pass PERSONA_BASE_URL).`);
  return c;
}
const CONFIG = loadConfig();
const ROLE_EMAIL = CONFIG.accounts;
const BASE = process.env.PERSONA_BASE_URL || CONFIG.baseUrl;
const PASSWORD = process.env.PERSONA_PASSWORD || CONFIG.password;
const HOST = new URL(BASE).hostname;
// default set when no role:path args given — from config, else each role at '/'
const DEFAULT_SET = CONFIG.defaultSet && CONFIG.defaultSet.length
  ? CONFIG.defaultSet
  : Object.keys(ROLE_EMAIL).map((r) => [r, '/']);

// ---- read public env from the app's .env.local (NEXT_PUBLIC_* — safe) -------
const ENV_PATH = resolve(SCRIPT_DIR, CONFIG.envPath || '../../.env.local');
function readEnv(key) {
  let txt;
  try { txt = readFileSync(ENV_PATH, 'utf8'); }
  catch { throw new Error(`Cannot read ${ENV_PATH} — the harness needs NEXT_PUBLIC_SUPABASE_URL + _ANON_KEY.\n  A fresh worktree has no .env.local: copy or symlink one in, or point "envPath" in personas.json at it.`); }
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) throw new Error(`missing ${key} in ${ENV_PATH}`);
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const SUPA_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const PROJECT_REF = new URL(SUPA_URL).hostname.split('.')[0];

// PERSONA_PASSWORD has no default (the literal was removed in 388a6d4d so it
// stops shipping). Left unset, signInWithPassword sends no password and Supabase
// answers with its generic "Invalid login credentials" — indistinguishable from a
// rotated password or a deleted account, and it fires one failed login per
// persona at the target project. Refuse before the first request instead.
if (!PASSWORD) {
  throw new Error(
    'PERSONA_PASSWORD is not set (and personas.json carries no "password").\n'
    + `  There is no default, so sign-in to Supabase project ${PROJECT_REF} would fail as "Invalid login credentials"\n`
    + '  even though the accounts are fine. Export the password the test.* accounts were seeded with:\n'
    + '      export PERSONA_PASSWORD=...\n'
    + '  See scripts/persona-harness/README.md.'
  );
}

// ---- mint byte-correct session cookies for one persona ----------------------
async function mintCookies(email) {
  const store = {};
  const sb = createServerClient(SUPA_URL, ANON, {
    cookies: {
      getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => { store[name] = value; }),
    },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email} on Supabase project ${PROJECT_REF} (target ${BASE}): ${error.message}`);
  // belt + suspenders: force a write if setAll didn't fire during signIn
  if (Object.keys(store).length === 0 && data?.session) {
    await sb.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }
  const cookies = Object.entries(store).map(([name, value]) => ({
    name,
    value,
    domain: HOST,
    path: '/',
    secure: BASE.startsWith('https'),
    httpOnly: false,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }));
  if (cookies.length === 0) throw new Error(`no cookies minted for ${email}`);
  return cookies;
}

// ---- drive one persona in an isolated context -------------------------------
async function runPersona(browser, role, path, headless) {
  const email = ROLE_EMAIL[role];
  if (!email) return { role, path, ok: false, error: `unknown role: ${role}` };
  const out = { role, email, path, ok: false };
  let ctx;
  try {
    const cookies = await mintCookies(email);
    ctx = await browser.createBrowserContext(); // isolated cookie jar
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCookie(...cookies);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 3500)); // hydration + client fetch

    // Opt-in: dismiss a blocking "Mandatory Acknowledgment" overlay (a WRITE —
    // marks the test account's notification acknowledged) so the page beneath is
    // visible. Off by default to keep the harness read-only.
    if (process.env.PERSONA_DISMISS_MODALS) {
      // Loop until the blocking mandatory-ack modal is GONE. Two navigations can
      // destroy the eval context here: the Lab index redirect (/lab -> /lab/[cycle])
      // and the post-acknowledge reload. Treat a destroyed context as "retry", not
      // success. Click "Acknowledge" only once its read-timer (~28s) enables it;
      // the click reloads the page, after which the modal no longer renders => clear.
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        let res;
        try {
          res = await page.evaluate(() => {
            document.querySelectorAll('div').forEach((d) => {
              if (d.scrollHeight > d.clientHeight + 40) d.scrollTop = d.scrollHeight;
            });
            const btns = [...document.querySelectorAll('button')];
            const ack = btns.find((b) => !b.disabled
              && /\backnowledge\b|i have read|i acknowledge|confirm & close/i.test(b.textContent || ''));
            if (ack) { ack.click(); return 'acked'; }
            const blocking = /mandatory acknowledg/i.test(document.body.innerText)
              || btns.some((b) => /read carefully|scroll down to read|\(\d+s\)/i.test(b.textContent || ''));
            return blocking ? 'waiting' : 'clear';
          });
        } catch {
          res = 'retry'; // a redirect/reload destroyed the context — keep going
        }
        if (res === 'clear') break;
        await new Promise((r) => setTimeout(r, 1200));
      }
      await new Promise((r) => setTimeout(r, 2500));
    }

    out.finalUrl = page.url();
    out.title = await page.title();
    out.authed = !/\/auth\/(login|complete-profile)/.test(out.finalUrl);
    out.heading = await page.evaluate(() => {
      const h = document.querySelector('main h1, main h2, h1, h2');
      return (h?.textContent || '').trim().slice(0, 90);
    });
    out.deniedAccess = await page.evaluate(() =>
      /you don'?t have access|restricted to/i.test(document.body.innerText));
    // Screenshots are PROOF for a pass no human watched — captured only in the
    // HEADLESS pass (for autonomous UI/UX + bug analysis). In the VISIBLE pass the
    // human is the camera; a captureScreenshot there only courts the macOS
    // headed-Chrome crash. Filename includes a path slug so two same-role personas
    // (e.g. learner + champion both = test.student) don't overwrite each other.
    if (headless) {
      const slug = path.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').slice(0, 40) || 'root';
      const shot = `.screenshots/persona-${role}-${slug}.png`;
      try {
        await page.screenshot({ path: shot });
        out.screenshot = shot;
      } catch (se) {
        out.screenshotError = String((se && se.message) || se);
      }
    } else {
      out.note = 'visible — watched live';
      await new Promise((r) => setTimeout(r, Number(process.env.PERSONA_HOLD) || 5000)); // linger so the window is watchable (PERSONA_HOLD ms)
    }
    out.ok = true; // auth + navigation succeeded
  } catch (e) {
    out.error = String((e && e.message) || e);
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
  return out;
}

// ---- main -------------------------------------------------------------------
const args = process.argv.slice(2);
const set = args.length
  ? args.map((a) => { const [r, ...p] = a.split(':'); return [r, p.join(':') || '/']; })
  : DEFAULT_SET;

// MODE picks which passes run, in order:
//   both (DEFAULT) = HEADLESS pass first (captures screenshots for autonomous
//                    UI/UX + bug analysis), THEN VISIBLE pass (you watch the windows).
//   headless       = screenshots only.    visible = watch only.
// PERSONA_HEADLESS=1 is a back-compat alias for MODE=headless.
let MODE = (process.env.PERSONA_MODE || 'both').toLowerCase();
if (process.env.PERSONA_HEADLESS) MODE = 'headless';
const passes = MODE === 'headless' ? [true] : MODE === 'visible' ? [false] : [true, false]; // headless FIRST

const LAUNCH = ['--no-sandbox', '--window-size=1460,920', '--disable-dev-shm-usage', '--disable-gpu'];
async function runPass(headless) {
  const browser = await puppeteer.launch({ headless, args: LAUNCH });
  console.error(`[harness] base=${BASE} pass=${headless ? 'headless·screenshots' : 'visible·watch'} personas=${set.map((s) => s[0]).join(',')}`);
  const res = await Promise.all(set.map(([r, p]) => runPersona(browser, r, p, headless)));
  browser.close().catch(() => {}); // fire-and-forget; headed Chrome can hang on close (macOS)
  return res;
}

let report;
for (const h of passes) {
  const res = await runPass(h);
  if (h || !report) report = res; // prefer the headless pass's results (they carry the screenshots)
}
console.log(JSON.stringify(report, null, 2));
setTimeout(() => process.exit(0), 1500); // hard-exit; headed Chrome can otherwise keep node alive
