import 'server-only';

// lib/services/orchestration/director-signals.ts
//
// The computed Director signal layer for /admin/orchestration's "Waiting on
// you" panel. Replaces hand-typed orchestration_modules rows (which rot —
// director_handovers is a well-built decision surface with a real SQL rule
// engine behind it and it still only holds 4 rows, because nobody keeps
// filing) with nine rows that compute themselves from live production data.
//
// Every signal here cleared THE THREE-GATE RULE before being added:
//   1. True right now — computed from a live query, not a note someone typed.
//   2. Resolvable ONLY by the Director — or, for the two 'organisational'
//      ones, at least a leadership-level call (see their comments below).
//   3. Carries a cost number from the SAME query — never a guessed figure.
// ~40 candidates were checked against this and rejected. See
// artifacts/directors-board-signals.html for the full survey, including the
// rejections (procurement pinned to the Joint MD, not this Director; 400
// pending leave applications that are someone else's to resolve; two empty
// "designed but never used" feature tables; a stale "4 vacant LC seats"
// memory note that a computed row could never have drifted into).
//
// WHY EVERY QUERY IS ROW-FETCH-AND-REDUCE, NOT SQL AGGREGATION:
// This computes on read — no migration, no new RPC. The obvious way to get
// count()/sum()/max() straight from Postgres would be a `SELECT ... FROM ...`
// RPC, but adding one is a migration, which this PR is explicitly forbidden
// from touching. PostgREST aggregate-in-select (`select=sum(x)`) is also not
// enabled on this project — confirmed empirically: it 404s as an attempted
// foreign-table embed ("Could not find a relationship between ... and
// 'sum'"), not as an aggregate. So every signal below fetches the filtered
// rows through the ordinary PostgREST `.select()` filters and reduces them
// in TypeScript. Row counts here are small (single digits to a few thousand)
// except billing_student_bills (~6k), which is why fetchAllRows() below
// paginates past PostgREST's 1000-row default page cap instead of assuming
// one page is everything.
//
// RLS: every table read below is queried through the CALLER's RLS-scoped
// client (@/lib/supabase/server createClient()) — the page this feeds is
// already SuperAdminOnly-gated, and every one of these tables' SELECT
// policies admits is_super_admin() (or is_admin()) directly — verified
// against production via the Management API 2026-08-26 (pg_policies for
// hr_recruitment_candidates, billing_refund_requests, grievance_tickets,
// meeting_trigger_events, platform_policies, billing_student_bills,
// referral_rate_config, consultant_commission_transactions, education_
// consultants, learners_profiles, institutions, accreditation_committees,
// hostel_rooms, hostel_beds). No signal here needs a service-role client.
//
// Fail-safe: evaluateDirectorSignals() runs all nine with Promise.allSettled
// so one broken/renamed table can never blank the whole panel — a failing
// signal just renders with an `error` and everything else still shows.

import { differenceInCalendarDays } from 'date-fns';
import type { createClient } from '@/lib/supabase/server';
import type { DirectorSignal, DirectorSignalConfidence, DirectorSignalKind } from '@/types/orchestration';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface DirectorSignalResult {
  active: boolean;
  /** Plain-English cost sentence from the same query. Null when inactive. */
  cost: string | null;
  /** Oldest number of days a named person has been waiting — only set when
   *  this evaluator already computes an age (oldest/overdue days). Never
   *  fabricated for signals that don't have one (Director ruling,
   *  2026-08-26). */
  waitDays?: number;
  detail?: Record<string, unknown>;
}

interface DirectorSignalDescriptor {
  id: string;
  label: string;
  resolveUrl: string | null;
  confidence: DirectorSignalConfidence;
  /** Sort tier for the board — see DirectorSignalKind in types/orchestration.ts.
   *  Director ruling, 2026-08-26: people waiting on a decision outrank any
   *  amount of overdue money. */
  kind: DirectorSignalKind;
  evaluate: (supabase: SupabaseServerClient) => Promise<DirectorSignalResult>;
}

// The current sitting Director's profile id (auth.users/profiles.id).
// hr_recruitment_candidates' final approval step and billing_refund_requests'
// "Refund Approval" flow stage both pin their assignee to this exact uuid,
// not to a role — verified directly against both tables' live rows
// 2026-08-26. Matches the spec brief and artifacts/directors-board-signals.html.
const DIRECTOR_PROFILE_ID = 'b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1';

const PAGE_SIZE = 1000;
// Safety cap, not a real-world limit: current worst case (billing_student_
// bills, signal 5) is ~6.1k rows = 7 pages. 20 pages (20k rows) leaves
// headroom without letting a runaway table page forever.
const MAX_PAGES = 20;

type Row = Record<string, unknown>;

