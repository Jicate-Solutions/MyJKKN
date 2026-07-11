// Visual proof: /admin/ai-models with lane badges + "Scheduled on Max" switches
// + policy badges, rendered as a real super admin on the worktree dev server.
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
const { data: linkData, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'test.superadmin@jkkn.ac.in' });
if (error) throw error;
const jar = new Map();
const anonClient = createServerClient(URL_, ANON, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error: otpErr } = await anonClient.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' });
if (otpErr) throw otpErr;

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1100 });
await browser.setCookie(
  ...[...jar.entries()].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/', secure: false, httpOnly: false })),
);
await page.goto(`${BASE}/admin/ai-models`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 12000)); // hydration + both fetches
console.log('landed on:', page.url());
await page.evaluate(() => {
  const st = document.createElement('style');
  st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  document.head.appendChild(st);
});
await page.pdf({ path: '/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/ai-query-max/.screenshots/ai-models-lanes.pdf', format: 'A3', printBackground: true, timeout: 120000 });
await browser.close();
console.log('DONE');
