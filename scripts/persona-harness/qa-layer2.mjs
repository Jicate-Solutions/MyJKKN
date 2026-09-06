// Layer 2 — API Route Matrix: routes × methods × auth modes, live prod.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
const ROOT = '/Users/omm/PROJECTS/MyJKKN';
const BASE = 'https://www.jkkn.ai';
function env(file, key) {
  const m = readFileSync(resolve(ROOT, file), 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
  return m[1].trim().replace(/^["']|["']$/g, '').replace(/\\[rn]$/g, '');
}
const admin = createClient(env('.env.local','NEXT_PUBLIC_SUPABASE_URL'), env('.env.production.local','SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
async function cookieFor(email) {
  if (!email) return '';
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(email + ': ' + error.message);
  const store = {};
  const sb = createServerClient(env('.env.local','NEXT_PUBLIC_SUPABASE_URL'), env('.env.local','NEXT_PUBLIC_SUPABASE_ANON_KEY'), { cookies: { getAll: () => Object.entries(store).map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => { store[name] = value; }) } });
  const { error: e2 } = await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (e2) throw new Error(email + ': ' + e2.message);
  return Object.entries(store).map(([n, v]) => `${n}=${v}`).join('; ');
}
const CET = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const AUD = `/api/internal-marks/exam-audit?institutionId=${CET}&sessionCode=APRIL-MAY-2026`;
const RUN = '/api/internal-marks/my-running-attendance';
const REG_EMAIL = process.argv[2]; // registrar email
const cases = [
  // [label, path, method, email, expected...]
  ['audit GET anon',        AUD, 'GET',    null,                        [401]],
  ['audit GET student',     AUD, 'GET',    'sanjayg.ahs@jkkn.ac.in',    [403]],
  ['audit GET principal-x', AUD, 'GET',    'test.principal@jkkn.ac.in', [403]],
  ['audit GET registrar',   AUD, 'GET',    REG_EMAIL,                   [200]],
  ['audit GET superadmin',  AUD, 'GET',    'test.superadmin@jkkn.ac.in',[200]],
  ['audit POST superadmin', AUD, 'POST',   'test.superadmin@jkkn.ac.in',[405]],
  ['audit PUT superadmin',  AUD, 'PUT',    'test.superadmin@jkkn.ac.in',[405]],
  ['audit DELETE superadm', AUD, 'DELETE', 'test.superadmin@jkkn.ac.in',[405]],
  ['run GET anon',          RUN, 'GET',    null,                        [401]],
  ['run GET student',       RUN, 'GET',    'sanjayg.ahs@jkkn.ac.in',    [200]],
  ['run GET staff(hod)',    RUN, 'GET',    'test.hod@jkkn.ac.in',       [200]], // empty list, not error
  ['run POST student',      RUN, 'POST',   'sanjayg.ahs@jkkn.ac.in',    [405]],
];
const cookies = new Map();
let fails = 0;
for (const [label, path, method, email, expected] of cases) {
  if (email && !cookies.has(email)) cookies.set(email, await cookieFor(email));
  const res = await fetch(BASE + path, { method, headers: email ? { cookie: cookies.get(email) } : {} });
  let note = '';
  if (label === 'run GET student' && res.status === 200) {
    const b = await res.json(); note = ` courses=${b.courses?.length}`;
  } else if (label === 'run GET staff(hod)' && res.status === 200) {
    const b = await res.json(); note = ` courses=${b.courses?.length} (empty=ok)`;
  } else if (label === 'audit GET registrar' && res.status === 200) {
    const b = await res.json(); note = ` programs=${b.programs?.length} totals=${JSON.stringify(b.totals ?? null)}`.slice(0, 90);
  }
  const ok = expected.includes(res.status);
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label.padEnd(22)} | ${method.padEnd(6)} | got ${res.status} want ${expected}${note}`);
}
console.log(fails === 0 ? 'LAYER2: ALL PASS' : `LAYER2: ${fails} FAIL`);