/** Fetches every row matching a filtered query, paginating past PostgREST's
 * default 1000-row page cap — needed anywhere a sum/max/distinct-count has
 * to be reduced in application code because there's no SQL aggregate path
 * available here (see file header). `build` should apply every filter and
 * then call `.range(from, to)` itself. */
async function fetchAllRows<T extends Row>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Whole calendar days between now and an ISO timestamp, clamped to >= 0 —
 * this is a plain data reduction over query results, not a render-time
 * clock read, so it doesn't trip the react-hooks/purity rule the way
 * calling Date.now() inside a component body would. */
function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(iso)));
}

function formatInr(amount: number): string {
  return amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ============================================================================
// The nine signals
// ============================================================================

const recruitmentSignoff: DirectorSignalDescriptor = {
  id: 'recruitment_signoff',
  label: 'Hires awaiting your signature',
  // Spec named /hr/recruitment/candidates, which has no list route (only
  // /hr/recruitment/candidates/[id], a detail page needing an id). The
  // actual "awaiting my action" queue this signal describes is
  // /hr/recruitment/approvals (job-first ATS view, default view = awaiting
  // your action) — confirmed against app/(routes)/hr/recruitment/approvals.
  resolveUrl: '/hr/recruitment/approvals',
  confidence: 'enforced',
  kind: 'people',
  async evaluate(supabase) {
    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .select('submitted_at, current_step, approval_chain')
      .in('status', ['pending_approval', 'package_fixed']);
    if (error) throw new Error(error.message);

    const pinned = (data ?? []).filter((row: Row) => {
      const chain = row.approval_chain;
      const step = row.current_step;
      if (!Array.isArray(chain) || typeof step !== 'number') return false;
      const current = chain[step] as { approver_user_id?: string | null } | undefined;
      return current?.approver_user_id === DIRECTOR_PROFILE_ID;
    });

    if (pinned.length === 0) return { active: false, cost: null };

    const ages = pinned.map((row: Row) => daysSince(row.submitted_at as string));
    const oldestDays = Math.max(...ages);
    const candidateDays = ages.reduce((sum, d) => sum + d, 0);

    return {
      active: true,
      cost: `${pinned.length} hire${pinned.length === 1 ? '' : 's'} · ${candidateDays} candidate-days · oldest ${oldestDays} days`,
      waitDays: oldestDays,
      detail: { n: pinned.length, oldestDays, candidateDays },
    };
  },
};

const refundApproval: DirectorSignalDescriptor = {
  id: 'refund_approval',
  label: 'Refund requests assigned to you',
  resolveUrl: '/billing/refunds',
  confidence: 'enforced',
  kind: 'people',
  async evaluate(supabase) {
    const { data, error } = await supabase
      .from('billing_refund_requests')
      .select('total_refund_amount, initiated_at')
      .eq('status', 'pending_review');
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length === 0) return { active: false, cost: null };

    const amount = rows.reduce((sum: number, r: Row) => sum + Number(r.total_refund_amount ?? 0), 0);
    const oldestDays = Math.max(...rows.map((r: Row) => daysSince(r.initiated_at as string)));

    return {
      active: true,
      cost: `₹${formatInr(amount)} · ${rows.length} learner${rows.length === 1 ? '' : 's'} · oldest ${oldestDays} days`,
      waitDays: oldestDays,
      detail: { n: rows.length, amount, oldestDays },
    };
  },
};

const unassignedGrievances: DirectorSignalDescriptor = {
  id: 'unassigned_grievances',
  label: 'Grievances with nobody assigned, past SLA',
  // Confirmed grievance console: /learners-council/issues reads and assigns
  // grievance_tickets rows directly (issues-kanban-client.tsx has an
  // "Assign" flow keyed on assigned_to). This is the real resolve target —
  // the spec brief flagged this route as unconfirmed; it's now confirmed.
  resolveUrl: '/learners-council/issues',
  confidence: 'enforced',
  kind: 'people',
  async evaluate(supabase) {
    const { data, error } = await supabase
      .from('grievance_tickets')
      .select('sla_deadline')
      .is('resolved_at', null)
      .is('withdrawn_at', null)
      .is('assigned_to', null);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length === 0) return { active: false, cost: null };

    const overdueDays = Math.max(...rows.map((r: Row) => daysSince(r.sla_deadline as string)));

    return {
      active: true,
      cost: `${rows.length} people · ${overdueDays} days past SLA`,
      waitDays: overdueDays,
      detail: { n: rows.length, overdueDays },
    };
  },
};

