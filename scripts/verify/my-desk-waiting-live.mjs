#!/usr/bin/env node
/**
 * scripts/verify/my-desk-waiting-live.mjs — READ-ONLY.
 *
 * Proves fn_my_desk_waiting() against production for ONE user by reproducing
 * every queue rule in JavaScript from the SOURCE TABLES (never from the
 * function) and comparing the two answers per source.
 *
 * WHAT THIS IS AND IS NOT AN ORACLE FOR
 *   recruitment / refund / meeting_trigger / grievance — the JS below reads the
 *   same tables the module pages read and applies the page's own filter, so a
 *   mismatch means the function diverged from the page.
 *   leave — the JS is a TRANSCRIPTION of fn_leave_step_admits (migration
 *   20260831140000) minus its super-admin clause, i.e. the same rule the
 *   function encodes, re-typed in another language. It catches SQL mistakes
 *   (a wrong array, a missed branch, a per-row helper evaluated against the
 *   wrong caller) but it CANNOT catch the rule itself being wrong, because it
 *   was written from the rule. The independent proof of the leave rule is the
 *   PostgreSQL fixture in PR #3253's body, which runs the REAL
 *   fn_leave_step_admits side by side with the function.
 *
 * Two halves:
 *   expected-from-source  — always runs. Reads the source tables with the
 *                           service key and applies the rules the migration
 *                           documents (20261018030000, which supersedes
 *                           20261018020000 by adding the 'offer' source).
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
async function count(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact', Range: '0-0' } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return Number((r.headers.get('content-range') || '/0').split('/')[1]);
}
/** Postgres jsonb `?` : array contains the string, object has the key, string equals. */
const jsonbHas = (v, key) => Array.isArray(v) ? v.includes(key) : v && typeof v === 'object' ? key in v : v === key;
// Same guard as the function: a NEGATIVE index wraps to the array's end in
// PostgreSQL, so it is treated as "no current step", never as the last one.
const stepOf = (chain, i) => (Array.isArray(chain) && chain.length > 0 && Number.isInteger(i) && i >= 0 ? chain[i] ?? null : null);
const dayAge = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

// --- who is this user ------------------------------------------------------
const [profile] = await rest(`profiles?id=eq.${USER}&select=id,role,is_super_admin,institution_id,full_name`);
if (!profile) { out(`no profile for ${USER}`); process.exit(2); }
const roleRows = await rest(`user_roles?user_id=eq.${USER}&select=role_id,custom_roles(id,role_key,role_name,institution_scope,is_active,permissions)`);
const roles = roleRows.map((r) => r.custom_roles).filter(Boolean);
const legacyRole = profile.role ? (await rest(`custom_roles?role_key=eq.${encodeURIComponent(profile.role)}&select=institution_scope,permissions`))[0] : null;
const uia = (await rest(`user_institution_access?user_id=eq.${USER}&is_active=eq.true&select=institution_id`)).map((r) => r.institution_id);
const myStaff = await rest(`staff?profile_id=eq.${USER}&is_active=eq.true&select=id,institution_id`);
const orgs = await rest('hr_organizations?select=id,institution_id');
const institutions = await rest('institutions?select=id,counselling_code');

const isSuper = profile.is_super_admin === true;
const isAdmin = isSuper || ['admin', 'super_admin', 'administrator'].includes(profile.role);
// user_has_permission(<key>), reproduced (super bypass, multi-role OR, legacy
// profiles.role fallback; the director-handover tail is not modelled).
const permTrue = (p, key) => !!p && p[key] === true;
const hasPerm = (key) =>
  isSuper || roles.some((r) => permTrue(r.permissions, key)) || permTrue(legacyRole?.permissions, key);
