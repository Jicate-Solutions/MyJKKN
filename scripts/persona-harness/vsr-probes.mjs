// scripts/persona-harness/vsr-probes.mjs
// Verified Skills Record — pre-PR live probes (dev server @3104 + prod DB).
//
// Proves, against the REAL running stack:
//   1. /api/proof-record as a real learner → numbers match the source fns
//   2. /api/proof-record unauthenticated → 401
//   3. IDOR: learner B's session gets B's record, never A's (RPC + route)
//   4. anon RPC surface: shared_record(random)=null; my_record denied
//   5. share-link lifecycle on the real /proof/[token] page:
//      dial-on (temp) → create → page 200 with record → revoke → page dark
//      → cleanup (dial row + token rows deleted; zero residue)
//
// Writes it makes on prod and then removes: 1 institution-scoped policy row,
// share-token rows for one learner, the learner-state view stamp (left in
// place — it is true: the learner's record WAS viewed by this probe run under
// their own session; harmless and self-scoped).
//
// Usage: node scripts/persona-harness/vsr-probes.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const BASE = process.env.VSR_BASE_URL ?? 'http://localhost:3104';
const ROOT = new URL('../../', import.meta.url).pathname;

function env(file, key) {
  const line = readFileSync(new URL(file, `file://${ROOT}`), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return null;
  return line
    .slice(key.length + 1)
    .replace(/^["']|["']$/g, '')
    .replace(/\\+[rn]$/g, '')
    .trim();
}

const SUPABASE_URL = env('.env.local', 'NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = env('.env.local', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
// .env.production.local lives in the MAIN checkout, not the worktree
const SERVICE_KEY = (() => {
  const raw = readFileSync('/Users/omm/PROJECTS/MyJKKN/.env.production.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
  return raw
    .slice('SUPABASE_SERVICE_ROLE_KEY='.length)
    .replace(/^["']|["']$/g, '')
    .replace(/\\+[rn]$/g, '')
    .trim();
})();

const BHARATH = {
  email: 'bharatha25uai@jkkn.ac.in',
  register: '25JUGAID002',
  learnerId: 'fd6aa49c-af85-484d-ad59-4f6c09568db1',
  instId: 'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
};
const OTHER = { email: 'kaaviyad25bds@jkkn.ac.in', register: 'BDS25038' };

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Mint a real session for any user (admin generateLink → verifyOtp). */
async function mintSession(email) {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) throw new Error(`generateLink(${email}): ${linkErr.message}`);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp(${email}): ${error.message}`);
  return data.session;
}

/** Byte-correct @supabase/ssr cookie header for a session (chunked). */
function cookieHeaderFor(session) {
  const jar = new Map();
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  return ssr.auth
    .setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    .then(() =>
      [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; '),
    );
}

async function rpcAs(jwt, fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt ?? ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw */
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`probing ${BASE} against ${SUPABASE_URL}\n`);

  // ── 1. learner route: BHARATH ─────────────────────────────────────────────
  const sessionA = await mintSession(BHARATH.email);
  const cookieA = await cookieHeaderFor(sessionA);
  const resA = await fetch(`${BASE}/api/proof-record`, { headers: { cookie: cookieA } });
  const bodyA = await resA.json();
  check('route: 200 for learner', resA.status === 200, `status=${resA.status}`);
  const rec = bodyA.record;
  check(
    'route: identity is BHARATH',
    rec?.learner?.register_number === BHARATH.register,
    rec?.learner?.register_number,
  );
  check(
    'route: attendance overall 109/109',
    rec?.attendance?.overall?.present === 109 && rec?.attendance?.overall?.total === 109,
    JSON.stringify(rec?.attendance?.overall),
  );
  check(
    'route: engagement 102 check-ins / 25 prompt / verified',
    rec?.engagement?.total_checkins === 102 &&
      rec?.engagement?.prompt_checkins === 25 &&
      rec?.engagement?.verified === true,
    JSON.stringify({
      t: rec?.engagement?.total_checkins,
      p: rec?.engagement?.prompt_checkins,
      v: rec?.engagement?.verified,
    }),
  );
  check(
    'route: marks honestly empty (zero exam-system rows)',
    bodyA.marks?.status === 'empty' || bodyA.marks?.status === 'unavailable',
    bodyA.marks?.status,
  );
  check(
    'route: sharing dial off for his college',
    bodyA.share?.sharing_enabled === false,
    String(bodyA.share?.sharing_enabled),
  );

  // ── 2. unauthenticated route → 401 ────────────────────────────────────────
  const resNoAuth = await fetch(`${BASE}/api/proof-record`);
  check('route: 401 unauthenticated', resNoAuth.status === 401, `status=${resNoAuth.status}`);

  // ── 3. IDOR: learner B gets ONLY B ────────────────────────────────────────
  const sessionB = await mintSession(OTHER.email);
  const rpcB = await rpcAs(sessionB.access_token, 'fn_vsr_my_record');
  check(
    'IDOR: learner B rpc returns B, not A',
    rpcB.json?.learner?.register_number === OTHER.register &&
      rpcB.json?.learner?.register_number !== BHARATH.register,
    rpcB.json?.learner?.register_number,
  );
  const tokensB = await fetch(
    `${SUPABASE_URL}/rest/v1/vsr_share_tokens?select=id`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${sessionB.access_token}` } },
  );
  const tokensBJson = await tokensB.json();
  check(
    "IDOR: learner B sees zero of A's tokens",
    Array.isArray(tokensBJson) && tokensBJson.length === 0,
    `rows=${tokensBJson?.length}`,
  );

  // ── 4. anon RPC surface ───────────────────────────────────────────────────
  const anonRandom = await rpcAs(null, 'fn_vsr_shared_record', {
    p_token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  });
  check(
    'anon: random token → null',
    anonRandom.status === 200 && (anonRandom.json === null || anonRandom.text === ''),
    `status=${anonRandom.status} body=${anonRandom.text.slice(0, 40)}`,
  );
  const anonMyRecord = await rpcAs(null, 'fn_vsr_my_record');
  check(
    'anon: fn_vsr_my_record denied',
    anonMyRecord.status === 401 || anonMyRecord.status === 403 || anonMyRecord.status === 404,
    `status=${anonMyRecord.status}`,
  );

  // ── 5. share-link lifecycle on the real public page ───────────────────────
  let policyId = null;
  try {
    const { data: pol, error: polErr } = await admin
      .from('platform_policies')
      .insert({
        policy_key: 'vsr.sharing_enabled',
        scope_type: 'institution',
        scope_id: BHARATH.instId,
        value: true,
        description: 'TEMP vsr-probes run — deleted by the same script',
        data_type: 'boolean',
        is_system: false,
      })
      .select('id')
      .single();
    if (polErr) throw new Error(`dial-on insert: ${polErr.message}`);
    policyId = pol.id;

    const created = await rpcAs(sessionA.access_token, 'fn_vsr_create_share_token', {
      p_label: 'vsr-probes lifecycle',
    });
    check('share: create succeeds with dial on', created.json?.success === true, created.text.slice(0, 80));
    const token = created.json?.token;

    const page1 = await fetch(`${BASE}/proof/${token}`);
    const html1 = await page1.text();
    check(
      'public page: live record renders',
      page1.status === 200 &&
        html1.includes(BHARATH.register) &&
        html1.includes('Live record'),
      `status=${page1.status} hasRegister=${html1.includes(BHARATH.register)}`,
    );
    check(
      'public page: no dispute/health internals leak',
      !html1.includes('correction') && !html1.includes('window_days'),
      '',
    );

    const revoked = await rpcAs(sessionA.access_token, 'fn_vsr_revoke_share_token', {
      p_token_id: created.json?.id,
    });
    check('share: revoke succeeds', revoked.json?.success === true, revoked.text.slice(0, 60));

    const page2 = await fetch(`${BASE}/proof/${token}`);
    const html2 = await page2.text();
    check(
      'public page: dark after revoke',
      html2.includes('not active') && !html2.includes(BHARATH.register),
      `hasRegister=${html2.includes(BHARATH.register)}`,
    );

    const pageRandom = await fetch(`${BASE}/proof/not-a-real-token-aaaaaaaaaaaa`);
    const htmlRandom = await pageRandom.text();
    check('public page: dark for random token', htmlRandom.includes('not active'), '');
  } finally {
    // cleanup: the temp dial row + every probe token row
    if (policyId) await admin.from('platform_policies').delete().eq('id', policyId);
    await admin.from('vsr_share_tokens').delete().eq('learner_id', BHARATH.learnerId);
  }
  const { data: leftoverPol } = await admin
    .from('platform_policies')
    .select('id')
    .eq('policy_key', 'vsr.sharing_enabled')
    .eq('scope_type', 'institution');
  const { data: leftoverTok } = await admin
    .from('vsr_share_tokens')
    .select('id')
    .eq('learner_id', BHARATH.learnerId);
  check(
    'cleanup: zero residue (dial rows + tokens)',
    (leftoverPol ?? []).length === 0 && (leftoverTok ?? []).length === 0,
    `pol=${leftoverPol?.length} tok=${leftoverTok?.length}`,
  );

  // ── 6. render: /my-proof SSR shell responds for a learner ────────────────
  const pageMy = await fetch(`${BASE}/my-proof`, { headers: { cookie: cookieA } });
  check('render: /my-proof responds for learner', pageMy.status === 200, `status=${pageMy.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('PROBE HARNESS ERROR:', e);
  process.exit(2);
});