const accountabilityBacklog: DirectorSignalDescriptor = {
  id: 'accountability_backlog',
  label: 'Accountability breaches awaiting your ruling',
  resolveUrl: '/meetings/triggers',
  confidence: 'enforced',
  kind: 'people',
  async evaluate(supabase) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('meeting_trigger_events')
      .select('breach_date')
      .is('director_decision', null)
      .in('status', ['notified', 'explained', 'meeting_pending'])
      .lt('explanation_deadline', nowIso);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length === 0) return { active: false, cost: null };

    const oldestDays = Math.max(...rows.map((r: Row) => daysSince(r.breach_date as string)));

    return {
      active: true,
      cost: `${rows.length} breaches · oldest ${oldestDays} days`,
      waitDays: oldestDays,
      detail: { n: rows.length, oldestDays },
    };
  },
};

async function isPolicyEnabled(supabase: SupabaseServerClient, policyKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', policyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // A policy row that doesn't exist yet is treated as "off" (the feature's
  // default state) — same as an explicit `value: false`.
  return data?.value === true;
}

const lateChargeOff: DirectorSignalDescriptor = {
  id: 'late_charge_off',
  label: 'Late-payment deterrent is built but switched off',
  resolveUrl: '/billing/late-charges',
  confidence: 'enforced',
  // Money at risk, no named person waiting — see kind's doc comment.
  kind: 'money',
  async evaluate(supabase) {
    const enabled = await isPolicyEnabled(supabase, 'billing.late_charge.enabled');
    if (enabled) return { active: false, cost: null };

    const nowIso = new Date().toISOString();
    const rows = await fetchAllRows<{ student_id: string | null; balance_amount: number | string | null }>(
      (from, to) =>
        supabase
          .from('billing_student_bills')
          .select('student_id, balance_amount')
          .not('status', 'in', '(paid,cancelled,superseded)')
          .lt('due_date', nowIso)
          .gt('balance_amount', 0)
          .range(from, to) as unknown as PromiseLike<{
          data: { student_id: string | null; balance_amount: number | string | null }[] | null;
          error: { message: string } | null;
        }>
    );

    const overdue = rows.reduce((sum, r) => sum + Number(r.balance_amount ?? 0), 0);
    const students = new Set(rows.map((r) => r.student_id).filter((id): id is string => Boolean(id))).size;

    return {
      active: true,
      cost: `₹${formatInr(overdue)} overdue · ${students} learners`,
      detail: { bills: rows.length, overdue, students },
    };
  },
};

const referralRateUnset: DirectorSignalDescriptor = {
  id: 'referral_rate_unset',
  label: 'Consultant commission rate has never been set',
  resolveUrl: '/admission/consultants/referral-rates',
  confidence: 'enforced',
  // A config gap, not a person waiting or a rupee figure — no cost figure
  // exists here at all (never fabricated), so this is 'system', not 'money'.
  kind: 'system',
  async evaluate(supabase) {
    const { count: rateRows, error: rateError } = await supabase
      .from('referral_rate_config')
      .select('*', { count: 'exact', head: true });
    if (rateError) throw new Error(rateError.message);
    if ((rateRows ?? 0) > 0) return { active: false, cost: null };

    const { data: activeConsultants, error: consultantError } = await supabase
      .from('education_consultants')
      .select('id')
      .eq('status', 'active');
    if (consultantError) throw new Error(consultantError.message);
    const activeIds = (activeConsultants ?? []).map((c: Row) => c.id as string);

    let candidates = 0;
    if (activeIds.length > 0) {
      const { count, error: candidatesError } = await supabase
        .from('learners_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('referral_type', 'consultant')
        .not('referred_by_id', 'is', null)
        .not('program_id', 'is', null)
        .in('referred_by_id', activeIds);
      if (candidatesError) throw new Error(candidatesError.message);
      candidates = count ?? 0;
    }

    // No rupee figure, ever — a rate has never once existed, so any amount
    // would be fabricated. Hard requirement from the spec.
    return {
      active: true,
      cost: `${candidates} consultant admissions · no rate ever set`,
      detail: { candidates },
    };
  },
};

// Both accreditation signals (iqac_missing and cac_not_constituted) resolve
// to the same screen and the same underlying write path:
// accreditation_committees INSERT is granted to is_super_admin() OR
// is_admin() OR anyone holding accreditation.naac.committees.create —
// verified against pg_policies "committees_insert" 2026-08-26. Neither is
// code-enforced Director-exclusive the way the recruitment/refund pins are,
// so both carry 'organisational' confidence (the spec brief called this out
// explicitly for cac_not_constituted; iqac_missing shares the identical
// permission surface, so it gets the same honest label here rather than
// silently claiming an enforcement that isn't there).
const iqacMissing: DirectorSignalDescriptor = {
  id: 'iqac_missing',
  label: 'Accredited colleges with no IQAC of record',
  resolveUrl: '/accreditation/naac/committees',
  confidence: 'organisational',
  kind: 'system',
  async evaluate(supabase) {
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id')
      .not('iqac_code', 'is', null);
    if (instError) throw new Error(instError.message);
    const institutionIds = (institutions ?? []).map((i: Row) => i.id as string);
    if (institutionIds.length === 0) return { active: false, cost: null };

    const { data: committees, error: commError } = await supabase
      .from('accreditation_committees')
      .select('institution_id')
      .eq('committee_type', 'main')
      .eq('is_active', true)
      .in('institution_id', institutionIds);
    if (commError) throw new Error(commError.message);
    const withMain = new Set((committees ?? []).map((c: Row) => c.institution_id as string));
    const missingIds = institutionIds.filter((id) => !withMain.has(id));
    if (missingIds.length === 0) return { active: false, cost: null };

    const { count: learners, error: learnersError } = await supabase
      .from('learners_profiles')
      .select('*', { count: 'exact', head: true })
      .in('institution_id', missingIds)
      .eq('lifecycle_status', 'active');
    if (learnersError) throw new Error(learnersError.message);

    return {
      active: true,
      cost: `${missingIds.length} colleges · ${learners ?? 0} active learners`,
      detail: { n: missingIds.length, learners: learners ?? 0 },
    };
  },
};

const hostelSettleOff: DirectorSignalDescriptor = {
  id: 'hostel_settle_off',
  label: 'Hostel settle-then-bill is switched off',
  resolveUrl: '/campus-living/settings/policies-workflows',
  confidence: 'enforced',
  // A switched-off policy — the cost figure is beds/rooms, not rupees or a
  // named person waiting.
  kind: 'system',
  async evaluate(supabase) {
    const enabled = await isPolicyEnabled(supabase, 'hostel.settle_bill.enabled');
    if (enabled) return { active: false, cost: null };

    const { data: rooms, error: roomsError } = await supabase
      .from('hostel_rooms')
      .select('id, hostel_beds(status)');
    if (roomsError) throw new Error(roomsError.message);

    let partlyFilledRooms = 0;
    let emptyBeds = 0;
    for (const room of (rooms ?? []) as Array<{ hostel_beds?: Array<{ status: string | null }> }>) {
      const beds = room.hostel_beds ?? [];
      const total = beds.length;
      const occupied = beds.filter((b) => b.status === 'occupied').length;
      if (occupied > 0 && occupied < total) {
        partlyFilledRooms += 1;
        emptyBeds += total - occupied;
      }
    }

    return {
      active: true,
      cost: `${partlyFilledRooms} partly-filled rooms · ${emptyBeds} empty beds`,
      detail: { rooms: partlyFilledRooms, emptyBeds },
    };
  },
};

const cacNotConstituted: DirectorSignalDescriptor = {
  id: 'cac_not_constituted',
  label: 'Cluster council never constituted',
  resolveUrl: '/accreditation/naac/committees',
  confidence: 'organisational', // see the comment above iqacMissing
  kind: 'system',
  async evaluate(supabase) {
    const { count, error } = await supabase
      .from('accreditation_committees')
      .select('*', { count: 'exact', head: true })
      .eq('committee_type', 'cluster');
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) return { active: false, cost: null };

    return {
      active: true,
      cost: 'built and enabled, 0 committees formed',
      detail: { n: 0 },
    };
  },
};

const DIRECTOR_SIGNALS: DirectorSignalDescriptor[] = [
  recruitmentSignoff,
  refundApproval,
  unassignedGrievances,
  accountabilityBacklog,
  lateChargeOff,
  referralRateUnset,
  iqacMissing,
  hostelSettleOff,
  cacNotConstituted,
];

/**
 * Evaluates all nine Director signals in parallel against the caller's
 * RLS-scoped Supabase client. Never throws: each signal is wrapped so one
 * broken/renamed table can't blank the panel — a failing signal renders
 * with `error` set and `active: false`, and every other signal still shows.
 *
 * Every result in the returned array carries the same `evaluatedAt` —
 * captured once, here, before any query runs — so the board can state
 * exactly when it last checked (Director ruling, 2026-08-26: an empty
 * board must prove it checked, not just render nothing) without the
 * waiting-queue component ever reading the wall clock itself.
 */
export async function evaluateDirectorSignals(supabase: SupabaseServerClient): Promise<DirectorSignal[]> {
  const evaluatedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    DIRECTOR_SIGNALS.map((signal) => signal.evaluate(supabase))
  );

  return DIRECTOR_SIGNALS.map((signal, i) => {
    const outcome = settled[i];
    const base = {
      id: signal.id,
      label: signal.label,
      resolveUrl: signal.resolveUrl,
      confidence: signal.confidence,
      kind: signal.kind,
      evaluatedAt,
    };

    if (outcome.status === 'rejected') {
      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      return { ...base, active: false, cost: null, error: message };
    }

    return { ...base, active: outcome.value.active, cost: outcome.value.cost, waitDays: outcome.value.waitDays };
  });
}
