#!/usr/bin/env node
/**
 * scripts/verify/my-desk-waiting-live.mjs — READ-ONLY.
 *
 * Proves fn_my_desk_waiting() against production for ONE user by reproducing
 * every queue rule in JavaScript from the SOURCE TABLES (never from the
 * function) and comparing the two answers per source.
 *
 * Two halves:
 *   expected-from-source  — always runs. Reads the source tables with the
 *                           service key and applies the same rules the
 *                           migration documents (20261018020000).
 *   function              — runs only when the function can be CALLED AS THE
 *                           USER: that needs SUPABASE_JWT_SECRET (the same env
 *                           lib/auth/impersonate.ts uses) to mint a short-lived
 *                           HS256 token with sub=<user>. Without it, or before the
 *                           migration is applied, this half prints "pending".
 *
 * Usage:
 *   node scripts/verify/my-desk-waiting-live.mjs --user <uuid> [--env .env.production.local]
 *                                                [--mode expected|compare] [--show]
 *
 * Env (from --env file, then process.env): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET.
 * Nothing is written. Exit 1 when the compare half disagrees.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const DIRECTOR = 'b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const USER = arg('--user', DIRECTOR);
const SHOW = argv.includes('--show');
const out = (s) => process.stdout.write(`${s}\n`);

// --- env -------------------------------------------------------------------
const envFile = arg('--env', ['.env.production.local', '.env.local'].find((f) => existsSync(f)));
if (envFile && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    // Some local env files carry a literal "\n" inside the quotes; strip it.
    const v = m[2].replace(/\\n/g, '').replace(/^["']|["']$/g, '').trim();
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
if (!URL || !SERVICE) {
  out('need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (use --env <file>)');
  process.exit(2);
}
const MODE = arg('--mode', JWT_SECRET ? 'compare' : 'expected');

// --- read helpers (GET only) ----------------------------------------------
async function rest(path, headers = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function all(path) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await rest(`${path}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
/** Postgres jsonb `?` : array contains the string, object has the key, string equals. */
const jsonbHas = (v, key) => Array.isArray(v) ? v.includes(key) : v && typeof v === 'object' ? key in v : v === key;
const stepOf = (chain, i) => (Array.isArray(chain) && chain.length > 0 ? chain[i] ?? null : null);
const dayAge = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// --- who is this user ------------------------------------------------------
const [profile] = await rest(`profiles?id=eq.${USER}&select=id,role,is_super_admin,institution_id,full_name`);
if (!profile) { out(`no profile for ${USER}`); process.exit(2); }
const roleRows = await rest(`user_roles?user_id=eq.${USER}&select=role_id,custom_roles(id,role_key,role_name,institution_scope,is_active)`);
const roles = roleRows.map((r) => r.custom_roles).filter(Boolean);
const legacyRole = profile.role ? (await rest(`custom_roles?role_key=eq.${encodeURIComponent(profile.role)}&select=institution_scope`))[0] : null;
const uia = (await rest(`user_institution_access?user_id=eq.${USER}&is_active=eq.true&select=institution_id`)).map((r) => r.institution_id);
const myStaff = await rest(`staff?profile_id=eq.${USER}&is_active=eq.true&select=id,institution_id`);
const orgs = await rest('hr_organizations?select=id,institution_id');

const isSuper = profile.is_super_admin === true;
const isAdmin = isSuper || ['admin', 'super_admin', 'administrator'].includes(profile.role);
// role_has_institution_access(), reproduced.
const scopeAll = isSuper || roles.some((r) => r.institution_scope === 'all') || legacyRole?.institution_scope === 'all';
const hasInst = (inst) => inst == null || scopeAll || inst === profile.institution_id || uia.includes(inst);
// fn_my_hr_organization_ids(), reproduced.
const staffInst = new Set(myStaff.map((s) => s.institution_id));
const myOrgIds = new Set(orgs.filter((o) => hasInst(o.institution_id) || staffInst.has(o.institution_id)).map((o) => o.id));
const myStaffIds = new Set(myStaff.map((s) => s.id));
const roleKeysLc = new Set(roles.map((r) => r.role_key.toLowerCase()));
const activeRoleKeys = new Set(roles.filter((r) => r.is_active).map((r) => r.role_key));
const roleIds = new Set(roles.map((r) => r.id));

