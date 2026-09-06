// admin-mint-snapshot.mjs — render a PROD page as ANY real user without their
// password, via admin generateLink + verifyOtp (non-destructive; issues a session
// only). Headless, isolated context, screenshot only. Read-only navigation.
//
//   node admin-mint-snapshot.mjs <email> <path> [outSlug]
//
// Reads NEXT_PUBLIC_* from ../../.env.local and SERVICE_ROLE from
// ../../.env.production.local (both relative to this script's worktree root).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PERSONA_BASE_URL || 'https://www.jkkn.ai';
const HOST = new URL(BASE).hostname;

function readEnv(file, key) {
  const txt = readFileSync(resolve(DIR, file), 'utf8');
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) throw new Error(`missing ${key} in ${file}`);
  let v = m[1].trim().replace(/^["']|["']$/g, '');
  if (v.endsWith('\\n')) v = v.slice(0, -2);
  return v.trim();
}
const URL_ = readEnv('../../.env.local', 'NEXT_PUBLIC_SUPABASE_URL');
const ANON = readEnv('../../.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SVC = readEnv('../../.env.production.local', 'SUPABASE_SERVICE_ROLE_KEY');

const [email, path = '/', outSlug] = process.argv.slice(2);
if (!email) { console.error('usage: admin-mint-snapshot.mjs <email> <path> [slug]'); process.exit(1); }

async function mint(email) {
  const admin = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error('no hashed_token from generateLink');

  const store = {};
  const sb = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => { store[name] = value; }),
    },
  });
  const { error: vErr } = await sb.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (vErr) throw new Error(`verifyOtp: ${vErr.message}`);
  const cookies = Object.entries(store).map(([name, value]) => ({
    name, value, domain: HOST, path: '/', secure: BASE.startsWith('https'),
    httpOnly: false, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600,
  }));
  if (!cookies.length) throw new Error('no cookies minted');
  return cookies;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1460,920'] });
const out = { email, path };
try {
  const cookies = await mint(email);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  await page.setCookie(...cookies);
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, Number(process.env.MINT_WAIT) || 16000)); // RPC chain ~15s
  out.finalUrl = page.url();
  out.authed = !/\/auth\/(login|complete-profile)/.test(out.finalUrl);
  const slug = outSlug || path.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'root';
  const shot = `.screenshots/mint-${slug}.png`;
  await page.screenshot({ path: shot, fullPage: process.env.FULLPAGE !== '0' });
  out.screenshot = shot;
  out.ok = true;
} catch (e) {
  out.error = String((e && e.message) || e);
} finally {
  await browser.close().catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
setTimeout(() => process.exit(0), 1000);
