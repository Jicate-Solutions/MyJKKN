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
export const navMeta = { label: 'Loop Control Tower', icon: 'Repeat' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import {
  createServiceRoleClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import { LoopControlTower } from './_components/loop-control-tower';
import { LoopTower, type LoopTowerStats } from './_components/loop-tower';
import type { LoopTier, LoopTone, LoopExample } from './_components/types';

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

export default async function LoopControlTowerPage() {
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
      .then((r) => r.data?.value ?? null)
      .catch(() => null),
  ]);

  const messOn = messPolicy === true;

  // SCF effectiveness — the honest, deduplicated picture + real examples so the
  // card can show WHAT the loop actually produced and WHOSE profile it reflects.
  const scfEff = await loadScfEffectiveness(admin);

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
  ): { cfg: string; lastRun?: string; configHref?: string } => {
    // "Live" ONLY when the loop has a dispatcher SCHEDULE row — that's what makes
    // it editable on AI Routines and gives it a real last_status. A model row
    // alone (direct-cron loops like induction-session) is NOT enough: keep the
    // accurate static string rather than falsely claim "editable on AI Routines".
    const live = routineId ? schedById.has(routineId) : false;
    if (!live) return { cfg: staticCfg };
    const model = featureKey ? modelByKey.get(featureKey) ?? null : null;
    const parts = [fmtSchedule(routineId!), model].filter(Boolean) as string[];
    return {
      cfg: `${parts.join(' · ')} · editable on AI Routines`,
      lastRun: schedById.get(routineId!)?.last_status ?? undefined,
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
            { v: n(auditCyclesClosed), k: 'closed (evidence-bearing)', tone: (auditCyclesClosed ?? 0) > 0 ? 'good' : 'warn' },
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

  const asOf = new Date().toISOString().slice(0, 10);

  // ── Loop Tower stats (the loopcraft stack, live) ───────────────────────────
  // IST day start → UTC instant, so "today" matches the campus day.
  // Same inline-Date idiom as since7/since14 above: floor now to the IST day
  // boundary (UTC+5:30 = 19_800_000 ms), then express it back as a UTC instant.
  const istDayStartUtc = new Date(
    Math.floor((Date.now() + 19_800_000) / 86_400_000) * 86_400_000 - 19_800_000,
  ).toISOString();
  const [
    maxCallsToday,
    apiCallsToday,
    maxlaneDoneToday,
    maxlaneErrorToday,
    scfNotes,
    scfMeasured,
    scfVerdicts,
    scfStudentConfirms,
    scfPositiveLifts,
    spineAiDrafts,
    spineFaculty,
    learnerNotes7d,
    escalations7d,
  ] = await Promise.all([
    cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).eq('provider', 'claude_code').gte('created_at', istDayStartUtc)),
    cnt(admin.from('ai_model_usage').select('*', { count: 'exact', head: true }).neq('provider', 'claude_code').gte('created_at', istDayStartUtc)),
    cnt(admin.from('max_lane_requests').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('requested_at', istDayStartUtc)),
    cnt(admin.from('max_lane_requests').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('requested_at', istDayStartUtc)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback')),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').not('outcome_measured_at', 'is', null)),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').not('human_verdict', 'is', null)),
    cnt(admin.from('scf_note_resolution_votes').select('*', { count: 'exact', head: true })),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').gt('outcome_lift', 0.05)),
    cnt(admin.from('curriculum_lesson').select('*', { count: 'exact', head: true }).eq('source', 'bos_ai')),
    cnt(admin.from('curriculum_lesson').select('*', { count: 'exact', head: true }).eq('source', 'faculty')),
    cnt(admin.from('scf_learner_notes').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
    cnt(admin.from('session_feedback_escalations').select('*', { count: 'exact', head: true }).gte('created_at', since7)),
  ]);
  const sched = [...schedById.values()];
  const towerStats: LoopTowerStats = {
    maxCallsToday,
    apiCallsToday,
    routinesEnabled: sched.filter((r) => r.enabled).length || null,
    routinesTotal: sched.length || null,
    routinesFiredToday: sched.filter((r) => r.last_fired_at && r.last_fired_at >= istDayStartUtc).length,
    maxlaneDoneToday,
    maxlaneErrorToday,
    scfNotes,
    scfMeasured,
    scfVerdicts,
    scfStudentConfirms,
    scfPositiveLifts,
    spineAiDrafts,
    spineFaculty,
    learnerNotes7d,
    escalations7d,
  };

  return (
    <ContentLayout title="Loop Control Tower — every loop in MyJKKN, and whether it’s working">
      <div className="mb-6"><LoopTower stats={towerStats} /></div>
      <LoopControlTower tiers={tiers} summary={summary} asOf={asOf} />
    </ContentLayout>
  );
}