out(`fn_my_desk_waiting — live verification (${MODE})`);
out(`user ${USER} (${profile.full_name ?? '?'}) super_admin=${isSuper} admin=${isAdmin} roles=[${roles.map((r) => r.role_key).join(',')}] hr_orgs=${myOrgIds.size} staff_rows=${myStaff.length}`);

// --- expected-from-source ---------------------------------------------------
const expected = {};

// 1. recruitment — fn_list_my_pending_recruitment predicate.
const cands = await all('hr_recruitment_candidates?status=in.(submitted,pending_approval)&select=id,name,role_title,approval_chain,current_step,updated_at');
expected.recruitment = cands.filter((c) => {
  const s = stepOf(c.approval_chain, c.current_step);
  if (!s || typeof s !== 'object') return false;
  const pinned = s.approver_user_id ?? null;
  return pinned === USER || (pinned === null && roleKeysLc.has(String(s.approver_role ?? '').toLowerCase()));
}).map((c) => ({ id: c.id, since: c.updated_at, label: `${c.name} — ${c.role_title}` }));

// 2. refund — fn_refund_assignee_match on the current stage.
const refunds = await all('billing_refund_requests?status=eq.pending_review&select=id,request_number,total_refund_amount,initiated_at,created_at,current_stage_index,flow_snapshot');
expected.refund = refunds.filter((r) => {
  const stages = r.flow_snapshot?.stages;
  const st = Array.isArray(stages) ? stages[r.current_stage_index] : null;
  if (!st) return false;
  return jsonbHas(st.assignee_users, USER) || [...roleIds].some((id) => jsonbHas(st.assignee_roles, id));
}).map((r) => ({ id: r.id, since: r.initiated_at ?? r.created_at, label: r.request_number, amount: Number(r.total_refund_amount) }));

// 3. leave — designated-approver branch of hr_leave_my_approval_queue.
const leaves = await all('hr_leave_applications?status=in.(pending,escalated)&select=id,employee_id,hr_organization_id,approval_chain,current_step,created_at');
const approversOf = (step) => (Array.isArray(step?.approvers) && step.approvers.length > 0 ? step.approvers : [step]);
expected.leave = leaves.filter((a) => {
  const step = stepOf(a.approval_chain, a.current_step);
  if (step == null) return false;
  if (!myOrgIds.has(a.hr_organization_id)) return false;
  if (myStaffIds.has(a.employee_id)) return false;
  return approversOf(step).some((e) => {
    if (!e || typeof e !== 'object') return false;
    const uid = e.approver_user_id || null;
    const role = e.approver_role || null;
    return uid === USER || (role !== null && activeRoleKeys.has(role));
  });
}).map((a) => ({ id: a.id, since: a.created_at, label: a.id }));

// 4. meeting_trigger — /meetings/triggers gate + DECIDABLE set.
expected.meeting_trigger = (isSuper || isAdmin)
  ? (await all(`meeting_trigger_events?director_decision=is.null&explanation_deadline=lt.${new Date().toISOString()}&status=in.(notified,explained,meeting_pending)&select=id,metric_key,subject_label,explanation_deadline`))
      .map((e) => ({ id: e.id, since: e.explanation_deadline, label: `${e.metric_key} — ${e.subject_label ?? ''}` }))
  : [];

