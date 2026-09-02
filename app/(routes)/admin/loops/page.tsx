// ============================================================================
// LOOP CONTROL TOWER (Super-Admin)
// ============================================================================
// Created: 2026-07-03
// One surface for every LOOP in MyJKKN — not every AI routine, but every place
// the platform runs a cycle. Tiered by how many of the four gates each closes:
//   Generate → Act → Measure(vs a baseline) → Feed the measurement forward.
// A self-improving loop closes all four (SCF, induction, mess, feeder); a
// cadence loop stops at Generate·Act (AI Pulse); an accountability loop
// Measures but a human Feeds it forward (Decisions, ARPS). Intake adapters
// close none — they're the senses feeding the loops, shown for completeness.
//
// Read-only. Every number is fetched live from production on each load. Gated
// server-side on profiles.is_super_admin BEFORE any data read — the fallback is
// explicit (never a silent redirect), per the platform's permission-UX rule.
// ============================================================================

export const dynamic = 'force-dynamic';
// The builds block streams a GitHub read (measured cold: 26 s) inside this
// page's render; Vercel's default function limit would cut it off mid-stream
// and leave the Suspense fallback on screen forever. 120 s: the reader's own
// 40 s deadline (lib/services/loops/pending-prs.ts) bounds only the GitHub
// tail, and the rest of the render (the Supabase reads above it, streamed
// under Suspense) must fit in the remainder — so a slow GitHub renders an
// explicit line instead (reconcile round, obj. 2; post-verdict note b).
export const maxDuration = 120;
export const navMeta = { label: 'Loop Control Tower', icon: 'Repeat' } as const;

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  createServiceRoleClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import { LoopControlTower } from './_components/loop-control-tower';
import { LoopTower, type LoopTowerStats } from './_components/loop-tower';
import { LoopWiring } from './_components/loop-wiring';
import { ClusterLens } from './_components/cluster-lens';
import { OwnersPanel, type OwnerPanelRow } from './_components/owners-panel';
import { ProvenGreenStrip } from './_components/proven-green-strip';
import {
  WaitingOnDirectorPanel,
  loadWaitingOnDirector,
} from './_components/waiting-on-director';
import { staleThresholdMs, isAlarmStatus } from '@/lib/ai-routines/loop-governance';
import { getRoutineById } from '@/lib/ai-routines/registry';
import type {
  LoopTier,
  LoopTone,
  LoopExample,
  LoopRegistryRow,
  LoopEdgeRow,
  LoopAuditRow,
  LoopConflictRow,
  ClusterInstitutionOption,
  ClusterPreset,
  ClusterSignal,
} from './_components/types';

async function cnt(query: unknown): Promise<number | null> {
  try {
    const r = (await (query as Promise<{ count: number | null }>)) as {
      count: number | null;
    };
    return typeof r?.count === 'number' ? r.count : null;
  } catch {
    return null;
  }
}

const n = (v: number | null) => (v === null ? '—' : String(v));

// ── SCF effectiveness: the ACTUAL work, not just counts ──────────────────────
// The raw scf_ai_suggestions row count is inflated when a single course's window
// regenerates repeatedly, so it misleads ("215 tips" while only 9 real classes
// were coached). This reads the honest picture: distinct classes coached, the
// measured-outcome split (a tip is only "measured" once its class is re-taught
// and re-rated — lift > +0.2 = "helped"), and a few DISTINCT recent examples so
// a reader can eyeball the real advice and see whose profile reflects it.
type ScfEffectiveness = {
  distinctClasses: number | null;
  rawRows: number | null;
  measured: number;
  helped: number;
  didNotMove: number;
  examples: LoopExample[];
};

function scfExcerpt(suggestion: unknown): string {
  if (!suggestion || typeof suggestion !== 'object') return '(no text)';
  const s = suggestion as Record<string, unknown>;
  // 'improvement' tips key on summary; 'success' write-ups on whatWorked.
  const raw =
    (typeof s.summary === 'string' && s.summary) ||
    (typeof s.whatWorked === 'string' && s.whatWorked) ||
    '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '(no text)';
  return trimmed.length > 150 ? `${trimmed.slice(0, 150)}…` : trimmed;
}