const hasLeavePerm = hasPerm('hr.leave.approve');
// The 'offer' branch's gate (migration 20261018030000): the recruitment
// module's own management key, plus the key every page in the module needs to
// open at all. Both, because a desk row is a link into one of those pages.
const hasRecruitEdit = hasPerm('hr.recruitment.edit');
const hasRecruitView = hasPerm('hr.recruitment.view');
// role_has_institution_access(), reproduced — the WIDE rule.
const scopeAll = isSuper || roles.some((r) => r.institution_scope === 'all') || legacyRole?.institution_scope === 'all';
const hasInst = (inst) => inst == null || scopeAll || inst === profile.institution_id || uia.includes(inst);
// fn_my_hr_organization_ids(), reproduced.
const staffInst = new Set(myStaff.map((s) => s.institution_id));
const myOrgIds = new Set(orgs.filter((o) => hasInst(o.institution_id) || staffInst.has(o.institution_id)).map((o) => o.id));
// fn_my_designated_hr_org_ids() (20260831140000), reproduced: own staff
// institution, CAS sibling (same counselling_code), explicit uia grant.
const codeOf = new Map(institutions.map((i) => [i.id, i.counselling_code]));
const myCodes = new Set([...staffInst].map((id) => codeOf.get(id)).filter((c) => c != null));
const designatedInst = new Set([
  ...staffInst,
  ...institutions.filter((i) => i.counselling_code != null && myCodes.has(i.counselling_code)).map((i) => i.id),
  ...uia,
]);
const myDesignatedOrgIds = new Set(orgs.filter((o) => designatedInst.has(o.institution_id)).map((o) => o.id));
const myStaffIds = new Set(myStaff.map((s) => s.id));
const roleKeysLc = new Set(roles.map((r) => r.role_key.toLowerCase()));
const activeRoleKeys = new Set(roles.filter((r) => r.is_active).map((r) => r.role_key));
const roleIds = new Set(roles.map((r) => r.id));

out(`fn_my_desk_waiting — live verification (${MODE})`);
out(`user ${USER} (${profile.full_name ?? '?'}) super_admin=${isSuper} admin=${isAdmin} hr.leave.approve=${hasLeavePerm} hr.recruitment.edit=${hasRecruitEdit} hr.recruitment.view=${hasRecruitView} roles=[${roles.map((r) => r.role_key).join(',')}] hr_orgs(wide)=${myOrgIds.size} hr_orgs(designated)=${myDesignatedOrgIds.size} staff_rows=${myStaff.length}`);

// --- expected-from-source ---------------------------------------------------
const expected = {};

// 1. recruitment — fn_list_my_pending_recruitment predicate. waiting_since is
//    submitted_at (stable), never updated_at (reset by set_updated_at on any edit).
const cands = await all('hr_recruitment_candidates?status=in.(submitted,pending_approval)&select=id,name,role_title,approval_chain,current_step,submitted_at');
expected.recruitment = cands.filter((c) => {
  const s = stepOf(c.approval_chain, c.current_step);
  if (!s || typeof s !== 'object') return false;
  const pinned = s.approver_user_id ?? null;
  return pinned === USER || (pinned === null && roleKeysLc.has(String(s.approver_role ?? '').toLowerCase()));
}).map((c) => ({ id: c.id, since: c.submitted_at, label: `${c.name} — ${c.role_title}` }));

// 2. refund — fn_refund_assignee_match on the current stage.
const refunds = await all('billing_refund_requests?status=eq.pending_review&select=id,request_number,total_refund_amount,initiated_at,created_at,current_stage_index,flow_snapshot');
expected.refund = refunds.filter((r) => {
  const stages = r.flow_snapshot?.stages;
  const st = stepOf(stages, r.current_stage_index);
  if (!st) return false;
  return jsonbHas(st.assignee_users, USER) || [...roleIds].some((id) => jsonbHas(st.assignee_roles, id));
}).map((r) => ({ id: r.id, since: r.initiated_at ?? r.created_at, label: r.request_number, amount: Number(r.total_refund_amount) }));

// 3. leave — TRANSCRIPTION of fn_leave_step_admits (20260831140000) minus its
//    is_super_admin() clause. Not an independent oracle; see the header.
const leaves = await all('hr_leave_applications?status=in.(pending,escalated)&select=id,employee_id,hr_organization_id,approval_chain,current_step,created_at');
const approversOf = (step) => (Array.isArray(step?.approvers) && step.approvers.length > 0 ? step.approvers : [step]);
expected.leave = leaves.filter((a) => {
  const step = stepOf(a.approval_chain, a.current_step);
  if (step == null) return false;
  if (myStaffIds.has(a.employee_id)) return false;
  const entries = approversOf(step).filter((e) => e && typeof e === 'object');
  // PINNED: reachable from any institution.
  if (entries.some((e) => (e.approver_user_id || null) === USER)) return true;
  // ROLE: an active role_key I hold, AND the org within reach —
  //   (hr.leave.approve AND org ∈ wide set) OR org ∈ designated set.
  const holdsStepRole = entries.some((e) => e.approver_role && activeRoleKeys.has(e.approver_role));
  if (!holdsStepRole) return false;
  return (hasLeavePerm && myOrgIds.has(a.hr_organization_id)) || myDesignatedOrgIds.has(a.hr_organization_id);
}).map((a) => ({ id: a.id, since: a.created_at, label: a.id }));

