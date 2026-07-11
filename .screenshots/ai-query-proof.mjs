// Visual proof: AI Query chat answers through the NEW route code (prompt-cached
// API path) on the worktree dev server. Mints a real super-admin session
// (generateLink → verifyOtp), asks two questions back-to-back — the second
// rides the prompt cache — and screenshots the answered chat.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3105';
const clean = (v) => (v ?? '').replace(/\\[rn]/g, '').replace(/["'\r\n]/g, '').trim();
const envOf = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), clean(l.slice(l.indexOf('=') + 1))]),
  );
const local = envOf('/Users/omm/PROJECTS/MyJKKN/.env.local');
const prod = envOf('/Users/omm/PROJECTS/MyJKKN/.env.production.local');
const URL_ = local.NEXT_PUBLIC_SUPABASE_URL || prod.NEXT_PUBLIC_SUPABASE_URL;
const ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY || prod.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = prod.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: 'test.superadmin@jkkn.ac.in',
});
if (linkErr) throw linkErr;

const jar = new Map();
const anonClient = createServerClient(URL_, ANON, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error: otpErr } = await anonClient.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'magiclink',
});
if (otpErr) throw otpErr;

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await browser.setCookie(
  ...[...jar.entries()].map(([name, value]) => ({
    name, value, domain: 'localhost', path: '/', secure: false, httpOnly: false,
  })),
);

async function ask(question, shotName) {
  const input = await page.waitForSelector('input[placeholder*="question" i], textarea[placeholder*="question" i], textarea', { timeout: 30000 });
  await input.click();
  await input.type(question, { delay: 10 });
  await page.keyboard.press('Enter');
  // Wait for the request to complete by watching the network response.
  await page.waitForResponse(
    (r) => r.url().includes('/api/ai-query') && r.request().method() === 'POST',
    { timeout: 240000 },
  );
  await new Promise((r) => setTimeout(r, 4000)); // render settle
  await page.screenshot({ path: `/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/ai-query-max/.screenshots/${shotName}`, fullPage: false });
  console.log('shot:', shotName);
}

await page.goto(`${BASE}/ai-query`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 8000)); // hydration
console.log('landed on:', page.url());
await page.screenshot({ path: '/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/ai-query-max/.screenshots/ai-query-landing.png' });
await ask('How many learners are enrolled per institution? Keep it short.', 'ai-query-cached-1.png');
await ask('And how many departments exist in total?', 'ai-query-cached-2.png');

await browser.close();
console.log('DONE');
