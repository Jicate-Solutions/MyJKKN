#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * scripts/backfill-jkkn-ids.ts
 *
 * Issues a permanent JKKN ID to every current learner and team member who does
 * not already hold one, via fn_issue_jkkn_id — one person, one call, one
 * number. jkkn_identities and jkkn_identity_aliases shipped empty and dormant
 * (migrations 20260817040000 / 20260817050000); this is the run that fills the
 * register in.
 *
 * ── TWO FACTS ABOUT fn_issue_jkkn_id THAT SHAPE THIS ENTIRE SCRIPT ──────────
 *
 * 1. IT IS NOT IDEMPOTENT. Called a second time for the same person it does
 *    NOT return the number they already hold — it RAISES:
 *      'This person already holds JKKN ID %...'  ERRCODE 23505
 *    It is safe (it can never mint a second number for one person) but it is
 *    not re-runnable, and a bulk driver that ignores this dies on row one.
 *    RE-RUNNABILITY IS THEREFORE THIS SCRIPT'S OWN GUARD, NOT THE RPC'S:
 *      • every candidate set is pre-filtered against jkkn_identities, so an
 *        already-issued person is never passed to the RPC at all; and
 *      • each call is still isolated, and a 23505 is caught, counted as
 *        "already held" and stepped over — because between the pre-read and
 *        the call someone else may have issued that person a number.
 *    Neither half is decoration. The pre-filter is what makes a re-run cheap;
 *    the catch is what makes it correct.
 *
 * 2. THE SERVICE-ROLE KEY CANNOT CALL IT. The function opens with an explicit
 *      IF NOT (is_super_admin() OR is_admin()
 *              OR user_has_permission('users.jkkn_id.issue')) THEN RAISE 42501
 *    and all three of those resolve through auth.uid(). service_role bypasses
 *    RLS; it does not bypass an IF inside a function body, and under the
 *    service key auth.uid() is NULL, so every row would 42501. It also writes
 *    issued_by = auth.uid(), which would be NULL — an unattributable register.
 *    So --apply signs in as a real super-admin account and calls the RPC on
 *    that session. Reads use the service key (no gate is involved in a read),
 *    which is what lets --dry-run run with no issuing rights at all.
 *
 * ── THE DRY RUN IS A REAL PREVIEW ──────────────────────────────────────────
 * Dry run is the DEFAULT. It needs only NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY, writes nothing, and is not gated behind the
 * permission or the credentials it is previewing. You do not have to arm the
 * mechanism to see what it would do.
 *
 * ── THE UNRECOVERABLE RISK: ONE PERSON, TWO NUMBERS ────────────────────────
 * ux_jkkn_identities_learner and ux_jkkn_identities_team_member are separate
 * partial indexes on separate columns. Nothing in the schema notices that one
 * human appears in BOTH learners_profiles and staff, so a naive two-pass
 * backfill hands them two different permanent numbers. jkkn_identities has no
 * DELETE grant and no DELETE policy on purpose ("deleting a row would return
 * its number to the pool"), so a wrong number can only be retired, never
 * removed — it is parked forever. This script therefore resolves the overlap
 * BEFORE minting anything:
 *   • Matched on normalised EMAIL → issued ONCE as person_kind='both', with
 *     both links on the single row. Email is the cluster's canonical
 *     person bridge (profiles.email == staff.institution_email drives the ID
 *     card's own team-member lookup), so an exact match is strong evidence.
 *   • Matched on PHONE ONLY → NOT ISSUED, to either side, and reported. A
 *     learner's personal mobile matching a team member's is at least as likely
 *     to be a parent and their child as it is to be one person, and fusing
 *     those two is exactly the permanent error above. A human decides.
 *   • NAME + DATE OF BIRTH is deliberately not used for pairing at all. Twins
 *     share both. fn_check_duplicate_person refuses to auto-merge on that
 *     evidence and so does this.
 *
 * ── COHORTS ────────────────────────────────────────────────────────────────
 * The design rule is "issued at CONFIRMED admission or hire, never at
 * enquiry" — 21,976 enquiries produced 2,477 admissions, so issuing at enquiry
 * would burn nine numbers in ten.
 *
 *   --cohort=current   (default) people on the register today:
 *                      learners with lifecycle_status in (active, admitted)
 *                      team members with is_active = true
 *   --cohort=confirmed everyone ever confirmed, including those who have left:
 *                      learners additionally in (inactive, exited, graduated,
 *                      alumni, withdrawal_pending); all team members
 *
 * NEVER issued by either cohort — nobody here has been admitted:
 *   enquiry · enquiry_submitted · reserved · pending · approved · account
 *   · rejected · waitlisted
 *
 * ── WHAT THIS SCRIPT DOES NOT DO ───────────────────────────────────────────
 * It writes no aliases. Backfilling roll_number / register_number / team code
 * into jkkn_identity_aliases is a separate, larger decision (the natural
 * unique index folds case and whitespace and will reject historical
 * collisions, which need a human) and is deliberately out of scope here.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────
 *   # Preview. Writes nothing. Service key only.
 *   npm run backfill:jkkn-ids:dry
 *   npm run backfill:jkkn-ids:dry -- --cohort=confirmed
 *
 *   # Real run. Requires the super-admin credentials below.
 *   npm run backfill:jkkn-ids -- --apply
 *   npm run backfill:jkkn-ids -- --apply --limit 50      # a small first pass
 *
 * ── IDEMPOTENCY CONTRACT ───────────────────────────────────────────────────
 *   • A person who already holds a JKKN ID (retired or not) is never passed to
 *     fn_issue_jkkn_id. Holding a retired number still counts as held: the
 *     remedy for a retired identity is a human decision, not a fresh mint.
 *   • Running twice with the same cohort issues zero numbers the second time.
 *   • Interrupting a run loses nothing: every number is committed by its own
 *     RPC call and the next run simply skips those people.
 *
 * ── EVERY ALLOCATION IS LOGGED AS IT HAPPENS ───────────────────────────────
 * Numbers are drawn at RANDOM from 100000..999999, so an allocation cannot be
 * re-derived after the fact — if a run half-completes, the only record of who
 * got what is the register itself. Each success is appended to the run log
 * immediately (not buffered to the end) so the log survives a crash.
 *
 * ── EXIT CODES ─────────────────────────────────────────────────────────────
 *   0  completed (per-person failures are reported, not fatal)
 *   1  fatal: bad configuration, sign-in failure, or a read that failed
 *   2  completed with at least one person left unissued by an error
 *
 * ── ENV VARS ───────────────────────────────────────────────────────────────
 *   NEXT_PUBLIC_SUPABASE_URL          always
 *   SUPABASE_SERVICE_ROLE_KEY         always (all reads; enough on its own for
 *                                     a dry run)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     --apply only (the sign-in client)
 *   JKKN_BACKFILL_ADMIN_EMAIL         --apply only; a super-admin account. Its
 *   JKKN_BACKFILL_ADMIN_PASSWORD      uuid is what lands in issued_by.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { argv, env, exit } from 'node:process';

// ─── Cohorts ─────────────────────────────────────────────────────────────────

/** On the register today. */
const CURRENT_LEARNER_STATUSES = ['active', 'admitted'] as const;

/** Ever confirmed, including those who have since left. */
const CONFIRMED_LEARNER_STATUSES = [
  'active',
  'admitted',
  'inactive',
  'exited',
  'graduated',
  'alumni',
  'withdrawal_pending'
] as const;

/**
 * Pre-admission statuses, listed so the exclusion is visible rather than
 * implied by the absence of a name. Nobody here has been admitted.
 */
const NEVER_ISSUED_STATUSES = [
  'enquiry',
  'enquiry_submitted',
  'reserved',
  'pending',
  'approved',
  'account',
  'rejected',
  'waitlisted'
] as const;

const PAGE = 1000; // PostgREST's default ceiling; read in explicit ranges.

// ─── CLI ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  apply: boolean;
  cohort: 'current' | 'confirmed';
  batchSize: number;
  limit: number | null;
  logPath: string;
}

const USAGE = `
backfill-jkkn-ids — issue a permanent JKKN ID to every current learner and team member

  --dry-run            preview only; writes nothing (DEFAULT)
  --apply              actually issue numbers (requires super-admin credentials)
  --cohort=current     learners active|admitted, active team members (default)
  --cohort=confirmed   also those who have left; all team members
  --batch-size <n>     people per progress checkpoint (default 200)
  --limit <n>          stop after issuing n numbers (a capped first pass)
  --log <path>         run log (default out/backfill-jkkn-ids-<timestamp>.log)
  -h, --help
`;

function parseArgs(): CliArgs {
  const args = argv.slice(2);
  let apply = false;
  let cohort: CliArgs['cohort'] = 'current';
  let batchSize = 200;
  let limit: number | null = null;
  let logPath = '';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') apply = true;
    else if (a === '--dry-run') apply = false;
    else if (a.startsWith('--cohort=')) {
      const value = a.split('=')[1];
      if (value !== 'current' && value !== 'confirmed') {
        console.error(`✗ --cohort must be current or confirmed (got ${value})`);
        exit(1);
      }
      cohort = value;
    } else if (a === '--batch-size' && args[i + 1]) batchSize = Number(args[++i]);
    else if (a === '--limit' && args[i + 1]) limit = Number(args[++i]);
    else if (a === '--log' && args[i + 1]) logPath = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      exit(0);
    } else {
      console.error(`✗ unknown argument: ${a}`);
      console.log(USAGE);
      exit(1);
    }
  }

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    console.error('✗ --batch-size must be a positive number');
    exit(1);
  }
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    console.error('✗ --limit must be a positive number');
    exit(1);
  }
  if (!logPath) {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    logPath = path.resolve(process.cwd(), `out/backfill-jkkn-ids-${runId}.log`);
  }
  return { apply, cohort, batchSize, limit, logPath };
}