async function loadScfEffectiveness(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<ScfEffectiveness> {
  const empty: ScfEffectiveness = {
    distinctClasses: null,
    rawRows: null,
    measured: 0,
    helped: 0,
    didNotMove: 0,
    examples: [],
  };
  try {
    // 1) Honest counts — dedup (course, faculty) in JS; bucket the measured lift.
    const { data: rows, error } = await admin
      .from('scf_ai_suggestions')
      .select('course_code, faculty_email, outcome_lift')
      .eq('domain', 'session_feedback');
    if (error) return empty;

    const distinct = new Set<string>();
    let measured = 0;
    let helped = 0;
    let didNotMove = 0;
    for (const r of rows ?? []) {
      distinct.add(`${r.course_code}|${r.faculty_email ?? ''}`);
      if (r.outcome_lift !== null && r.outcome_lift !== undefined) {
        measured++;
        if (Number(r.outcome_lift) > 0.2) helped++;
        else didNotMove++;
      }
    }

    // 2) A few DISTINCT recent examples (most-recent per class). Pull a recent
    //    slice with the suggestion text, then dedup by class keeping the newest.
    const { data: recent } = await admin
      .from('scf_ai_suggestions')
      .select('course_code, faculty_email, kind, generated_at, suggestion')
      .eq('domain', 'session_feedback')
      .order('generated_at', { ascending: false })
      .limit(60);
    const seen = new Set<string>();
    const examples: LoopExample[] = [];
    for (const r of recent ?? []) {
      const key = `${r.course_code}|${r.faculty_email ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      examples.push({
        ref: String(r.course_code),
        who: (r.faculty_email as string | null) ?? 'course-level',
        text: scfExcerpt(r.suggestion),
        tag: r.kind === 'success' ? 'what worked' : 'coaching',
      });
      if (examples.length >= 3) break;
    }

    return {
      distinctClasses: distinct.size,
      rawRows: (rows ?? []).length,
      measured,
      helped,
      didNotMove,
      examples,
    };
  } catch {
    return empty;
  }
}

// Mean measured outcome_lift for SCF suggestions whose outcome landed in the
// window. A count query can't average, so this pulls the lift values and means
// them in JS (same swallow-to-hollow philosophy as cnt()). n=0 → mean null so
// the strip cell renders hollow, not a fake 0.00.
async function loadScfLift(
  admin: ReturnType<typeof createServiceRoleClient>,
  sinceIso: string,
): Promise<{ n: number | null; mean: number | null }> {
  try {
    const { data, error } = await admin
      .from('scf_ai_suggestions')
      .select('outcome_lift')
      .eq('domain', 'session_feedback')
      .gte('outcome_measured_at', sinceIso)
      .not('outcome_lift', 'is', null);
    if (error) return { n: null, mean: null };
    const vals = (data ?? [])
      .map((r) => Number(r.outcome_lift))
      .filter((v) => Number.isFinite(v));
    if (vals.length === 0) return { n: 0, mean: null };
    return { n: vals.length, mean: vals.reduce((a, b) => a + b, 0) / vals.length };
  } catch {
    return { n: null, mean: null };
  }
}

// ── Cluster lens (C4) — the CAC's horizontal slice ──────────────────────────
// Aggregates the tower's signals across a hand-picked set of institutions and
// compares each against the SAME aggregate one window earlier (the cluster's
// OWN baseline — clusters are never ranked against each other). Reuses the
// tower's existing tables verbatim, just institution-filtered; no new API
// surface, no new tables. Window is fixed at 14d (matches the tower's since14
// idiom); the baseline is the adjacent prior 14d.
const CLUSTER_WINDOW_DAYS = 14;

async function loadClusterSignals(
  admin: ReturnType<typeof createServiceRoleClient>,
  instIds: string[],
): Promise<ClusterSignal[]> {
  const winMs = CLUSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const curFrom = new Date(Date.now() - winMs).toISOString();
  const prevFrom = new Date(Date.now() - 2 * winMs).toISOString();

  // Each signal is the SAME tower read, twice: current [curFrom, now) and the
  // cluster's own prior window [prevFrom, curFrom). Every leg swallows to null
  // via cnt() — a failed read renders hollow, never zero.
  const [
    ratingsCur,
    ratingsPrev,
    spineCur,
    spinePrev,
    scfMeasuredCur,
    scfMeasuredPrev,
    indTipsCur,
    indTipsPrev,
    messCur,
    messPrev,
    refCur,
    refPrev,
  ] = await Promise.all([
    cnt(admin.from('session_feedback').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('created_at', curFrom)),
    cnt(admin.from('session_feedback').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('created_at', prevFrom).lt('created_at', curFrom)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('created_at', curFrom)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('created_at', prevFrom).lt('created_at', curFrom)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').in('institution_id', instIds).gte('outcome_measured_at', curFrom)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').in('institution_id', instIds).gte('outcome_measured_at', prevFrom).lt('outcome_measured_at', curFrom)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('generated_at', curFrom)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('generated_at', prevFrom).lt('generated_at', curFrom)),
    cnt(admin.from('mess_menu_recommendations').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('created_at', curFrom)),
    cnt(admin.from('mess_menu_recommendations').select('*', { count: 'exact', head: true }).in('institution_id', instIds).gte('created_at', prevFrom).lt('created_at', curFrom)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).in('institution_id', instIds).eq('source', 'referral').not('referred_by_id', 'is', null).gte('created_at', curFrom)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).in('institution_id', instIds).eq('source', 'referral').not('referred_by_id', 'is', null).gte('created_at', prevFrom).lt('created_at', curFrom)),
  ]);

  // Classes coached — deduplicated to DISTINCT (course, faculty) per window,
  // same honesty rule as loadScfEffectiveness (raw row counts inflate when one
  // course's window regenerates). One pull spanning both windows, split in JS
  // by timestamp (Date compare, not string compare — pg's "+00:00" suffix
  // breaks lexicographic ISO comparison against a "Z"-suffixed literal).
  let coachedCur: number | null = null;
  let coachedPrev: number | null = null;
  try {
    const { data, error } = await admin
      .from('scf_ai_suggestions')
      .select('course_code, faculty_email, generated_at')
      .eq('domain', 'session_feedback')
      .in('institution_id', instIds)
      .gte('generated_at', prevFrom);
    if (!error) {
      const curFromMs = new Date(curFrom).getTime();
      const cur = new Set<string>();
      const prev = new Set<string>();
      for (const r of data ?? []) {
        const key = `${r.course_code}|${r.faculty_email ?? ''}`;
        if (new Date(r.generated_at as string).getTime() >= curFromMs) cur.add(key);
        else prev.add(key);
      }
      coachedCur = cur.size;
      coachedPrev = prev.size;
    }
  } catch {
    /* hollow, not zero */
  }

  return [
    {
      key: 'ratings',
      label: 'Learner session ratings',
      plain: 'Post-class understanding ratings received across the cluster — the fuel the SCF teaching loop runs on.',
      current: ratingsCur,
      baseline: ratingsPrev,
    },
    {
      key: 'coached',
      label: 'Classes coached (distinct)',
      plain: 'Distinct (course, Senior Learner) sessions that received an AI coaching tip — deduplicated, same honesty rule as the Tower.',
      current: coachedCur,
      baseline: coachedPrev,
    },
    {
      key: 'measured',
      label: 'Coaching outcomes measured',
      plain: 'Tips whose class was re-taught and re-rated in the window — the Measure gate actually closing inside this cluster.',
      current: scfMeasuredCur,
      baseline: scfMeasuredPrev,
    },
    {
      key: 'spine',
      label: 'Feedback items into the spine',
      plain: 'Items landing in the feedback spine from every adapter (session, mess, parent, IG) for these institutions.',
      current: spineCur,
      baseline: spinePrev,
    },
    {
      key: 'induction-tips',
      label: 'Induction effectiveness tips',
      plain: 'Per-session induction improvement tips generated for the cluster’s events — seasonal, quiet outside induction windows.',
      current: indTipsCur,
      baseline: indTipsPrev,
    },
    {
      key: 'mess',
      label: 'Mess menu proposals',
      plain: 'Menu recommendations proposed for the cluster’s tiers by the campus-living loop.',
      current: messCur,
      baseline: messPrev,
    },
    {
      key: 'referrals',
      label: 'Referral leads',
      plain: 'Admission leads referred by learners into these institutions — the referral→desk loop’s intake.',
      current: refCur,
      baseline: refPrev,
    },
  ];
}

export default async function LoopControlTowerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; inst?: string }>;
}) {
  const { view: viewParam, inst: instParam } = await searchParams;
  const view =
    viewParam === 'wiring' ? 'wiring' : viewParam === 'cluster' ? 'cluster' : 'tower';

  const { profile } = await getEnhancedUserProfile();
  // Canonical super-admin definition (matches hooks/use-permissions.ts and the
  // SuperAdminOnly guard): the boolean flag OR the role. MENU_PERMISSIONS maps
  // /admin/loops → 'super_admin', which a role-based super admin satisfies, so
  // gating on the flag alone would show them the link then deny the page.
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Loop Control Tower">
        <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          This page is restricted to super administrators. It reads live loop
          health across every institution, so it is locked tight. If you believe
          you should have access, contact a platform administrator.
        </div>
      </ContentLayout>
    );
  }

  const admin = createServiceRoleClient();
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    scfResponses7d,
    indSessGen,
    indSessMeasured,
    playbookGen,
    pulseFlagsPending,
    spineTotal,
    spineClassified,
    decisionsTotal,
    decisionsPending,
    decisionsGraded,
    refLeads,
    refRouted,
    checkinsScheduled,
    pdeQuestsOpen,
    pdeDemos,
    messPolicy,
  ] = await Promise.all([
    // SCF generated/measured counts now come from loadScfEffectiveness (deduped
    // to distinct classes) — the raw row count was misleading, see below.
    // Proxy for the loop's fuel: student ratings RECEIVED into session_feedback
    // (the table fn_scf_candidate_windows reads), by created_at over the last
    // 7d. Intake, not the exact acted-on set — the loop's candidacy windows on
    // attendance_date with a >=3-response floor. NOT the feedback_events spine
    // copy (feedback-adapter-session → feedback.classify), which is the Feedback
    // Spine card.
    cnt(admin.from('session_feedback').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true })),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).not('net_effect', 'is', null)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'induction')),
    cnt(admin.from('ai_pulse_anomaly_flags').select('*', { count: 'exact', head: true }).eq('review_outcome', 'pending')),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).gte('created_at', since14)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).gte('created_at', since14).not('ai_processed_at', 'is', null)),
    cnt(admin.from('director_decisions').select('*', { count: 'exact', head: true })),
    cnt(admin.from('director_decisions').select('*', { count: 'exact', head: true }).eq('status', 'pending_outcome')),
    cnt(admin.from('director_decisions').select('*', { count: 'exact', head: true }).eq('status', 'graded')),
    // Induction referral→desk loop (#1887): student referrals from induction and
    // how many were auto-routed to the working desk (assigned_counselor_id).
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).eq('source', 'referral').not('referred_by_id', 'is', null)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).eq('source', 'referral').not('referred_by_id', 'is', null).not('assigned_counselor_id', 'is', null)),
    // Senior-peer-mentor monthly check-ins (event_sessions kind='mentor_checkin').
    cnt(admin.from('event_sessions').select('*', { count: 'exact', head: true }).eq('kind', 'mentor_checkin')),
    // PDE quest→demonstration loop.
    cnt(admin.from('pde_quests').select('*', { count: 'exact', head: true }).eq('status', 'open')),
    cnt(admin.from('pde_demonstrations').select('*', { count: 'exact', head: true })),
    admin
      .from('platform_policies')
      // Match the mess-menu-loop cron's canonical read exactly: the key is
      // multi-scope, so filter scope_type='global' or a stray non-global row
      // makes .maybeSingle() error → swallowed → the tile would falsely read
      // "Dark" even when the global master switch is ON.
      .select('value')
      .eq('policy_key', 'mess.choose.loop.master_enabled')
      .eq('scope_type', 'global')
      .maybeSingle()
      // PromiseLike has no .catch — the rejection handler is .then's 2nd arg.
      .then(
        (r) => r.data?.value ?? null,
        () => null
      ),
  ]);

  const messOn = messPolicy === true;

  // SCF effectiveness — the honest, deduplicated picture + real examples so the
  // card can show WHAT the loop actually produced and WHOSE profile it reflects.
  const scfEff = await loadScfEffectiveness(admin);

  // Waiting on the Director — pending decisions in the loop estate (prompt
  // graduations + charter drafts). Tower view only; every source swallows to
  // empty, same contract as the reads above.
  const waitingItems = view === 'tower' ? await loadWaitingOnDirector(admin) : [];

  // ── Live config, read from the SAME tables /admin/ai-routines edits, so the
  // two pages can't drift. Best-effort: any read failure falls back to each
  // card's static config string. ────────────────────────────────────────────
  const schedById = new Map<
    string,
    { enabled: boolean; days_of_week: number[] | null; minute_of_day: number; last_status: string | null; last_fired_at: string | null }
  >();
  const modelByKey = new Map<string, string>();
  try {
    const { data } = await admin
      .from('ai_routine_schedules')
      // days_of_week + last_fired_at feed the cadence-aware red-state
      // computation in wire() below — do not drop them from this select.
      .select('routine_id, enabled, days_of_week, minute_of_day, last_status, last_fired_at');
    for (const r of data ?? []) schedById.set(r.routine_id, r);
  } catch {
    /* fall back to static cfg strings */
  }
  try {
    // Match the canonical resolver getModelForFeature exactly — it only honours
    // is_active rows; an inactive row means the routine falls back to its
    // hardcoded model, so showing an inactive model_id here would be drift.
    const { data } = await admin
      .from('ai_model_config')
      .select('feature_key, model_id')
      .eq('is_active', true);
    for (const r of data ?? []) if (r.model_id) modelByKey.set(r.feature_key, r.model_id);
  } catch {
    /* fall back to static */
  }

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmtTime = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} IST`;
  const fmtSchedule = (rid: string): string | null => {
    const s = schedById.get(rid);
    if (!s) return null;
    const days = Array.isArray(s.days_of_week) ? s.days_of_week : [];
    const when =
      days.length >= 7 ? 'daily' : days.length ? days.map((d) => DOW[d] ?? '?').join('/') : 'unscheduled';
    return `${when} ${fmtTime(s.minute_of_day)}${s.enabled ? '' : ' · paused'}`;
  };

  // ── IQAC meeting loop + institutional audit loop (accountability tier) ─────
  // Meetings/resolutions tables arrive with migration 20260710060000 — until it
  // applies, cnt() swallows the missing-relation error and the card shows '—'.
  const iqacCommittees = await cnt(
    admin
      .from('accreditation_committees')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
  );
  const iqacMeetingsMinuted = await cnt(
    admin
      .from('accreditation_committee_meetings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'minuted'),
  );
  const iqacResolutionsOpen = await cnt(
    admin
      .from('accreditation_committee_resolutions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
  );
  const iqacResolutionsEscalate = await cnt(
    admin
      .from('accreditation_committee_resolutions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('carried_count', 2),
  );
  const auditCyclesTotal = await cnt(
    admin.from('audit_cycles').select('id', { count: 'exact', head: true }),
  );
  const auditCyclesClosed = await cnt(
    admin
      .from('audit_cycles')
      .select('id', { count: 'exact', head: true })
      .not('closed_at', 'is', null),
  );

  // Compose a card's config line + last-run + configure-link from live tables,
  // falling back to the static string when the loop has no dispatcher routine
  // (direct-cron or on-demand loops: induction-session, feeder, decisions, arps).
  const AI_ROUTINES = '/admin/ai-routines';
  const wire = (
    routineId: string | null,
    featureKey: string | null,
    staticCfg: string,
  ): { cfg: string; lastRun?: string; lastRunBad?: boolean; configHref?: string } => {
    // "Live" ONLY when the loop has a dispatcher SCHEDULE row — that's what makes
    // it editable on AI Routines and gives it a real last_status. A model row
    // alone (direct-cron loops like induction-session) is NOT enough: keep the
    // accurate static string rather than falsely claim "editable on AI Routines".
    const live = routineId ? schedById.has(routineId) : false;
    if (!live) return { cfg: staticCfg };
    const model = featureKey ? modelByKey.get(featureKey) ?? null : null;
    const parts = [fmtSchedule(routineId!), model].filter(Boolean) as string[];
    const sched = schedById.get(routineId!);
    // Red-state computation (watchdog wire, 2026-07-11): errored last run OR
    // silent past the routine's OWN cadence — derived from days_of_week via
    // the same staleThresholdMs the watchdog cron uses, so a healthy weekly
    // routine never shows red on its six quiet days (review 2026-07-11 #2).
    // Never-fired rows aren't flagged here: without a seed date the page
    // can't distinguish "new" from "dead"; the watchdog cron handles those
    // via updated_at.
    const lastRunBad = Boolean(
      (sched &&
        isAlarmStatus(sched.last_status, Boolean(getRoutineById(routineId!)))) ||
        (sched?.last_fired_at &&
          Date.now() - new Date(sched.last_fired_at).getTime() > staleThresholdMs(sched.days_of_week))
    );
    return {
      cfg: `${parts.join(' · ')} · editable on AI Routines`,
      lastRun: sched?.last_status ?? undefined,
      lastRunBad,
      configHref: AI_ROUTINES,
    };
  };

  const tiers: LoopTier[] = [
    {
      title: 'Self-improving loops',
      gateLabel: 'G · A · M · F',
      blurb:
        'All four gates closed: they measure their own effect against a baseline and that measurement changes the next suggestion — automatically. These are the moats.',
      loops: [
        {
          id: 'scf',
          name: 'Session-Feedback Teaching Loop',
          subid: 'scf',
          plain:
            'Students rate how well they understood each class → AI coaches the teacher → measures whether the next class’s score rose, and feeds that track record into the next tip.',
          ...wire(
            'scf-generate-suggestions',
            'scf.generate_suggestions',
            'daily 11:15 IST · claude-sonnet-4-6 · schedule editable, thresholds in code',
          ),
          status: scfEff.measured > 0 ? 'Live · measuring' : 'Live · awaiting outcomes',
          tone: 'live',
          gates: ['on', 'on', 'on', 'on'],
          metrics: [
            { v: n(scfEff.distinctClasses), k: 'classes coached', tone: 'good' },
            scfEff.measured > 0
              ? {
                  v: `${scfEff.helped}↑ / ${scfEff.didNotMove}→`,
                  k: 'helped / didn’t move',
                  tone: scfEff.helped > 0 ? 'good' : 'warn',
                }
              : { v: '0', k: 'measured — awaiting re-teach', tone: 'mute' },
            {
              v: n(scfResponses7d),
              k: 'ratings received (7d)',
              tone:
                scfResponses7d == null
                  ? 'mute'
                  : scfResponses7d === 0
                    ? 'warn'
                    : 'good',
            },
          ],
          examples: scfEff.examples,
          verifyHref: '/academic/session-feedback/admin',
          verifyLabel: 'Verify on the Session Feedback admin view →',
          noteTag: 'Now',
          note:
            `Coaching ${scfEff.distinctClasses ?? '—'} distinct classes` +
            (scfEff.rawRows != null &&
            scfEff.distinctClasses != null &&
            scfEff.rawRows > scfEff.distinctClasses * 3
              ? ` (the raw ${scfEff.rawRows}-tip figure is inflated — one course regenerated many times, so distinct classes is the honest count).`
              : '.') +
            (scfEff.measured > 0
              ? ` Of those, ${scfEff.measured} have been re-taught and re-rated: ${scfEff.helped} improved, ${scfEff.didNotMove} did not move.`
              : ` No outcomes measured yet — expected, not broken: a tip’s effect can only be scored once that class is taught again and re-rated, and none of the coached classes has had a later session yet.`) +
            ` The examples below are the loop’s actual recent output; open a coached teacher’s Session Feedback to verify.`,
        },
        {
          id: 'induction-session',
          name: 'Induction Session-Effectiveness Loop',
          subid: 'induction · per-session',
          plain:
            'A weak induction topic in batch A gets an AI tip for batch B → measures batch B’s rating against a regression-to-the-mean baseline, so only a real lift counts.',
          ...wire(
            null,
            'induction.session_effectiveness',
            'every 4h + Max lane · claude-sonnet-4-6 · direct cron, not in the editable table',
          ),
          status: 'Live · maturing',
          tone: 'early',
          gates: ['on', 'on', 'on', 'on'],
          metrics: [
            { v: n(indSessGen), k: 'tips generated', tone: 'good' },
            { v: n(indSessMeasured), k: 'measured (pending)', tone: 'mute' },
            { v: '~Jul 6', k: 're-run matures', tone: 'mute' },
          ],
          noteTag: 'Now',
          note: 'A weak topic is tipped, then the batch-B re-run measures the real lift. Induction 2026 closes Jul 8, so this is its live window for the year.',
        },
        {
          id: 'induction-playbook',
          name: 'Induction Playbook Loop',
          subid: 'induction · annual',
          plain:
            'Each year’s cohort gets an AI playbook for next year, grounded in last cohort’s measured referral/value outcome. The slowest loop — one turn per admission year.',
          ...wire(
            'induction-generate-playbook',
            'induction.generate_playbook',
            'Mondays 10:00 IST · claude-sonnet-4-6 · schedule editable',
          ),
          status: 'Scheduled · no cycle yet',
          tone: 'sched',
          gates: ['on', 'on', 'on', 'on'],
          metrics: [
            { v: n(playbookGen), k: 'playbooks (annual)', tone: 'mute' },
            { v: 'runs clean', k: 'when due', tone: 'good' },
          ],
          noteTag: 'Now',
          note: 'Structurally complete but no cohort has matured yet — expected for a once-a-year loop.',
        },
        {
          id: 'mess',
          name: 'Mess “Choose Your Menu” Loop',
          subid: 'campus-living',
          plain:
            'Students vote on menu options → the loop proposes the next cycle’s menu from what scored well, measured against a rolling baseline. The most configurable loop — every dial is a settings row.',
          ...wire(
            'mess-menu-loop',
            null,
            'Mondays 08:00 IST · schedule editable · 8 dials editable in policy admin',
          ),
          status: messOn ? 'Live · running' : 'Dark · gated off',
          tone: messOn ? 'live' : 'dark',
          gates: ['on', 'on', 'on', 'on'],
          metrics: [
            {
              v: messOn ? 'ON' : 'OFF',
              k: 'loop.master_enabled',
              tone: messOn ? 'good' : 'warn',
            },
            { v: '4wk / k=3', k: 'baseline / min ratings', tone: 'mute' },
            { v: '3 tiers', k: 'wired', tone: 'mute' },
          ],
          noteTag: 'Now',
          note: messOn
            ? 'Loop live — proposing menus from measured votes.'
            : 'Fully built, master switch off. Waiting on the pilot go: which tier (girls side — boys menus empty) & who owns weekly review.',
        },
        {
          id: 'feeder',
          name: 'Feeder Momentum Loop',
          subid: 'schools-network',
          plain:
            'Re-ranks which schools send the best-converting students by measured conversion momentum, so outreach targets the movers. No AI model — a pure measured re-rank, computed on the page.',
          cfg: 'on-demand (page load) · no LLM · weighting in code',
          status: 'Live · verified',
          tone: 'live',
          gates: ['on', 'on', 'on', 'on'],
          metrics: [
            { v: '2-cycle', k: 'sim-verified moat', tone: 'good' },
            { v: 'on-demand', k: 'recomputed per view', tone: 'mute' },
            { v: 'low', k: 'adoption fuel', tone: 'warn' },
          ],
          noteTag: 'Now',
          note: 'Loop proven self-improving via a live 2-cycle simulation. The gap is fuel — outreach adoption is still thin, so the measured signal is quiet.',
        },
      ],
    },
    {
      title: 'Cadence & rotation loops',
      gateLabel: 'G · A · — · —',
      blurb:
        'They cycle and act, but never measure their own causal effect — so they repeat reliably without getting smarter. Loop-shaped, not self-improving. Each could be upgraded by adding gates M and F.',
      loops: [
        {
          id: 'ai-pulse',
          name: 'AI Pulse',
          subid: 'tick · rotation · anomaly · digest',
          plain:
            'A weekly faculty AI-capability engine: it opens each week’s cycle, draws Pulse teams from a rotation queue so everyone gets a turn, scans for integrity red-flags, and digests engagement to HODs.',
          ...wire(
            'ai-pulse-tick',
            null,
            'daily ticks 07:00–10:30 IST · weekly digest Tue · schedule editable · policy dials in ai_pulse_policies',
          ),
          status: 'Live · running',
          tone: 'live',
          gates: ['on', 'on', 'off', 'off'],
          metrics: [
            { v: n(pulseFlagsPending), k: 'anomaly flags pending', tone: 'mute' },
            { v: 'fairness', k: 'rotation draw basis', tone: 'mute' },
          ],
          noteTag: 'Why not self-improving',
          note: 'The rotation draws teams by fairness (front of queue), not by measured results; the anomaly scan flags issues for humans but never checks whether flagging reduced next week’s gaming. Gates M & F are open. Upgrade path: measure whether an intervention moved next week’s engagement, then adapt.',
        },
        {
          id: 'feedback-spine',
          name: 'Feedback Spine & intake adapters',
          subid: 'session · mess · parent · IG-dm · IG-comments',
          plain:
            'Five adapters pull feedback from every channel into one spine and AI-classify it into themes. This is the platform’s senses — it carries feedback in for the loops above to act on; it decides nothing itself.',
          ...wire(
            'feedback-adapter-session',
            'feedback.classify',
            'adapters every 15 min · Haiku classifier · schedule editable',
          ),
          status: 'Intake · not a loop',
          tone: 'intake',
          gates: ['off', 'off', 'off', 'off'],
          metrics: [
            { v: n(spineTotal), k: 'items in (14 days)', tone: 'good' },
            {
              v: `${n(spineClassified)}/${n(spineTotal)}`,
              k: 'classified',
              tone:
                spineTotal == null || spineClassified == null
                  ? 'mute'
                  : spineClassified < spineTotal
                    ? 'warn'
                    : 'good',
            },
          ],
          noteTag: 'Why not a loop',
          note: 'No Generate, no Measure — it’s the input pipe. It feeds the SCF and Mess loops rather than being one. The classify ratio above is the spine’s own backlog (session ratings arrive faster than the ~50/day classifier drains); it does NOT gate the SCF loop, which reads the session_feedback table directly.',
        },
        {
          id: 'mentor-checkins',
          name: 'Senior Peer Mentor Check-in Loop',
          subid: 'induction · monthly cadence',
          plain:
            'Twenty 3rd-year mentors each hold a fresher group for the whole first year: a scheduled monthly check-in (attendance + kiosk feedback via the mentor’s existing tools) keeps the mentorship beating after induction week ends.',
          cfg: 'monthly 15th 10:00 · sessions pre-generated to May 2027 · training + lifecycle gated · no LLM',
          status: 'Wired · first beat 15 Aug',
          tone: 'sched',
          gates: ['on', 'on', 'off', 'off'],
          metrics: [
            { v: n(checkinsScheduled), k: 'check-ins scheduled', tone: 'good' },
            { v: '20', k: 'mentors enrolled', tone: 'mute' },
            { v: '15 Aug', k: 'first beat', tone: 'mute' },
          ],
          verifyHref: '/events/induction',
          verifyLabel: 'Verify on the induction console →',
          noteTag: 'Why not self-improving',
          note: 'It cycles (monthly) and acts (check-in + captured feedback) but nothing yet measures whether mentored freshers fare better than unmentored — gate M is the upgrade path once a semester of check-ins exists.',
        },
        {
          id: 'pde-quest',
          name: 'PDE Quest → Demonstration Loop',
          subid: 'pde · capability evidence',
          plain:
            'A published quest invites learners to build; submissions become reviewed demonstrations that credit real capabilities. The pilot quest opened 8 Jul — demonstrations are the loop’s first evidence beat.',
          cfg: 'event-driven (submissions) · human review · no cron',
          status:
            (pdeQuestsOpen ?? 0) > 0
              ? (pdeDemos ?? 0) > 0
                ? 'Live · demonstrating'
                : 'Open · awaiting first demos'
              : 'Dark · no open quest',
          tone: (pdeQuestsOpen ?? 0) > 0 ? 'early' : 'dark',
          gates: ['on', 'on', 'off', 'off'],
          metrics: [
            { v: n(pdeQuestsOpen), k: 'quests open', tone: (pdeQuestsOpen ?? 0) > 0 ? 'good' : 'warn' },
            { v: n(pdeDemos), k: 'demonstrations', tone: (pdeDemos ?? 0) > 0 ? 'good' : 'mute' },
          ],
          noteTag: 'Why not self-improving',
          note: 'Generate and Act are live (quest → submission → review). No measure of whether demonstrated capability changes anything downstream yet — that wire comes after the first cohort of demos exists.',
        },
      ],
    },
    {
      title: 'Accountability loops',
      gateLabel: 'G · A · M · F̂',
      blurb:
        'They do measure outcomes against a target — gate M is closed. What’s different: the feed-forward is a human reading the verdict and rule-based logic, not the system auto-adjusting. Real loops, human-in-the-middle.',
      loops: [
        {
          id: 'decisions',
          name: 'Director Decisions Verdict',
          subid: 'dashboard · decisions',
          plain:
            'A director logs a decision with a target metric and a due date → the system grades the actual outcome against that target and emits a verdict, so decisions get a scored track record.',
          cfg: 'daily 04:00 UTC · rule-based (no LLM) · metric resolver in code',
          status: 'Live · measuring',
          tone: 'live',
          gates: ['on', 'on', 'on', 'half'],
          metrics: [
            { v: n(decisionsTotal), k: 'decisions tracked', tone: 'mute' },
            { v: n(decisionsPending), k: 'awaiting outcome', tone: 'warn' },
            { v: n(decisionsGraded), k: 'graded', tone: 'mute' },
          ],
          noteTag: 'Why half a loop',
          note: 'It closes Measure (outcome vs the decision’s own target) — the strongest of this tier. Gate F is a human: someone reads the verdict and decides differently next time; the system doesn’t auto-adjust.',
        },
        {
          id: 'referral-desk',
          name: 'Induction Referral → Working Desk Loop',
          subid: 'induction · L3 weld (#1887)',
          plain:
            'A fresher refers a friend during induction → the lead is auto-routed to a configured working desk, which calls and works it toward a join. The measure is real joins from referred leads.',
          cfg: 'event-driven (referral submit) · desk = platform_policies row · no LLM',
          status: (refRouted ?? 0) > 0 ? 'Live · desk working leads' : 'Wired · awaiting referrals',
          tone: (refRouted ?? 0) > 0 ? 'live' : 'sched',
          gates: ['on', 'on', 'on', 'half'],
          metrics: [
            { v: n(refLeads), k: 'referral leads', tone: 'good' },
            { v: n(refRouted), k: 'routed to the desk', tone: (refRouted ?? 0) > 0 ? 'good' : 'warn' },
            { v: 'joins', k: 'the measure — pending desk calls', tone: 'mute' },
          ],
          noteTag: 'Why half a loop',
          note: 'Welded 8 Jul: every referral now lands on a working desk instead of evaporating. Measure is the funnel (referred → joined); feed-forward is the desk human deciding whom to call next — the system routes, people close.',
        },
        {
          id: 'arps',
          name: 'Accountability & pace (ARPS / YoY grid)',
          subid: 'arps · yoy-counselor',
          plain:
            'Sets cost baselines and revenue targets, then tracks actual pace against them and surfaces a counselor-level accountability grid, driving the auto-accountability meeting engine.',
          cfg: 'target-driven · rule-based · baselines/targets are config rows',
          status: 'Live · tracking',
          tone: 'live',
          gates: ['on', 'on', 'on', 'half'],
          metrics: [
            { v: 'target', k: 'vs actual pace', tone: 'good' },
            { v: 'human', k: 'acts on the gap', tone: 'mute' },
          ],
          noteTag: 'Why half a loop',
          note: 'Measures pace against targets and flags the gap — but a person owns the correction (the accountability meeting), so the feed-forward is human, not automatic.',
        },
        {
          id: 'iqac-meeting',
          name: 'IQAC Meeting Loop (Loop Review)',
          subid: 'accreditation · committees',
          plain:
            'The committee passes resolutions with an owner and a deadline → the NEXT meeting opens by reviewing every open item: done, carried, or dropped → the minutes are the Action-Taken Report. Twice-carried items escalate to the Director.',
          cfg: 'human cadence · convened on /accreditation/naac/committees · 7.3.e evidence via accreditation-loop-evidence 04:23 IST',
          status:
            (iqacCommittees ?? 0) === 0
              ? 'Built · awaiting first committee'
              : (iqacMeetingsMinuted ?? 0) > 0
                ? 'Live · reviewing resolutions'
                : 'Live · awaiting first minuted meeting',
          tone: (iqacMeetingsMinuted ?? 0) > 0 ? 'live' : 'sched',
          gates: ['on', 'on', 'on', 'half'],
          metrics: [
            { v: n(iqacCommittees), k: 'committees constituted', tone: (iqacCommittees ?? 0) > 0 ? 'good' : 'warn' },
            { v: n(iqacMeetingsMinuted), k: 'meetings minuted', tone: 'mute' },
            {
              v: n(iqacResolutionsOpen),
              k: (iqacResolutionsEscalate ?? 0) > 0
                ? `open resolutions (${iqacResolutionsEscalate} escalate)`
                : 'open resolutions',
              tone: (iqacResolutionsEscalate ?? 0) > 0 ? 'warn' : 'mute',
            },
          ],
          verifyHref: '/accreditation/naac/committees',
          verifyLabel: 'Verify on the committees page →',
          noteTag: 'Why half a loop',
          note: 'Measure is closed — every resolution is checked against its own deadline at the next meeting — but the review and the correction are the committee itself. IQAC-as-loops Move 1 (Director decision 2026-07-10): the Cell runs the same discipline it monitors.',
        },
        {
          id: 'institutional-audit',
          name: 'Institutional Audit Loop (AAA)',
          subid: 'audit · cycles',
          plain:
            'An audit cycle attests parameters and logs findings with SLA owners → the cycle closes → the next cycle re-measures: findings that recur were never really fixed. Closed cycles emit 7.3.d evidence with the prior cycle as baseline.',
          cfg: 'cycle cadence · run on /audit · 7.3.d evidence via accreditation-loop-evidence 04:23 IST',
          status:
            (auditCyclesClosed ?? 0) > 0 ? 'Live · cycles closing' : 'Live · first cycle in progress',
          tone: (auditCyclesClosed ?? 0) > 0 ? 'live' : 'sched',
          gates: ['on', 'on', 'on', 'half'],
          metrics: [
            { v: n(auditCyclesTotal), k: 'audit cycles', tone: 'mute' },
            { v: n(auditCyclesClosed), k: 'closed cycles', tone: (auditCyclesClosed ?? 0) > 0 ? 'good' : 'warn' },
            { v: 'vs prior', k: 'findings delta at close', tone: 'mute' },
          ],
          verifyHref: '/audit',
          verifyLabel: 'Verify on the audit dashboard →',
          noteTag: 'Why half a loop',
          note: 'The audit engine (cycles, attestations, findings-with-SLA) predates this wiring; what was missing was the loop: each close now measures against the prior cycle and lands in the evidence junction. Feed-forward is the auditor and the finding owners. IQAC-as-loops Move 2.',
        },
      ],
    },
  ];

  // Summary tiles are STRUCTURAL inventory counts, derived from the tiers so
  // they can never drift from what's rendered below (a hardcoded tile once
  // double-counted the intake adapter as a cadence loop). "Loop" excludes the
  // intake tone — the Feedback Spine sits in the cadence tier for context but
  // is the senses, not a loop.
  const allLoops = tiers.flatMap((t) => t.loops);
  const summary: { label: string; value: number; tone: LoopTone }[] = [
    { label: 'self-improving (all 4 gates)', value: tiers[0]!.loops.length, tone: 'live' },
    {
      label: 'cadence & rotation loops',
      value: tiers[1]!.loops.filter((l) => l.tone !== 'intake').length,
      tone: 'early',
    },
    { label: 'accountability loops', value: tiers[2]!.loops.length, tone: 'dark' },
    {
      label: 'intake (senses, not a loop)',
      value: allLoops.filter((l) => l.tone === 'intake').length,
      tone: 'sched',
    },
  ];

  // ── loop_registry / loop_edges / loop_audits (2026-07-10) ─────────────────
  // Feeds the Tower's per-loop chips + the Wiring view. New prod tables — a
  // missing/lagging migration must never break this page, so every leg falls
  // back to an empty array (same swallow-to-empty philosophy as cnt() above).
  // Raw owners-panel row — the panel's dedicated read below (ALL rows, not just
  // active: an owner can be assigned before a loop is switched on).
  type OwnerRegistryRead = {
    loop_key: string;
    name: string;
    domain: string | null;
    verdict_owner: string | null;
    owner_email: string | null;
    is_active: boolean | null;
    outcome_metric: string | null;
    counter_metric: string | null;
    intervention: string | null;
    baseline_window: string | null;
    remeasure_window: string | null;
  };

  const [registry, edges, audits, conflicts, ownerReads] = await Promise.all([
    // Charter-aware read with a pre-charter fallback: the five charter-leg
    // columns (outcome_metric … remeasure_window) land in a SIBLING migration,
    // and enumerating a column that doesn't exist yet errors the WHOLE select —
    // which would swallow the registry to empty and blank every ring chip.
    // Try charter-aware first; on error retry with the pre-charter list, so
    // the page renders identically before and after that migration applies
    // (missing legs read as undefined → the honesty badge treats them as NULL,
    // i.e. Meter).
    (async (): Promise<LoopRegistryRow[]> => {
      const cols =
        'loop_key,name,stack_tier,loop_class,gates,description,owner_email,counter_metric';
      try {
        const r = await admin
          .from('loop_registry')
          .select(`${cols},outcome_metric,baseline_window,intervention,verdict_owner,remeasure_window`)
          .eq('is_active', true);
        if (!r.error) return (r.data ?? []) as LoopRegistryRow[];
        const f = await admin.from('loop_registry').select(cols).eq('is_active', true);
        return (f.data ?? []) as LoopRegistryRow[];
      } catch {
        return [] as LoopRegistryRow[];
      }
    })(),
    admin
      .from('loop_edges')
      .select('from_key,to_key,what_flows,note,is_draft')
      .then(
        (r) => (r.data ?? []) as LoopEdgeRow[],
        () => [] as LoopEdgeRow[]
      ),
    admin
      .from('loop_audits')
      .select('loop_key,audited_at,layer,verdict')
      .order('audited_at', { ascending: false })
      // Shared newest-first window across ALL loops: one chatty loop could
      // push a quiet loop's latest audit past the cap and its "tested" badge
      // would silently vanish (review 2026-07-10, #5). 500 ≈ years of headroom
      // at current audit volume; revisit with DISTINCT ON if audits get chatty.
      .limit(500)
      .then(
        (r) => (r.data ?? []) as LoopAuditRow[],
        () => [] as LoopAuditRow[]
      ),
    admin
      .from('loop_conflicts')
      .select('conflict_key, title, loops, description, arbiter_email, status, ruling')
      .eq('status', 'open')
      .then(
        (r) => (r.data ?? []) as LoopConflictRow[],
        () => [] as LoopConflictRow[]
      ),
    // Owners & verdicts panel (2026-08-12) — the registry's delegation surface.
    // Charter legs are read to compute the completeness badge server-side.
    // Same swallow-to-empty contract as the reads above: a failed select
    // renders the panel's explicit empty state, never a 500.
    admin
      .from('loop_registry')
      .select(
        'loop_key,name,domain,verdict_owner,owner_email,is_active,outcome_metric,counter_metric,intervention,baseline_window,remeasure_window'
      )
      .order('stack_tier', { ascending: true })
      .order('name', { ascending: true })
      .then(
        (r) => (r.data ?? []) as OwnerRegistryRead[],
        () => [] as OwnerRegistryRead[]
      ),
  ]);

  // Charter completeness: all five legs non-null/non-blank → "chartered".
  // Blank-string legs count as missing — same honesty as the RPC's NULLIF.
  const CHARTER_LEGS = [
    'outcome_metric',
    'counter_metric',
    'intervention',
    'baseline_window',
    'remeasure_window',
  ] as const;
  const ownersPanelRows: OwnerPanelRow[] = ownerReads.map((r) => ({
    loop_key: r.loop_key,
    name: r.name,
    domain: r.domain ?? null,
    verdict_owner: r.verdict_owner ?? null,
    owner_email: r.owner_email ?? null,
    is_active: r.is_active !== false,
    missing_legs: CHARTER_LEGS.filter(
      (k) => r[k] == null || String(r[k]).trim() === ''
    ),
  }));

  // ── Proven-green thresholds (spec 2026-08-13) ─────────────────────────────
  // Two Director-adjustable policy rows (seeded by 20260813033300); in-code
  // fallbacks keep the strip safe before that migration is applied. Same
  // scope_type='global' read discipline as the mess master-switch above.
  const provenGreenPolicies = await admin
    .from('platform_policies')
    .select('policy_key, value')
    .in('policy_key', [
      'loops.proven_green.sim_max_age_days',
      'loops.proven_green.walk_max_age_days',
    ])
    .eq('scope_type', 'global')
    .then(
      (r) => (r.data ?? []) as { policy_key: string; value: unknown }[],
      () => [] as { policy_key: string; value: unknown }[]
    );
  const policyNum = (key: string, fallback: number): number => {
    const v = provenGreenPolicies.find((p) => p.policy_key === key)?.value;
    const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(num) && num > 0 ? num : fallback;
  };
  const simMaxAgeDays = policyNum('loops.proven_green.sim_max_age_days', 30);
  const walkMaxAgeDays = policyNum('loops.proven_green.walk_max_age_days', 180);

  // Latest audit per loop — audits arrive newest-first, so the first row seen
  // per loop_key wins.
  const latestAuditByKey = new Map<string, LoopAuditRow>();
  for (const a of audits) {
    if (!latestAuditByKey.has(a.loop_key)) latestAuditByKey.set(a.loop_key, a);
  }

  // Latest SIM-layer audit per loop — the weekly known-delta regress cron
  // (Sundays 07:53 IST) writes layer='sim' rows. Tracked separately from
  // latestAuditByKey because a newer walk/full audit for the same loop must
  // not hide the sim row the charter badge's "verified" leg depends on.
  const latestSimByKey = new Map<string, LoopAuditRow>();
  for (const a of audits) {
    if (a.layer === 'sim' && !latestSimByKey.has(a.loop_key)) latestSimByKey.set(a.loop_key, a);
  }

  const asOf = new Date().toISOString().slice(0, 10);

  // ── Loop Tower v2 stats (corrected loopcraft rings, 2026-07-12) ────────────
  // ONE shared 7d window (since7, computed above) + an IST "today" for the
  // engine rings. IST day start → UTC instant, so "today" matches the campus
  // day: floor now to the IST day boundary (UTC+5:30 = 19_800_000 ms), then
  // express it back as a UTC instant (same inline-Date idiom as since7/14).
  const istDayStartUtc = new Date(
    Math.floor((Date.now() + 19_800_000) / 86_400_000) * 86_400_000 - 19_800_000,
  ).toISOString();
  const [
    // ring 1 — generation engine. ai_model_usage's timestamp column is
    // invoked_at (the old created_at filter errored → chips always showed '—').
    maxCalls7d,
    maxCallsToday,
    apiCalls7d,
    apiCallsToday,
    // ring 2 — execution engine (Max lane; dispatcher derived from schedById)
    maxlaneDone7d,
    maxlaneDoneToday,
    maxlaneError7d,
    maxlaneErrorToday,
    // ring 3/4 — per-loop 7d closures (den = opened, num = closed, same window)
    scfGen7d,
    scfMeasured7d,
    scfVerdicts7d,
    confirms7d,
    indGen7d,
    indMeasured7d,
    playbookGen7d,
    playbookMeasured7d,
    messGen7d,
    messMeasured7d,
    pulseGen7d,
    pulseMeasured7d,
    pulseVerdicts7d,
    pdeSub7d,
    pdeScored7d,
    spineIn7d,
    spineClassified7d,
    refLeads7d,
    refRouted7d,
    // SCF all-time measured record — data-derived copy for the product ring
    // (replaces the hardcoded "8 Jul, both positive" claim that went stale).
    scfMeasuredAll,
    scfPosAll,
    scfNegAll,
    // seam 5↔6 — decisions between system and oversight
    decisionsLogged7d,
    decisionsGraded7d,
  ] = await Promise.all([
    cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).eq('provider', 'claude_code').gte('invoked_at', since7)),
    cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).eq('provider', 'claude_code').gte('invoked_at', istDayStartUtc)),
    cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).neq('provider', 'claude_code').gte('invoked_at', since7)),
    cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).neq('provider', 'claude_code').gte('invoked_at', istDayStartUtc)),
    cnt(admin.from('max_lane_requests').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('requested_at', since7)),
    cnt(admin.from('max_lane_requests').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('requested_at', istDayStartUtc)),
    cnt(admin.from('max_lane_requests').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('requested_at', since7)),
    cnt(admin.from('max_lane_requests').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('requested_at', istDayStartUtc)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gte('generated_at', since7)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gte('outcome_measured_at', since7)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gte('human_verdict_at', since7)),
    cnt(admin.from('scf_note_resolution_votes').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).gte('generated_at', since7)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).gte('outcome_measured_at', since7)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'induction').gte('generated_at', since7)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'induction').gte('outcome_measured_at', since7)),
    cnt(admin.from('mess_menu_recommendations').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('mess_menu_recommendations').select('*', { count: 'exact', head: true }).gte('measured_at', since7)),
    cnt(admin.from('ai_pulse_cycle_outcomes').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('ai_pulse_cycle_outcomes').select('*', { count: 'exact', head: true }).gte('outcome_measured_at', since7)),
    cnt(admin.from('ai_pulse_cycle_outcomes').select('*', { count: 'exact', head: true }).gte('human_verdict_at', since7)),
    cnt(admin.from('pde_demonstrations').select('*', { count: 'exact', head: true }).gte('submitted_at', since7)),
    cnt(admin.from('pde_demonstrations').select('*', { count: 'exact', head: true }).gte('scored_at', since7)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).gte('ai_processed_at', since7)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).eq('source', 'referral').not('referred_by_id', 'is', null).gte('created_at', since7)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).eq('source', 'referral').not('referred_by_id', 'is', null).not('assigned_counselor_id', 'is', null).gte('created_at', since7)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').not('outcome_measured_at', 'is', null)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gt('outcome_lift', 0.05)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').lt('outcome_lift', -0.05)),
    cnt(admin.from('director_decisions').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('director_decisions').select('*', { count: 'exact', head: true }).gte('actual_outcome_recorded_at', since7)),
  ]);

  // A null leg means that count query FAILED — the sum must go hollow too, or
  // a partial failure would render as a smaller-but-healthy-looking number.
  const sumOrNull = (...vs: (number | null)[]): number | null =>
    vs.some((v) => v === null) ? null : vs.reduce((a, b) => (a as number) + (b as number), 0);

  // ── Ring-2 extra lanes + 30-day management strip (2026-07-13) ─────────────
  // Two new EXECUTION-ring lanes: the dispatcher's TRUE run log (ai_routine_run_log,
  // new this deploy) and the typed async job queue (ai_jobs). Plus the 30-day
  // closure counts that power the strip — same loops as the product ring, wider
  // window. Every leg swallows to null (cnt) so a missing table renders hollow.
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    dispatcherRuns7d,
    dispatcherRunsToday,
    jobsDone7d,
    jobsError7d,
    jobsTotal7d,
    scfGen30d,
    scfMeasured30d,
    indGen30d,
    indMeasured30d,
    playbookGen30d,
    playbookMeasured30d,
    messGen30d,
    messMeasured30d,
    pulseGen30d,
    pulseMeasured30d,
    pdeSub30d,
    pdeScored30d,
    spineIn30d,
    spineClassified30d,
    refLeads30d,
    refRouted30d,
  ] = await Promise.all([
    cnt(admin.from('ai_routine_run_log').select('*', { count: 'exact', head: true }).gte('fired_at', since7)),
    cnt(admin.from('ai_routine_run_log').select('*', { count: 'exact', head: true }).gte('fired_at', istDayStartUtc)),
    cnt(admin.from('ai_jobs').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('requested_at', since7)),
    cnt(admin.from('ai_jobs').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('requested_at', since7)),
    cnt(admin.from('ai_jobs').select('*', { count: 'exact', head: true }).gte('requested_at', since7)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gte('generated_at', since30)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gte('outcome_measured_at', since30)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).gte('generated_at', since30)),
    cnt(admin.from('induction_session_effectiveness').select('*', { count: 'exact', head: true }).gte('outcome_measured_at', since30)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'induction').gte('generated_at', since30)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'induction').gte('outcome_measured_at', since30)),
    cnt(admin.from('mess_menu_recommendations').select('*', { count: 'exact', head: true }).gte('created_at', since30)),
    cnt(admin.from('mess_menu_recommendations').select('*', { count: 'exact', head: true }).gte('measured_at', since30)),
    cnt(admin.from('ai_pulse_cycle_outcomes').select('*', { count: 'exact', head: true }).gte('created_at', since30)),
    cnt(admin.from('ai_pulse_cycle_outcomes').select('*', { count: 'exact', head: true }).gte('outcome_measured_at', since30)),
    cnt(admin.from('pde_demonstrations').select('*', { count: 'exact', head: true }).gte('submitted_at', since30)),
    cnt(admin.from('pde_demonstrations').select('*', { count: 'exact', head: true }).gte('scored_at', since30)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).gte('created_at', since30)),
    cnt(admin.from('feedback_events').select('*', { count: 'exact', head: true }).gte('ai_processed_at', since30)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).eq('source', 'referral').not('referred_by_id', 'is', null).gte('created_at', since30)),
    cnt(admin.from('admission_leads').select('*', { count: 'exact', head: true }).eq('source', 'referral').not('referred_by_id', 'is', null).not('assigned_counselor_id', 'is', null).gte('created_at', since30)),
  ]);
  const scfLift30d = await loadScfLift(admin, since30);

  // 30-day closure map for the strip. `verb` = what "closed" means for each
  // loop. `measureLoop` marks the loops whose closure is a baseline-measured
  // outcome (Cell A's sum) vs. intake/routing/human-score (in the constraint
  // scan but out of Cell A).
  const strip30d: Record<
    string,
    { name: string; verb: string; num: number | null; den: number | null; measureLoop: boolean }
  > = {
    scf: { name: 'Session-feedback teaching', verb: 'measured', num: scfMeasured30d, den: scfGen30d, measureLoop: true },
    'induction-session': { name: 'Induction session-effect.', verb: 'measured', num: indMeasured30d, den: indGen30d, measureLoop: true },
    'induction-playbook': { name: 'Induction playbook', verb: 'measured', num: playbookMeasured30d, den: playbookGen30d, measureLoop: true },
    mess: { name: 'Mess menu', verb: 'measured', num: messMeasured30d, den: messGen30d, measureLoop: true },
    'ai-pulse': { name: 'AI Pulse', verb: 'measured', num: pulseMeasured30d, den: pulseGen30d, measureLoop: true },
    'pde-quest': { name: 'PDE demonstrations', verb: 'scored', num: pdeScored30d, den: pdeSub30d, measureLoop: false },
    'feedback-spine': { name: 'Feedback spine', verb: 'classified', num: spineClassified30d, den: spineIn30d, measureLoop: false },
    'referral-desk': { name: 'Induction referral desk', verb: 'routed', num: refRouted30d, den: refLeads30d, measureLoop: false },
  };

  // Cell A — cycles closed 30d = measured closures across the MEASURE loops
  // only (spine intake / referral routing / PDE human-score are excluded).
  const cyclesClosed30d = sumOrNull(
    strip30d.scf.num,
    strip30d['induction-session'].num,
    strip30d['induction-playbook'].num,
    strip30d.mess.num,
    strip30d['ai-pulse'].num,
  );

  // Cell D — the current constraint (Theory of Constraints, one item). Primary
  // signal: the worst closure rate (num/den) among loops with fuel this window.
  // On a tie, OR when no loop has fuel at all, fall back to the most fuel-starved
  // line (lowest den) — mirroring the documented reality that the loop system is
  // fuel-starved, not code-starved. Always names exactly one thing when any
  // closure data exists; hollow only if every loop's counts failed to read.
  // (Note: closure is a same-window ratio — a fresh generation may not have had
  // time to measure, so a low rate can reflect measurement lag as well as a
  // stuck Measure gate. Flip the tie-break to highest-den if the Director would
  // rather surface the largest blocked flow than the most-starved line.)
  const constraint = ((): { label: string; detail: string } | null => {
    const entries = Object.values(strip30d).filter(
      (e): e is { name: string; verb: string; num: number; den: number; measureLoop: boolean } =>
        e.num !== null && e.den !== null,
    );
    if (entries.length === 0) return null;
    const rated = entries.filter((e) => e.den > 0).map((e) => ({ ...e, rate: e.num / e.den }));
    if (rated.length > 0) {
      const worst = Math.min(...rated.map((r) => r.rate));
      const c = rated.filter((r) => r.rate === worst).sort((a, b) => a.den - b.den)[0]!;
      const pct = c.rate < 0.1 ? (c.rate * 100).toFixed(1) : String(Math.round(c.rate * 100));
      return { label: c.name, detail: `${c.num} of ${c.den} ${c.verb} · ${pct}% closure (30d)` };
    }
    const c = entries.sort((a, b) => a.den - b.den)[0]!;
    return { label: c.name, detail: '0 opened in 30d — starved of fuel' };
  })();

  // Dispatcher lane: ai_routine_schedules keeps ONLY last_fired_at per routine
  // (no run-history table), so these are routines-whose-latest-fire-is-in-window,
  // not run counts — the component says so on the ring. Empty map = the read
  // failed above → hollow, not zero.
  const sched = [...schedById.values()];

  // Cell C — mission-pillar coverage from the mission_pillars config table
  // (edited on /admin/loops/pillars). Weighted: covered = 1, partial = 0.5,
  // everything else = 0, over ACTIVE pillars only. Table may not exist yet
  // (migration pending apply) → null, which renders the cell hollow rather
  // than a fake 0%.
  const pillars = await (async () => {
    try {
      const { data, error } = await admin
        .from('mission_pillars')
        .select('coverage_status')
        .eq('is_active', true);
      // Missing relation (migration not applied yet) or permission error →
      // hollow, never a fake 0%. Same swallow-to-null contract as cnt().
      if (error || !data) return null;
      const total = data.length;
      if (total === 0) return { score: 0, total: 0, pct: 0 };
      const score = data.reduce(
        (acc: number, r: { coverage_status: string }) =>
          acc +
          (r.coverage_status === 'covered'
            ? 1
            : r.coverage_status === 'partial'
              ? 0.5
              : 0),
        0
      );
      return { score, total, pct: Math.round((score / total) * 100) };
    } catch {
      // Any unexpected throw must not 500 the super-admin page — render hollow.
      return null;
    }
  })();

  // ── "Engine health today" strip (Director-approved 2026-07-18) ─────────────
  // Four IST-today reads for the one-line health answer at the top of Ring 2.
  // Same swallow-to-null contract as every tower stat: a failed read renders
  // the strip amber-unreadable, never a fake green. The stuck rule (non-
  // terminal past 30 min) is IDENTICAL to the ai-tasks-sweep outage pager so
  // the strip and the pager can never tell two different stories.
  const thirtyMinAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const [engineJobsDoneToday, engineJobsStuck, engineErrorsToday, enginePaidCallsToday] =
    await Promise.all([
      cnt(admin.from('ai_jobs').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('completed_at', istDayStartUtc)),
      cnt(admin.from('ai_jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '(done,error,canceled,cancelled,failed,delivered)').lt('requested_at', thirtyMinAgoIso)),
      cnt(admin.from('ai_jobs').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('completed_at', istDayStartUtc)),
      cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).not('provider', 'in', '(claude_code,groq)').gte('invoked_at', istDayStartUtc)),
    ]);

  // Failure/spend detail only when the count went amber — names for the plain-
  // language sentence. Best-effort: a throw here leaves the count doing the
  // alerting on its own.
  const engineErrorTypes: string[] = [];
  if ((engineErrorsToday ?? 0) > 0) {
    try {
      const { data } = await admin
        .from('ai_jobs')
        .select('job_type')
        .eq('status', 'error')
        .gte('completed_at', istDayStartUtc)
        .limit(20);
      for (const r of (data ?? []) as { job_type: string }[]) {
        if (!engineErrorTypes.includes(r.job_type)) engineErrorTypes.push(r.job_type);
      }
    } catch {
      /* count already renders amber */
    }
  }
  let enginePaidInrToday: number | null = enginePaidCallsToday === 0 ? 0 : null;
  if ((enginePaidCallsToday ?? 0) > 0) {
    try {
      const { data } = await admin
        .from('ai_model_usage')
        .select('cost_inr')
        .not('provider', 'in', '(claude_code,groq)')
        .gte('invoked_at', istDayStartUtc)
        .limit(1000);
      enginePaidInrToday = ((data ?? []) as { cost_inr: number | null }[]).reduce(
        (a, r) => a + (r.cost_inr ?? 0),
        0,
      );
    } catch {
      /* count already renders amber */
    }
  }

  // Loops due · ran — from the dispatcher timetable already loaded above.
  // "Due" = enabled, weekday matches today (IST), and the slot passed 10+ min
  // ago (grace so a routine due this minute can't false-alarm mid-dispatch).
  // Weekly loops (curriculum=Sun, playbook+escalation=Mon) only count on their
  // day, so a quiet weekday can't look broken. induction-session-effectiveness
  // rides a static vercel cron (not dispatcher-managed) — its health surfaces
  // through the queue/failure cells instead.
  const LOOP_GENERATOR_ROUTINES = [
    'scf-generate-suggestions',
    'scf-learner-notes',
    'curriculum-lesson-spine-generate',
    'induction-generate-playbook',
    'session-feedback-escalation',
  ];
  const istNowMs = Date.now() + 19_800_000;
  const istWeekday = new Date(istNowMs).getUTCDay();
  const istMinuteOfDay = new Date(istNowMs).getUTCHours() * 60 + new Date(istNowMs).getUTCMinutes();
  let engineLoopsDue: number | null = null;
  let engineLoopsRan: number | null = null;
  const engineLoopsMissed: string[] = [];
  if (schedById.size > 0) {
    engineLoopsDue = 0;
    engineLoopsRan = 0;
    for (const rid of LOOP_GENERATOR_ROUTINES) {
      const sRow = schedById.get(rid);
      if (!sRow || !sRow.enabled) continue;
      const days = sRow.days_of_week;
      const dueToday =
        (!days || days.length === 0 || days.includes(istWeekday)) &&
        sRow.minute_of_day + 10 <= istMinuteOfDay;
      if (!dueToday) continue;
      engineLoopsDue += 1;
      if (sRow.last_fired_at && sRow.last_fired_at >= istDayStartUtc) engineLoopsRan += 1;
      else engineLoopsMissed.push(rid);
    }
  }

  const towerStats: LoopTowerStats = {
    maxCalls7d,
    maxCallsToday,
    apiCalls7d,
    apiCallsToday,
    maxlaneDone7d,
    maxlaneDoneToday,
    maxlaneError7d,
    maxlaneErrorToday,
    routinesEnabled: sched.length ? sched.filter((r) => r.enabled).length : null,
    routinesTotal: sched.length || null,
    routinesFired7d: sched.length
      ? sched.filter((r) => r.last_fired_at && r.last_fired_at >= since7).length
      : null,
    routinesFiredToday: sched.length
      ? sched.filter((r) => r.last_fired_at && r.last_fired_at >= istDayStartUtc).length
      : null,
    // Task ring: an iteration is closed when its outcome lands — summed across
    // every instrumented iteration table (scf, induction session, playbook,
    // mess proposals, pulse cycles), all in the same 7d window.
    iterationsClosed7d: sumOrNull(scfMeasured7d, indMeasured7d, playbookMeasured7d, messMeasured7d, pulseMeasured7d),
    verdicts7d: sumOrNull(scfVerdicts7d, pulseVerdicts7d),
    confirms7d,
    // Product ring closures by loop_key. Keys with no derivable closure
    // counter (feeder: on-demand recompute with no iteration rows;
    // mentor-checkins: no completion marker until the first beat lands;
    // arps: no iteration table) are intentionally ABSENT — the chip renders
    // "closure: not instrumented" instead of an invented number.
    productClosure7d: {
      scf: { label: 'notes → measured', num: scfMeasured7d, den: scfGen7d },
      'induction-session': { label: 'tips → measured', num: indMeasured7d, den: indGen7d },
      'induction-playbook': { label: 'playbooks → measured', num: playbookMeasured7d, den: playbookGen7d },
      mess: { label: 'proposals → measured', num: messMeasured7d, den: messGen7d },
      'ai-pulse': { label: 'cycles → measured', num: pulseMeasured7d, den: pulseGen7d },
      'pde-quest': { label: 'demos → scored', num: pdeScored7d, den: pdeSub7d },
      'feedback-spine': { label: 'items → classified', num: spineClassified7d, den: spineIn7d },
      'referral-desk': { label: 'referrals → routed', num: refRouted7d, den: refLeads7d },
    },
    scfMeasuredAll,
    scfPosAll,
    scfNegAll,
    // System ring machinery. registry/audits are swallow-to-empty above, so an
    // empty array means "unreachable or truly empty" — both render hollow.
    registryActive: registry.length || null,
    audits7d: audits.length
      ? audits.filter((a) => a.audited_at >= since7).length
      : null,
    // audits arrive newest-first — the first sim-layer row is the latest regress.
    latestRegress: (() => {
      const r = audits.find((a) => a.layer === 'sim');
      return r ? { verdict: r.verdict, auditedAt: r.audited_at } : null;
    })(),
    // Watchdog health from the SAME row + helpers the watchdog cron uses
    // (isAlarmStatus / staleThresholdMs), so the two can't drift.
    watchdog: (() => {
      const w = schedById.get('loop-watchdog');
      if (!w) return null;
      const alarm =
        isAlarmStatus(w.last_status, Boolean(getRoutineById('loop-watchdog'))) ||
        Boolean(
          w.last_fired_at &&
            Date.now() - new Date(w.last_fired_at).getTime() > staleThresholdMs(w.days_of_week),
        );
      return { enabled: w.enabled, alarm, lastStatus: w.last_status };
    })(),
    decisionsLogged7d,
    decisionsGraded7d,
    // ring 2 — extra instrumented lanes (2026-07-13)
    dispatcherRuns7d,
    dispatcherRunsToday,
    jobsDone7d,
    jobsError7d,
    jobsTotal7d,
    // ring 2 — "engine health today" one-line strip (2026-07-18)
    engineToday: {
      loopsDue: engineLoopsDue,
      loopsRan: engineLoopsRan,
      loopsMissed: engineLoopsMissed,
      jobsDoneToday: engineJobsDoneToday,
      jobsStuck: engineJobsStuck,
      errorsToday: engineErrorsToday,
      errorTypes: engineErrorTypes,
      paidCallsToday: enginePaidCallsToday,
      paidInrToday: enginePaidInrToday,
    },
    // management strip (30d executive summary)
    strip: {
      cyclesClosed30d,
      scfLiftMean30d: scfLift30d.mean,
      scfLiftN30d: scfLift30d.n,
      pillars,
      constraint,
    },
  };

  // ── Cluster lens data (C4) — loaded only when the Cluster view is open ─────
  // Phase 1: the member set is manual and lives in ?inst= (comma-separated
  // institution ids, validated against the live institutions list — junk ids
  // are dropped). Presets read accreditation_committees committee_type=
  // 'cluster' rows; that type value only lands with the sibling C1 PR, so the
  // filter matches zero rows today and the picker degrades to no presets.
  let clusterInstitutions: ClusterInstitutionOption[] = [];
  let clusterPresets: ClusterPreset[] = [];
  let clusterSelected: string[] = [];
  let clusterSignals: ClusterSignal[] | null = null;
  if (view === 'cluster') {
    const [instRows, presetRows, presetResolutionRows] = await Promise.all([
      admin
        .from('institutions')
        .select('id, name, display_name')
        .eq('is_active', true)
        .order('name')
        // PromiseLike has no .catch — rejection handler is .then's 2nd arg.
        .then(
          (r) => (r.data ?? []) as ClusterInstitutionOption[],
          () => [] as ClusterInstitutionOption[]
        ),
      admin
        .from('accreditation_committees')
        .select('id, committee_name, metadata')
        .eq('committee_type', 'cluster')
        .eq('is_active', true)
        .then(
          (r) => (r.data ?? []) as { id: string; committee_name: string; metadata: unknown }[],
          () => [] as { id: string; committee_name: string; metadata: unknown }[]
        ),
      // Preset roster source (b): the institutions a cluster committee's
      // resolutions actually touch — affected_institution_ids is the C7
      // sibling's column, so until that migration applies this select errors
      // and swallows to empty. Real data, no committee-level roster invented.
      admin
        .from('accreditation_committee_resolutions')
        .select('affected_institution_ids, committee:accreditation_committees!inner(id, committee_type, is_active)')
        .eq('committee.committee_type', 'cluster')
        .eq('committee.is_active', true)
        .then(
          (r) => (r.data ?? []) as { affected_institution_ids: unknown; committee: unknown }[],
          () => [] as { affected_institution_ids: unknown; committee: unknown }[]
        ),
    ]);
    clusterInstitutions = instRows;
    const validIds = new Set(instRows.map((i) => i.id));
    // Union each cluster committee's resolution-touched institutions. The
    // embed is to-one via committee_id but normalize array-or-object anyway
    // (house rule: embedded JSON may arrive in either shape).
    const derivedByCommittee = new Map<string, Set<string>>();
    for (const row of presetResolutionRows) {
      const cRaw = row.committee;
      const c = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as { id?: string } | undefined;
      if (!c?.id) continue;
      const ids = Array.isArray(row.affected_institution_ids) ? row.affected_institution_ids : [];
      let set = derivedByCommittee.get(c.id);
      if (!set) {
        set = new Set();
        derivedByCommittee.set(c.id, set);
      }
      for (const v of ids) if (typeof v === 'string' && validIds.has(v)) set.add(v);
    }
    // A committee preset's members come from (a) a curated metadata roster
    // ('institution_ids' — C1's convention; no writer exists yet) when one is
    // present, else (b) the resolution-derived set above. Presets resolving to
    // zero live institutions are dropped, not guessed at.
    clusterPresets = presetRows
      .map((p) => {
        const meta = (p.metadata ?? {}) as Record<string, unknown>;
        const raw = meta.institution_ids ?? meta.member_institution_ids;
        const curated = Array.isArray(raw)
          ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && validIds.has(v)))]
          : [];
        const ids = curated.length > 0 ? curated : [...(derivedByCommittee.get(p.id) ?? [])];
        return { id: p.id, name: p.committee_name, institutionIds: ids };
      })
      .filter((p) => p.institutionIds.length > 0);
    // Dedupe as well as validate — a hand-edited URL like "a,a" must not
    // double-count an institution or wedge the picker's dirty check.
    clusterSelected = [
      ...new Set(
        (instParam ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((id) => validIds.has(id)),
      ),
    ];
    if (clusterSelected.length > 0) {
      clusterSignals = await loadClusterSignals(admin, clusterSelected);
    }
  }

  const pillCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
      active
        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'border-border text-muted-foreground hover:bg-muted/40'
    }`;

  return (
    <ContentLayout title="Loop Control Tower — every loop in MyJKKN, and whether it’s working">
      <div className="mb-4 flex gap-1.5">
        <Link href="/admin/loops" className={pillCls(view === 'tower')}>
          Tower
        </Link>
        <Link href="/admin/loops?view=wiring" className={pillCls(view === 'wiring')}>
          Wiring
        </Link>
        <Link
          // Keep the applied member set in the pill so re-clicking it (or
          // refreshing) never drops a CAC's selection.
          href={
            clusterSelected.length > 0
              ? `/admin/loops?view=cluster&inst=${clusterSelected.join(',')}`
              : '/admin/loops?view=cluster'
          }
          className={pillCls(view === 'cluster')}
        >
          Cluster
        </Link>
      </div>

      {view === 'wiring' ? (
        <LoopWiring registry={registry} edges={edges} audits={audits} conflicts={conflicts} />
      ) : view === 'cluster' ? (
        <ClusterLens
          institutions={clusterInstitutions}
          presets={clusterPresets}
          selectedIds={clusterSelected}
          signals={clusterSignals}
          windowDays={CLUSTER_WINDOW_DAYS}
          asOf={asOf}
        />
      ) : (
        <>
          {/* The Director's own pending decisions come FIRST — the Tower shows
              loop health, but this is what is blocked on HIM (phone-first). */}
          <div className="mb-6">
            <WaitingOnDirectorPanel items={waitingItems} />
          </div>
          <div className="mb-6">
            <ProvenGreenStrip
              rows={ownersPanelRows}
              audits={audits}
              openConflicts={conflicts.length}
              simMaxAgeDays={simMaxAgeDays}
              walkMaxAgeDays={walkMaxAgeDays}
            />
          </div>
          <div className="mb-6">
            <LoopTower stats={towerStats} registry={registry} latestAuditByKey={latestAuditByKey} latestSimByKey={latestSimByKey} conflicts={conflicts} />
          </div>
          <LoopControlTower tiers={tiers} summary={summary} asOf={asOf} />
          <div className="mt-6">
            <OwnersPanel rows={ownersPanelRows} />
          </div>
          {/* MetaLoop chartering factory (2026-08-13) — kept separate from the
              proven-green strip wiring above; this is the drafts review queue. */}
          <div className="mt-2 text-right">
            <Link
              href="/admin/loops/charters"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Charter proposals — MetaLoop drafts awaiting sign-off →
            </Link>
          </div>
        </>
      )}
    </ContentLayout>
  );
}