// 5. grievance — unassigned + live, super admin only.
expected.grievance = isSuper
  ? (await all('grievance_tickets?assigned_to=is.null&status=in.(open,in_progress)&select=id,ticket_number,subject,created_at'))
      .map((g) => ({ id: g.id, since: g.created_at, label: `${g.ticket_number} — ${g.subject}` }))
  : [];

out('\n== expected-from-source (rules reproduced in JS, read from the source tables)');
const SOURCES = ['recruitment', 'refund', 'leave', 'meeting_trigger', 'grievance'];
let total = 0;
for (const s of SOURCES) {
  const rows = expected[s];
  total += rows.length;
  const oldest = rows.length ? Math.max(...rows.map((r) => dayAge(r.since))) : null;
  const amount = s === 'refund' ? ` amount=₹${rows.reduce((a, r) => a + r.amount, 0).toLocaleString('en-IN')}` : '';
  out(`  ${s.padEnd(16)} ${String(rows.length).padStart(4)}${oldest === null ? '' : `  oldest ${oldest}d`}${amount}`);
  if (SHOW) for (const r of rows.slice(0, 10)) out(`      ${r.id} ${dayAge(r.since)}d ${r.label}`);
}
out(`  ${'total'.padEnd(16)} ${String(total).padStart(4)}${total > 500 ? '  (function caps at 500)' : ''}`);

// --- function half ----------------------------------------------------------
if (MODE !== 'compare') {
  out('\n== function: pending — run with SUPABASE_JWT_SECRET set (--mode compare) after the migration is applied');
  process.exit(0);
}
if (!ANON) { out('compare needs NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(2); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, role: 'authenticated', aud: 'authenticated', iss: 'supabase', iat: now, exp: now + 300 })}`;
const jwt = `${head}.${createHmac('sha256', JWT_SECRET).update(head).digest('base64url')}`;
const fr = await fetch(`${URL}/rest/v1/rpc/fn_my_desk_waiting`, {
  method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: '{}',
});
if (!fr.ok) {
  out(`\n== function: call failed ${fr.status} ${(await fr.text()).slice(0, 300)}`);
  out('   (404 / PGRST202 = migration not applied yet)');
  process.exit(1);
}
const got = await fr.json();
out(`\n== function (called as the user) — ${got.length} rows`);
let failed = false;
for (const s of SOURCES) {
  const g = new Set(got.filter((r) => r.source === s).map((r) => r.item_id));
  const e = new Set(expected[s].map((r) => r.id));
  const missing = [...e].filter((id) => !g.has(id));
  const extra = [...g].filter((id) => !e.has(id));
  const ok = missing.length === 0 && extra.length === 0;
  failed ||= !ok;
  out(`  ${s.padEnd(16)} fn=${String(g.size).padStart(4)} expected=${String(e.size).padStart(4)}  ${ok ? 'MATCH' : `MISMATCH missing=${missing.length} extra=${extra.length}`}`);
  if (!ok && SHOW) { for (const id of missing.slice(0, 5)) out(`      missing ${id}`); for (const id of extra.slice(0, 5)) out(`      extra   ${id}`); }
}
const badShape = got.filter((r) => !SOURCES.includes(r.source) || !r.item_id || !r.title || !r.href || typeof r.age_days !== 'number');
const sorted = got.every((r, i) => i === 0 || got[i - 1].waiting_since <= r.waiting_since);
out(`  contract: shape ${badShape.length === 0 ? 'ok' : `${badShape.length} bad rows`}, order ${sorted ? 'waiting_since ASC ok' : 'NOT sorted'}, cap ${got.length <= 500 ? 'ok' : 'EXCEEDED'}`);
if (badShape.length || !sorted) failed = true;
if (SHOW) for (const r of got.slice(0, 15)) out(`      ${r.source.padEnd(16)} ${String(r.age_days).padStart(4)}d ${r.title} · ${r.detail}${r.amount != null ? ` · ₹${r.amount}` : ''} → ${r.href}`);
process.exit(failed ? 1 : 0);