// ─── Normalisation, used only for overlap detection ──────────────────────────

export function normEmail(value: unknown): string | null {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === '' || !s.includes('@')) return null;
  // Synthetic placeholders are not evidence that two records are one person:
  // @nolog.jkkn.local addresses are generated from a phone number, so two
  // unrelated people can collide there by construction.
  if (s.endsWith('@nolog.jkkn.local')) return null;
  return s;
}

export function normPhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// ─── Reads (service key — no gate is involved in a read) ─────────────────────

export interface LearnerCandidate {
  id: string;
  name: string;
  status: string | null;
  emails: string[];
  phone: string | null;
}

export interface TeamMemberCandidate {
  id: string;
  name: string;
  emails: string[];
  phone: string | null;
}

/** Read every row matching a filter, in explicit pages. */
async function readAll<T>(
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(`reading ${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function readLearners(
  db: SupabaseClient,
  cohort: CliArgs['cohort']
): Promise<LearnerCandidate[]> {
  const statuses =
    cohort === 'confirmed' ? [...CONFIRMED_LEARNER_STATUSES] : [...CURRENT_LEARNER_STATUSES];
  const rows = await readAll<Record<string, unknown>>('learners_profiles', () =>
    db
      .from('learners_profiles')
      .select('id, first_name, last_name, lifecycle_status, student_email, college_email, student_mobile')
      .in('lifecycle_status', statuses)
      .order('id')
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: [r.first_name, r.last_name].map((v) => String(v ?? '').trim()).filter(Boolean).join(' '),
    status: r.lifecycle_status == null ? null : String(r.lifecycle_status),
    emails: [normEmail(r.student_email), normEmail(r.college_email)].filter(
      (e): e is string => e !== null
    ),
    phone: normPhone(r.student_mobile)
  }));
}

async function readTeamMembers(
  db: SupabaseClient,
  cohort: CliArgs['cohort']
): Promise<TeamMemberCandidate[]> {
  const rows = await readAll<Record<string, unknown>>('staff', () => {
    const q = db
      .from('staff')
      .select('id, first_name, last_name, email, institution_email, phone, is_active')
      .order('id');
    return cohort === 'confirmed' ? q : q.eq('is_active', true);
  });
  return rows.map((r) => ({
    id: String(r.id),
    name: [r.first_name, r.last_name].map((v) => String(v ?? '').trim()).filter(Boolean).join(' '),
    emails: [normEmail(r.institution_email), normEmail(r.email)].filter(
      (e): e is string => e !== null
    ),
    phone: normPhone(r.phone)
  }));
}

/**
 * Everyone who already holds a number. Retired identities are INCLUDED: a
 * retired number still means this person has been through issuance, and the
 * remedy is a human decision, not a fresh mint from a backfill.
 */
async function readAlreadyIssued(
  db: SupabaseClient
): Promise<{ learners: Set<string>; teamMembers: Set<string>; profiles: Set<string> }> {
  const rows = await readAll<Record<string, unknown>>('jkkn_identities', () =>
    db.from('jkkn_identities').select('learner_profile_id, team_member_id, profile_id').order('id')
  );
  const learners = new Set<string>();
  const teamMembers = new Set<string>();
  const profiles = new Set<string>();
  for (const r of rows) {
    if (r.learner_profile_id) learners.add(String(r.learner_profile_id));
    if (r.team_member_id) teamMembers.add(String(r.team_member_id));
    if (r.profile_id) profiles.add(String(r.profile_id));
  }
  return { learners, teamMembers, profiles };
}

// ─── Associates (2026-08-27) ─────────────────────────────────────────────────
// Profile-only internal users: they hold a custom role in user_roles but are
// neither learner-linked (profiles.learner_id) nor matched by email to ANY
// staff row (active or not — the staff lane owns those, issuing at
// activation). Mirrors the tg_jkkn_auto_issue_associate trigger's rule.

export interface AssociateCandidate {
  /** profiles.id */
  id: string;
  name: string;
  email: string | null;
}

async function readAssociates(db: SupabaseClient): Promise<AssociateCandidate[]> {
  const roleRows = await readAll<Record<string, unknown>>('user_roles', () =>
    db.from('user_roles').select('user_id').order('user_id')
  );
  const userIds = [...new Set(roleRows.map((r) => String(r.user_id)).filter(Boolean))];

  // Every staff email, ACTIVE OR NOT — same as the trigger's exclusion.
  const staffRows = await readAll<Record<string, unknown>>('staff (emails)', () =>
    db.from('staff').select('email, institution_email').order('id')
  );
  const staffEmails = new Set<string>();
  for (const r of staffRows) {
    for (const e of [r.email, r.institution_email]) {
      const s = String(e ?? '').trim().toLowerCase();
      if (s !== '') staffEmails.add(s);
    }
  }

  const out: AssociateCandidate[] = [];
  const CHUNK = 200;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const { data, error } = await db
      .from('profiles')
      .select('id, full_name, email, learner_id')
      .in('id', userIds.slice(i, i + CHUNK));
    if (error) throw new Error(`reading profiles for associates: ${error.message}`);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      if (r.learner_id) continue;
      const email = String(r.email ?? '').trim().toLowerCase();
      if (email !== '' && staffEmails.has(email)) continue;
      out.push({
        id: String(r.id),
        name: String(r.full_name ?? '').trim() || String(r.email ?? '').trim() || String(r.id),
        email: email || null
      });
    }
  }
  return out;
}

// ─── Overlap resolution ──────────────────────────────────────────────────────

export interface Plan {
  both: { learner: LearnerCandidate; teamMember: TeamMemberCandidate; via: 'email' }[];
  learnerOnly: LearnerCandidate[];
  teamMemberOnly: TeamMemberCandidate[];
  /** Phone-only overlaps: nobody on either side is issued. A human decides. */
  needsHuman: { learner: LearnerCandidate; teamMember: TeamMemberCandidate; via: 'phone' }[];
}

export function buildPlan(
  learners: LearnerCandidate[],
  teamMembers: TeamMemberCandidate[]
): Plan {
  // Index team members by each piece of evidence. A value claimed by two
  // different team members is ambiguous and is dropped from the index rather
  // than resolved arbitrarily — an arbitrary choice here mints a permanent,
  // undeletable wrong number.
  const byEmail = new Map<string, TeamMemberCandidate | null>();
  const byPhone = new Map<string, TeamMemberCandidate | null>();
  const claim = (
    map: Map<string, TeamMemberCandidate | null>,
    key: string,
    tm: TeamMemberCandidate
  ) => {
    if (map.has(key) && map.get(key)?.id !== tm.id) map.set(key, null);
    else if (!map.has(key)) map.set(key, tm);
  };
  // Re-normalise here rather than trusting the readers to have done it.
  // normEmail/normPhone are idempotent, so this costs nothing — and matching
  // is the step whose mistakes cannot be undone, so it should not depend on an
  // invariant held somewhere else in the file.
  const emailKeys = (c: { emails: string[] }) =>
    c.emails.map(normEmail).filter((e): e is string => e !== null);
  const phoneKey = (c: { phone: string | null }) => normPhone(c.phone);

  for (const tm of teamMembers) {
    for (const e of emailKeys(tm)) claim(byEmail, e, tm);
    const phone = phoneKey(tm);
    if (phone) claim(byPhone, phone, tm);
  }

  const plan: Plan = { both: [], learnerOnly: [], teamMemberOnly: [], needsHuman: [] };
  const pairedTeamMembers = new Set<string>();
  const withheldTeamMembers = new Set<string>();

  for (const learner of learners) {
    let match: TeamMemberCandidate | null = null;
    for (const e of emailKeys(learner)) {
      const hit = byEmail.get(e);
      if (hit) {
        match = hit;
        break;
      }
    }
    if (match) {
      plan.both.push({ learner, teamMember: match, via: 'email' });
      pairedTeamMembers.add(match.id);
      continue;
    }

    const learnerPhone = phoneKey(learner);
    const phoneHit = learnerPhone ? byPhone.get(learnerPhone) : undefined;
    if (phoneHit) {
      // A shared personal mobile is as consistent with a parent and their
      // child as with one person. Withhold both sides.
      plan.needsHuman.push({ learner, teamMember: phoneHit, via: 'phone' });
      withheldTeamMembers.add(phoneHit.id);
      continue;
    }

    plan.learnerOnly.push(learner);
  }

  for (const tm of teamMembers) {
    if (pairedTeamMembers.has(tm.id) || withheldTeamMembers.has(tm.id)) continue;
    plan.teamMemberOnly.push(tm);
  }
  return plan;
}

// ─── Issuing ─────────────────────────────────────────────────────────────────

type Job =
  | { kind: 'both'; label: string; learnerId: string; teamMemberId: string }
  | { kind: 'learner'; label: string; learnerId: string }
  | { kind: 'team_member'; label: string; teamMemberId: string }
  | { kind: 'associate'; label: string; profileId: string };

interface Totals {
  issued: number;
  alreadyHeld: number;
  failed: number;
}

async function issueOne(
  session: SupabaseClient,
  job: Job
): Promise<{ status: 'issued'; jkknId: string } | { status: 'already' } | { status: 'failed'; message: string }> {
  const { data, error } = await session.rpc('fn_issue_jkkn_id', {
    p_person_kind: job.kind,
    p_learner_profile_id: 'learnerId' in job ? job.learnerId : null,
    p_team_member_id: 'teamMemberId' in job ? job.teamMemberId : null,
    p_profile_id: 'profileId' in job ? job.profileId : null
  });

  if (error) {
    // 23505 = "this person already holds JKKN ID ...". Not a failure: it means
    // someone else issued them between our pre-read and this call. Stepping
    // over it is what keeps a re-run correct rather than merely cheap.
    if (error.code === '23505' || /already holds JKKN ID/i.test(error.message ?? '')) {
      return { status: 'already' };
    }
    return { status: 'failed', message: `${error.code ?? '?'}: ${error.message}` };
  }
  const jkknId = (data as { jkkn_id?: string } | null)?.jkkn_id;
  if (!jkknId) return { status: 'failed', message: 'RPC returned no jkkn_id' };
  return { status: 'issued', jkknId };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log(`\nJKKN ID backfill — ${args.apply ? 'APPLY (writes)' : 'DRY RUN (writes nothing)'}`);
  console.log(`cohort: ${args.cohort}`);
  console.log(`never issued to: ${NEVER_ISSUED_STATUSES.join(', ')}\n`);

  let learners: LearnerCandidate[];
  let teamMembers: TeamMemberCandidate[];
  let associates: AssociateCandidate[];
  let issued: { learners: Set<string>; teamMembers: Set<string>; profiles: Set<string> };
  try {
    [learners, teamMembers, associates, issued] = await Promise.all([
      readLearners(db, args.cohort),
      readTeamMembers(db, args.cohort),
      readAssociates(db),
      readAlreadyIssued(db)
    ]);
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    exit(1);
    return;
  }

  const totalLearners = learners.length;
  const totalTeamMembers = teamMembers.length;
  const totalAssociates = associates.length;

  // Pre-filter: an already-issued person is never handed to the RPC. This is
  // the guard that makes the whole script re-runnable — fn_issue_jkkn_id
  // itself would raise on every one of them.
  const pendingLearners = learners.filter((l) => !issued.learners.has(l.id));
  const pendingTeamMembers = teamMembers.filter((t) => !issued.teamMembers.has(t.id));
  const pendingAssociates = associates.filter((a) => !issued.profiles.has(a.id));

  const plan = buildPlan(pendingLearners, pendingTeamMembers);

  console.log('── Cohort ──────────────────────────────────────────────');
  console.log(`learners in cohort            ${totalLearners}`);
  console.log(`team members in cohort        ${totalTeamMembers}`);
  console.log(`associates (role, no record)  ${totalAssociates}`);
  console.log(`already hold a number         ${totalLearners - pendingLearners.length} learners, ` +
    `${totalTeamMembers - pendingTeamMembers.length} team members, ` +
    `${totalAssociates - pendingAssociates.length} associates`);
  console.log('\n── Would issue ─────────────────────────────────────────');
  console.log(`one number as 'both'          ${plan.both.length}   (learner + team member, same person)`);
  console.log(`learner only                  ${plan.learnerOnly.length}`);
  console.log(`team member only              ${plan.teamMemberOnly.length}`);
  console.log(`associate                     ${pendingAssociates.length}   (custom-role user, no learner/staff record)`);
  console.log(`TOTAL NUMBERS                 ${plan.both.length + plan.learnerOnly.length + plan.teamMemberOnly.length + pendingAssociates.length}`);
  console.log('\n── Withheld, needs a human ─────────────────────────────');
  console.log(`phone-only overlaps           ${plan.needsHuman.length}   (${plan.needsHuman.length * 2} people not issued)`);

  if (plan.needsHuman.length > 0) {
    console.log('\n  A learner and a team member share a personal mobile. That is as');
    console.log('  consistent with a parent and their child as with one person, and');
    console.log('  guessing wrong mints a permanent number that can never be deleted.');
    for (const pair of plan.needsHuman.slice(0, 25)) {
      console.log(`    ${pair.learner.phone}  learner ${pair.learner.name} (${pair.learner.id})`);
      console.log(`    ${' '.repeat(String(pair.learner.phone).length)}  team member ${pair.teamMember.name} (${pair.teamMember.id})`);
    }
    if (plan.needsHuman.length > 25) console.log(`    … and ${plan.needsHuman.length - 25} more (full list in the run log)`);
  }

  if (plan.both.length > 0) {
    console.log('\n── Sample of the "both" cohort (matched on email) ──────');
    for (const pair of plan.both.slice(0, 10)) {
      console.log(`    ${pair.learner.name} — learner ${pair.learner.id} + team member ${pair.teamMember.id}`);
    }
    if (plan.both.length > 10) console.log(`    … and ${plan.both.length - 10} more`);
  }

  const jobs: Job[] = [
    ...plan.both.map(
      (p): Job => ({
        kind: 'both',
        label: `both      ${p.learner.name}`,
        learnerId: p.learner.id,
        teamMemberId: p.teamMember.id
      })
    ),
    ...plan.teamMemberOnly.map(
      (t): Job => ({ kind: 'team_member', label: `team      ${t.name}`, teamMemberId: t.id })
    ),
    ...plan.learnerOnly.map(
      (l): Job => ({ kind: 'learner', label: `learner   ${l.name}`, learnerId: l.id })
    ),
    ...pendingAssociates.map(
      (a): Job => ({ kind: 'associate', label: `associate ${a.name}`, profileId: a.id })
    )
  ];
  const selected = args.limit === null ? jobs : jobs.slice(0, args.limit);

  if (!args.apply) {
    console.log(`\nDRY RUN — nothing was written. ${selected.length} number(s) would be issued.`);
    console.log('Re-run with --apply (and the super-admin credentials) to issue them.\n');
    return;
  }

  // ── Apply path: a real super-admin session, because service_role 42501s ────
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = env.JKKN_BACKFILL_ADMIN_EMAIL;
  const adminPassword = env.JKKN_BACKFILL_ADMIN_PASSWORD;
  if (!anonKey || !adminEmail || !adminPassword) {
    console.error(
      '\n✗ --apply needs NEXT_PUBLIC_SUPABASE_ANON_KEY, JKKN_BACKFILL_ADMIN_EMAIL and\n' +
        '  JKKN_BACKFILL_ADMIN_PASSWORD. fn_issue_jkkn_id checks is_super_admin() /\n' +
        '  is_admin() / user_has_permission(), all of which resolve through auth.uid();\n' +
        '  the service-role key leaves that NULL and every call would fail 42501.'
    );
    exit(1);
    return;
  }

  const session = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await session.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword
  });
  if (signInError || !signIn?.user) {
    console.error(`\n✗ sign-in failed for ${adminEmail}: ${signInError?.message ?? 'no session'}`);
    exit(1);
    return;
  }
  console.log(`\nsigned in as ${adminEmail} — issued_by will be ${signIn.user.id}`);

  fs.mkdirSync(path.dirname(args.logPath), { recursive: true });
  const log = fs.createWriteStream(args.logPath, { flags: 'a' });
  const write = (line: string) => log.write(`${line}\n`);
  write(`# backfill-jkkn-ids ${new Date().toISOString()} cohort=${args.cohort} issued_by=${signIn.user.id}`);
  for (const pair of plan.needsHuman) {
    write(`WITHHELD phone-overlap learner=${pair.learner.id} team_member=${pair.teamMember.id} phone=${pair.learner.phone}`);
  }

  const totals: Totals = { issued: 0, alreadyHeld: 0, failed: 0 };
  console.log(`\nissuing ${selected.length} number(s)…\n`);

  for (let i = 0; i < selected.length; i++) {
    const job = selected[i];
    const result = await issueOne(session, job);

    if (result.status === 'issued') {
      totals.issued++;
      // Written immediately, never buffered: numbers are drawn at random, so a
      // crash mid-run would otherwise leave no record of who got what.
      write(
        `ISSUED ${result.jkknId} kind=${job.kind} ` +
          `learner=${'learnerId' in job ? job.learnerId : '-'} ` +
          `team_member=${'teamMemberId' in job ? job.teamMemberId : '-'} ` +
          `profile=${'profileId' in job ? job.profileId : '-'}`
      );
    } else if (result.status === 'already') {
      totals.alreadyHeld++;
      write(`ALREADY kind=${job.kind} ${job.label}`);
    } else {
      totals.failed++;
      write(`FAILED kind=${job.kind} ${job.label} — ${result.message}`);
      console.error(`  ✗ ${job.label} — ${result.message}`);
    }

    if ((i + 1) % args.batchSize === 0 || i === selected.length - 1) {
      console.log(
        `  ${i + 1}/${selected.length} — issued ${totals.issued}, already held ${totals.alreadyHeld}, failed ${totals.failed}`
      );
    }
  }

  write(`# done issued=${totals.issued} already=${totals.alreadyHeld} failed=${totals.failed}`);
  log.end();

  console.log('\n── Done ───────────────────────────────────────────────');
  console.log(`issued            ${totals.issued}`);
  console.log(`already held      ${totals.alreadyHeld}`);
  console.log(`failed            ${totals.failed}`);
  console.log(`withheld (human)  ${plan.needsHuman.length * 2} people in ${plan.needsHuman.length} overlap(s)`);
  console.log(`log               ${args.logPath}\n`);

  if (totals.failed > 0) exit(2);
}

// Only run when invoked directly. The pure planning functions above are
// imported by __tests__/scripts/backfill-jkkn-ids.test.ts, and importing this
// module must not start a backfill.
const invokedDirectly =
  argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error('✗ fatal:', err);
    exit(1);
  });
}