// 4. meeting_trigger — /meetings/triggers gate + DECIDABLE set, decidable NOW:
//    deadline passed, or already explained, or deadline never stamped.
const nowIso = new Date().toISOString();
expected.meeting_trigger = (isSuper || isAdmin)
  ? (await all(`meeting_trigger_events?director_decision=is.null&status=in.(notified,explained,meeting_pending)&or=(explanation_deadline.is.null,explanation_deadline.lt.${nowIso},status.eq.explained)&select=id,metric_key,subject_label,explanation_deadline,created_at`))
      .map((e) => ({ id: e.id, since: e.explanation_deadline ?? e.created_at, label: `${e.metric_key} — ${e.subject_label ?? ''}` }))
  : [];

// 5. grievance — exactly director-signals.ts (unassignedGrievances): unassigned,
//    not resolved, not withdrawn. No status filter. Super admin only.
expected.grievance = isSuper
  ? (await all('grievance_tickets?assigned_to=is.null&resolved_at=is.null&withdrawn_at=is.null&select=id,ticket_number,subject,created_at'))
      .map((g) => ({ id: g.id, since: g.created_at, label: `${g.ticket_number} — ${g.subject}` }))
  : [];

// 6. offer — migration 20261018030000. status='package_fixed' (salary agreed,
//    onboarding not started), gated on hr.recruitment.edit AND .view, scoped on
//    hr_organization_id (NOT NULL here) — never institution_id, because
//    role_has_institution_access(NULL) is unconditionally true and would widen
//    the NULL-institution rows to every college instead of scoping them.
//    href mirrors the SQL CASE: the job workspace when the soft JSONB job_id is
//    uuid-shaped (that page gates "Start Onboarding" on this exact status),
//    else the candidate record.
// Case-INSENSITIVE, matching the SQL's `~*`. A lowercase-only class here would
// report MATCH against a lowercase-only class there and never surface the
// divergence a mixed-case job_id would cause.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rsdObj = (c) => (c.role_specific_details && typeof c.role_specific_details === 'object' && !Array.isArray(c.role_specific_details) ? c.role_specific_details : {});
const jobIdOf = (c) => { const j = rsdObj(c).job_id; return j != null && UUID_RE.test(String(j)) ? String(j) : null; };
const offerHref = (c) => (jobIdOf(c) ? `/hr/recruitment/approvals/${jobIdOf(c)}` : `/hr/recruitment/candidates/${c.id}`);
// Mirrors the SQL's three-way detail CASE exactly.
const offerDetail = (c) =>
  rsdObj(c).onboarding_started_at != null ? 'salary agreed — onboarding started, not finished'
  : jobIdOf(c) ? 'salary agreed — nobody has started onboarding'
  : 'salary agreed — onboarding not started, and no job is linked';
expected.offer = (hasRecruitEdit && hasRecruitView)
  ? (await all('hr_recruitment_candidates?status=eq.package_fixed&select=id,name,role_title,submitted_at,hr_organization_id,role_specific_details'))
      // Second half of isPostApproval — unreachable today (onboard-to-staff
      // writes staff_record_id and status='joined' in one update) but encoded
      // so the script is the whole gate, like the SQL.
      .filter((c) => rsdObj(c).staff_record_id == null)
      .filter((c) => myOrgIds.has(c.hr_organization_id))
      .map((c) => ({ id: c.id, since: c.submitted_at, label: `${c.name} — ${c.role_title}`, href: offerHref(c), detail: offerDetail(c) }))
  : [];

out('\n== expected-from-source (rules reproduced in JS, read from the source tables)');
const SOURCES = ['recruitment', 'refund', 'leave', 'meeting_trigger', 'grievance', 'offer'];
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

