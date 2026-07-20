// scripts/persona-harness/vsr-live-verify.mjs
// Post-deploy live verification of the Verified Skills Record on www.jkkn.ai,
// with screenshots (the rule-25 eyeball pass):
//   1. /my-proof as a REAL learner (minted session, cookie-injected browser)
//   2. /proof/<token> — live employer view (temp dial-on → create → shot)
//   3. same link after revoke → dark panel
//   4. /proof/<random> → dark panel
// Cleanup: temp dial row + all probe tokens deleted; zero residue.
//
// Usage: node scripts/persona-harness/vsr-live-verify.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

const BASE = process.env.VSR_BASE_URL ?? 'https://www.jkkn.ai';
const SHOTS = '.screenshots';

const env = (f, k) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(k + '='))
    ?.slice(k.length + 1)
    .replace(/^["']|["']$/g, '')
    .replace(/\\+[rn]$/g, '')
    .trim();

const SUPABASE_URL = env('.env.local', 'NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = env('.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE_KEY = env('/Users/omm/PROJECTS/MyJKKN/.env.production.local', 'SUPABASE_SERVICE_ROLE_KEY');

const BHARATH = {
  email: 'bharatha25uai@jkkn.ac.in',
  register: '25JUGAID002',
  learnerId: 'fd6aa49c-af85-484d-ad59-4f6c09568db1',
  instId: 'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function mintCookies(email) {
  const { data: ld, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (le) throw new Error(le.message);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: ld.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(error.message);
  const jar = new Map();
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  await ssr.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  const host = new URL(BASE).hostname;
  return {
    cookies: [...jar.entries()].map(([name, value]) => ({
      name,
      value: encodeURIComponent(value),
      domain: host,
      path: '/',
      secure: true,
    })),
    jwt: data.session.access_token,
  };
}

async function rpcAs(jwt, fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return res.json().catch(() => null);
}

async function main() {
  console.log(`live-verify against ${BASE}\n`);
  const browser = await puppeteer.launch({ headless: 'new' });
  let policyId = null;
  try {
    // ── 1. BHARATH's own /my-proof ──────────────────────────────────────────
    const { cookies, jwt } = await mintCookies(BHARATH.email);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await ctx.setCookie(...cookies);
    await page.goto(`${BASE}/my-proof`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page
      .waitForFunction(
        () => /25JUGAID002|no learner profile|Could not load/i.test(document.body.innerText),
        { timeout: 45000 },
      )
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const body1 = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${SHOTS}/vsr-live-my-proof-bharath.png`, fullPage: true });
    check(
      'prod /my-proof renders BHARATH record',
      body1.includes(BHARATH.register) && body1.includes('109'),
      `register=${body1.includes(BHARATH.register)} att109=${body1.includes('109')}`,
    );
    check('prod /my-proof shows sharing locked (dial off)', /not yet switched on/i.test(body1), '');

    // ── 2. live employer view: dial-on → create → screenshot ───────────────
    const { data: pol } = await admin
      .from('platform_policies')
      .insert({
        policy_key: 'vsr.sharing_enabled',
        scope_type: 'institution',
        scope_id: BHARATH.instId,
        value: true,
        description: 'TEMP vsr-live-verify — deleted by the same script',
        data_type: 'boolean',
        is_system: false,
      })
      .select('id')
      .single();
    policyId = pol.id;

    const created = await rpcAs(jwt, 'fn_vsr_create_share_token', { p_label: 'Live-verify eyeball' });
    check('prod share-token create (dial on)', created?.success === true, JSON.stringify(created)?.slice(0, 60));
    const token = created.token;

    const pub = await ctx.newPage();
    await pub.setViewport({ width: 1280, height: 900 });
    await pub.goto(`${BASE}/proof/${token}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pub.waitForFunction(() => document.body.innerText.length > 100, { timeout: 30000 }).catch(() => {});
    const body2 = await pub.evaluate(() => document.body.innerText);
    await pub.screenshot({ path: `${SHOTS}/vsr-live-proof-link-live.png`, fullPage: true });
    check(
      'prod /proof/<token> live employer view renders',
      body2.includes(BHARATH.register) && /Live record/i.test(body2),
      '',
    );

    // ── 3. revoke → dark ────────────────────────────────────────────────────
    const revoked = await rpcAs(jwt, 'fn_vsr_revoke_share_token', { p_token_id: created.id });
    check('prod revoke', revoked?.success === true, '');
    await pub.goto(`${BASE}/proof/${token}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const body3 = await pub.evaluate(() => document.body.innerText);
    await pub.screenshot({ path: `${SHOTS}/vsr-live-proof-link-revoked.png`, fullPage: true });
    check(
      'prod link dark after revoke',
      /not active/i.test(body3) && !body3.includes(BHARATH.register),
      '',
    );

    // ── 4. random token dark ────────────────────────────────────────────────
    await pub.goto(`${BASE}/proof/random-token-eyeball-000000`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const body4 = await pub.evaluate(() => document.body.innerText);
    await pub.screenshot({ path: `${SHOTS}/vsr-live-proof-random-dark.png` });
    check('prod random token dark', /not active/i.test(body4), '');
  } finally {
    if (policyId) await admin.from('platform_policies').delete().eq('id', policyId);
    await admin.from('vsr_share_tokens').delete().eq('learner_id', BHARATH.learnerId);
    await browser.close();
  }
  const { data: leftPol } = await admin
    .from('platform_policies')
    .select('id')
    .eq('policy_key', 'vsr.sharing_enabled')
    .eq('scope_type', 'institution');
  const { data: leftTok } = await admin
    .from('vsr_share_tokens')
    .select('id')
    .eq('learner_id', BHARATH.learnerId);
  check('cleanup: zero residue', (leftPol ?? []).length === 0 && (leftTok ?? []).length === 0, '');

  console.log(`\n${results.filter(Boolean).length}/${results.length} PASS`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((e) => {
  console.error('LIVE-VERIFY ERROR:', e);
  process.exit(2);
});
