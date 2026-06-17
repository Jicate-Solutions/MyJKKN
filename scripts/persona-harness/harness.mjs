// .claude/persona-harness/harness.mjs
// ============================================================================
// MyJKKN multi-persona test harness (read-only)
//
// Problem it solves: testing role-gated pages on www.jkkn.ai meant logging in
// and out of real Google accounts, one persona at a time. Chrome profiles are
// hard-isolated, so a single automation session can't hold many personas.
//
// How it works: for each persona it mints a VALID @supabase/ssr session using
// the app's OWN auth library (createServerClient + signInWithPassword against a
// test account) — so the chunked `sb-<ref>-auth-token` cookie is byte-correct,
// no hand-rolled base64 chunking. That session is injected into an ISOLATED
// Puppeteer browser context. N personas run in PARALLEL against the live site.
//
// READ-ONLY by design: it navigates and screenshots. It never clicks a write
// action — these are real test accounts on production.
//
// Usage:
//   node .claude/persona-harness/harness.mjs                 # default proof set
//   node .claude/persona-harness/harness.mjs hod:/ai-pulse/lab superadmin:/ai-pulse/dept
//   PERSONA_BASE_URL=http://localhost:3104 node .claude/persona-harness/harness.mjs  # against a dev server
//
// Personas (complete-profile test accounts only): superadmin hod faculty student staff
// Output: JSON summary on stdout + PNGs in .screenshots/persona-<role>.png
// ============================================================================

import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

// ---- config ----------------------------------------------------------------
const BASE = process.env.PERSONA_BASE_URL || 'https://www.jkkn.ai';
const PASSWORD = process.env.PERSONA_PASSWORD || 'Test@1234';
const HOST = new URL(BASE).hostname;

const ROLE_EMAIL = {
  superadmin: 'test.superadmin@jkkn.ac.in',
  hod: 'test.hod@jkkn.ac.in',
  faculty: 'test.faculty@jkkn.ac.in',
  student: 'test.student@jkkn.ac.in',
  staff: 'test.staff@jkkn.ac.in',
};

// role -> default page to open when no explicit path is given
const DEFAULT_SET = [
  ['superadmin', '/ai-pulse/dept'],
  ['hod', '/ai-pulse/lab'],
  ['faculty', '/ai-pulse/my-pulse'],
  ['student', '/ai-pulse'],
];

// ---- read public env from .env.local (NEXT_PUBLIC_* — safe) -----------------
function readEnv(key) {
  const txt = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) throw new Error('missing ' + key + ' in .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const SUPA_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

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
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
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
async function runPersona(browser, role, path) {
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
    // A screenshot is PROOF for a run no human watched — so capture it only in
    // headless mode. In headed mode the human IS the camera; attempting a
    // captureScreenshot here only courts the macOS headed-Chrome crash for zero
    // gain. Orthogonal jobs: headed = observe live, headless = record proof.
    if (process.env.PERSONA_HEADLESS) {
      const shot = `.screenshots/persona-${role}.png`;
      try {
        await page.screenshot({ path: shot });
        out.screenshot = shot;
      } catch (se) {
        out.screenshotError = String((se && se.message) || se);
      }
    } else {
      out.note = 'headed — watched live; rerun with PERSONA_HEADLESS=1 to capture a screenshot';
      await new Promise((r) => setTimeout(r, 5000)); // linger so the window is watchable
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

// VISIBLE WINDOWS BY DEFAULT — you watch it test in real Chrome windows.
// Set PERSONA_HEADLESS=1 for an invisible background run (CI, batch, no display).
const HEADLESS = !!process.env.PERSONA_HEADLESS;
const browser = await puppeteer.launch({
  headless: HEADLESS,
  args: ['--no-sandbox', '--window-size=1460,920', '--disable-dev-shm-usage', '--disable-gpu'],
});
console.error(`[harness] base=${BASE} headless=${HEADLESS} personas=${set.map((s) => s[0]).join(',')}`);

// Personas run in parallel, each in its own window/context. In headed mode each
// window lingers ~5s (see runPersona) so you can watch it before it closes.
const results = await Promise.all(set.map(([r, p]) => runPersona(browser, r, p)));
console.log(JSON.stringify(results, null, 2)); // print results FIRST — before any close hang
browser.close().catch(() => {}); // fire-and-forget; headed Chrome can hang on close (macOS)
setTimeout(() => process.exit(0), 1500); // hard-exit shortly after, regardless of close state