// SUPERSEDED 2026-09-03 by migration 20261018030000. Until then this script
// said "the console counts package_fixed, My Desk does not". My Desk now DOES
// — as a separate 'offer' source, never merged into 'recruitment'. The two
// still differ, but the difference is now a shape, not a blind spot:
//   recruitment  mirrors fn_list_my_pending_recruitment ('submitted',
//                'pending_approval') — chain rows with a derivable approver.
//   offer        package_fixed — chain COMPLETE, no approver derivable, so it
//                is gated on who may act in the college (hr.recruitment.edit +
//                .view + org) rather than on whose step it is.
//   console      director-signals.ts counts ('pending_approval','package_fixed')
//                in one number, which is why it can never agree with either.
const recA = await count('hr_recruitment_candidates?select=id&status=in.(submitted,pending_approval)');
const recB = await count('hr_recruitment_candidates?select=id&status=in.(pending_approval,package_fixed)');
const recFixed = await count('hr_recruitment_candidates?select=id&status=eq.package_fixed');
out(`\n== recruitment status sets (all users): My Desk 'recruitment' set (submitted,pending_approval)=${recA} · My Desk 'offer' set (package_fixed)=${recFixed} · orchestration-console set (pending_approval,package_fixed)=${recB} — the console merges the two into one count; My Desk keeps them as separate sources`);

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
// 'offer' is the only source carrying a PER-ROW href, so the shape check above
// (starts with '/') is not enough — compare each one to the JS-computed path.
const offerHrefExpected = new Map(expected.offer.map((r) => [r.id, r.href]));
const offerHrefBad = got
  .filter((r) => r.source === 'offer' && offerHrefExpected.has(r.item_id) && r.href !== offerHrefExpected.get(r.item_id))
  .map((r) => `${r.item_id} fn=${r.href} expected=${offerHrefExpected.get(r.item_id)}`);
const offerToWorkspace = got.filter((r) => r.source === 'offer' && String(r.href).startsWith('/hr/recruitment/approvals/')).length;
const offerToCandidate = got.filter((r) => r.source === 'offer' && String(r.href).startsWith('/hr/recruitment/candidates/')).length;
out(`  offer href: ${offerHrefBad.length === 0 ? 'all match' : `${offerHrefBad.length} MISMATCH`} — ${offerToWorkspace} to the job workspace (has job_id), ${offerToCandidate} to the candidate record (no job_id; that page carries no control for package_fixed — known product gap)`);
for (const b of offerHrefBad.slice(0, 5)) out(`      ${b}`);
if (offerHrefBad.length) failed = true;

// The detail sentence must not assert something the row's own data contradicts
// (a candidate whose onboarding checklist is already started, or one with no
// job linked at all). Compare the SQL's CASE to the JS one, per row.
const offerDetailExpected = new Map(expected.offer.map((r) => [r.id, r.detail]));
const offerDetailBad = got
  .filter((r) => r.source === 'offer' && offerDetailExpected.has(r.item_id) && r.detail !== offerDetailExpected.get(r.item_id))
  .map((r) => `${r.item_id} fn="${r.detail}" expected="${offerDetailExpected.get(r.item_id)}"`);
out(`  offer detail: ${offerDetailBad.length === 0 ? 'all match' : `${offerDetailBad.length} MISMATCH`}`);
for (const b of offerDetailBad.slice(0, 5)) out(`      ${b}`);
if (offerDetailBad.length) failed = true;

const badShape = got.filter((r) => !SOURCES.includes(r.source) || !r.item_id || !r.title || !String(r.href).startsWith('/') || typeof r.age_days !== 'number' || r.age_days < 0);
const sorted = got.every((r, i) => i === 0 || got[i - 1].waiting_since <= r.waiting_since);
out(`  contract: shape ${badShape.length === 0 ? 'ok' : `${badShape.length} bad rows`}, order ${sorted ? 'waiting_since ASC ok' : 'NOT sorted'}, cap ${got.length <= 500 ? 'ok' : 'EXCEEDED'}`);
if (badShape.length || !sorted) failed = true;
if (SHOW) for (const r of got.slice(0, 15)) out(`      ${r.source.padEnd(16)} ${String(r.age_days).padStart(4)}d ${r.title} · ${r.detail}${r.amount != null ? ` · ₹${r.amount}` : ''} → ${r.href}`);
process.exit(failed ? 1 : 0);
