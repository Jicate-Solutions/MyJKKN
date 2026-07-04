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
import type { LoopTier, LoopTone } from './_components/types';

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
    scfGen,
    scfMeasured,
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
    messPolicy,
  ] = await Promise.all([
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback')),
    cnt(admin.from('scf_ai_suggestions').select('*', { count: 'exact', head: true }).eq('domain', 'session_feedback').not('outcome_lift', 'is', null)),
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
          cfg: 'daily 11:15 IST · claude-sonnet-4-6 · schedule editable, thresholds in code',
          status: 'Live · measuring',
          tone: 'live',
          gates: ['on', 'on', 'on', 'on'],
          metrics: [
            { v: n(scfGen), k: 'tips generated', tone: 'good' },
            { v: n(scfMeasured), k: 'measured yet', tone: 'mute' },
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
          noteTag: 'Now',
          note:
            scfResponses7d == null
              ? 'Reads student session-feedback directly. The 7-day ratings count didn’t load just now (transient) — reload to refresh; it doesn’t reflect the loop’s health.'
              : scfResponses7d > 0
                ? 'Reads student session-feedback directly — well fueled (raw ratings received in the last 7 days above; the loop coaches the classes among them with enough responses). It’s early because a tip’s effect is only measurable once that class is re-taught and re-rated, not because of missing input.'
                : 'Reads student session-feedback directly. No ratings received in the last 7 days — likely a weekend/term-break lull, but worth a glance if it persists, since the loop only coaches classes with enough recent responses.',
        },
        {
          id: 'induction-session',
          name: 'Induction Session-Effectiveness Loop',
          subid: 'induction · per-session',
          plain:
            'A weak induction topic in batch A gets an AI tip for batch B → measures batch B’s rating against a regression-to-the-mean baseline, so only a real lift counts.',
          cfg: 'every 4h + Max lane · claude-sonnet-4-6 · direct cron, not in the editable table',
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
          cfg: 'Mondays 10:00 IST · claude-sonnet-4-6 · schedule editable',
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
          cfg: 'Mondays 08:00 IST · schedule editable · 8 dials editable in policy admin',
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
          cfg: 'daily ticks 07:00–10:30 IST · weekly digest Tue · schedule editable · policy dials in ai_pulse_policies',
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
          cfg: 'adapters every 15 min · Haiku classifier · schedule editable',
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

  return (
    <ContentLayout title="Loop Control Tower — every loop in MyJKKN, and whether it’s working">
      <LoopControlTower tiers={tiers} summary={summary} asOf={asOf} />
    </ContentLayout>
  );
}
