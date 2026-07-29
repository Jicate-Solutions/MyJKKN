// lib/services/ai-pulse/ai-pulse-pde-bridge-service.ts
// AI Pulse → PDE bridge engine (Lane A).
//
// Bridges AI Pulse participation signals into `pde_demonstrations` rows
// (Tier-4 substrate, migration 20260518_pde_demonstrations_table.sql) per the
// Director lock 2026-05-20. This is SEPARATE from the LEGACY bridge in
// lib/services/pde-bridge-service.ts (pde_learner_capabilities /
// pde_certificates / pde_quest_enrollments) — different sources, same target.
//
// Four signals per cycle (default map below; the live map is the
// `pde_bridge_signal_map` policy row so it stays tunable without a deploy):
//   1. engaged_live_session    — ai_pulse_live_attendance row passing the
//                                4-AND gate → 'embodied', status 'scored',
//                                weighted_score = quiz_score × weight_multiplier
//                                (0.25 default — attendance is worth strictly
//                                less than an artifact; Director 2026-07-10)
//   2. domain_sync_submitted   — event_submissions with text/non-IG proof
//                                → 'problem_finding', status 'submitted'
//   3. gold_selected           — submission id in config.ai_pulse.
//                                gold_selections[*].submission_ids
//                                → 'social_leadership', status 'validated'
//   4. publication_above_target— IG proof URL whose matched ig_post_metrics
//                                reach >= ig_reach_threshold policy
//                                → 'cultural_civic', status 'validated'
//
// Team→learner expansion (signals 2/3/4): event_submissions.registration_id
// → event_team_members (status='accepted') → profile_id, with a
// learners_profiles back-map (profiles.learner_id) for members that only
// carry learner_id. Mirrors rotation-service / learner-service resolution.
//
// IG join (signal 4) mirrors pulse-analytics-service exactly: proof URL →
// shortcode → ig_posts permalink ilike match → latest ig_post_metrics
// snapshot per post.
//
// Idempotency (no new tables): every bridged row's evidence JSONB carries
// { source: 'ai_pulse', source_key: '<cycle_id>:<profile_id>:<signal>' }.
// Before insert we skip any source_key that already exists in
// pde_demonstrations. Safe to re-run arbitrarily often.
//
// Policies READ at runtime (ai_pulse_policies — config mandate, zero
// hardcoded knobs):
//   pde_bridge_signal_map    — per-signal mapping overrides (Lane B seeds)
//   ig_reach_threshold       — reach gate for publication_above_target
//   quiz_pass_threshold_live — quiz_score fallback when quiz_passed missing
//
// Server-side only: callers inject a service-role client (cron route) —
// this file must NOT be imported from client components.
//
// Pattern references: lib/services/pde-bridge-service.ts (idempotency +
// result-shape vocabulary), lib/services/ai-pulse/pulse-analytics-service.ts
// (IG join), lib/services/ai-pulse/rotation-service.ts (member expansion),
// app/api/cron/ai-pulse-tick/route.ts (policy reads).

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  isPresentAtEnd,
  isEngagedFromGates,
} from '@/lib/services/ai-pulse/live-session-service';

const MODULE = 'ai-pulse/pde-bridge';

// ============================================================================
// Types
// ============================================================================

export type AiPulseBridgeSignal =
  | 'engaged_live_session'
  | 'domain_sync_submitted'
  | 'gold_selected'
  | 'publication_above_target';

export const AI_PULSE_BRIDGE_SIGNALS: readonly AiPulseBridgeSignal[] = [
  'engaged_live_session',
  'domain_sync_submitted',
  'gold_selected',
  'publication_above_target',
] as const;

/** The 7 fixed pde_demonstrations categories (CHECK constraint — never add). */
const VALID_CATEGORY_KEYS = new Set([
  'judgment',
  'embodied',
  'problem_finding',
  'accountability',
  'social_leadership',
  'cultural_civic',
  'credential',
]);

const VALID_STATUSES = new Set([
  'draft',
  'submitted',
  'under_review',
  'validated',
  'scored',
  'rejected',
  'withdrawn',
]);

export interface SignalMapEntry {
  category_key: string;
  skill_name: string;
  evidence_type: string;
  status: string;
  /** engaged_live_session only — polls leg of the 4-AND gate. */
  min_polls_responded?: number;
  /**
   * engaged_live_session only — discount applied to `raw_score` (the 0-100
   * quiz score) to produce `weighted_score`. Attending + passing the quiz is
   * worth strictly less than producing an artifact, so this is bounded to
   * [0, 1]: it may only ever shrink the contribution, never inflate it.
   * Director decision 2026-07-10. Tunable via the `pde_bridge_signal_map`
   * policy row — see the validator in resolveSignalMap.
   */
  weight_multiplier?: number;
}

export type SignalMap = Record<AiPulseBridgeSignal, SignalMapEntry>;

/**
 * The locked default mapping (Director contract 2026-05-20 / Lane spec).
 * Lane B ships this same object as the `pde_bridge_signal_map` policy row;
 * the policy value (when present) is merged over these defaults per signal.
 */
export const DEFAULT_SIGNAL_MAP: SignalMap = {
  engaged_live_session: {
    category_key: 'embodied',
    skill_name: 'AI Pulse — Weekly AI Tool Practice',
    evidence_type: 'engagement_record',
    status: 'scored',
    min_polls_responded: 3,
    weight_multiplier: 0.25,
  },
  domain_sync_submitted: {
    category_key: 'problem_finding',
    skill_name: 'AI Pulse — Domain-Sync Artifact',
    evidence_type: 'artifact_link',
    status: 'submitted',
  },
  gold_selected: {
    category_key: 'social_leadership',
    skill_name: 'AI Pulse — Gold Standard (peer training)',
    evidence_type: 'artifact_link',
    status: 'validated',
  },
  publication_above_target: {
    category_key: 'cultural_civic',
    skill_name: 'AI Pulse — Public AI Publication',
    evidence_type: 'artifact_link',
    status: 'validated',
  },
};

export interface SignalCounts {
  found: number;
  inserted: number;
  skipped: number;
}

export interface BridgeCycleResult {
  cycle_id: string;
  per_signal: Record<AiPulseBridgeSignal, SignalCounts>;
  dry_run: boolean;
  errors: string[];
}

export interface BridgeCycleOptions {
  dryRun?: boolean;
}

/** One candidate pde_demonstrations row before idempotency filtering. */
interface DemoCandidate {
  signal: AiPulseBridgeSignal;
  profile_id: string;
  source_key: string;
  category_key: string;
  skill_name: string;
  evidence_type: string;
  status: string;
  evidence: Record<string, unknown>;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
  scored_at: string | null;
  submitted_at: string | null;
  validator_ids: string[] | null;
  /** Preferred institution (e.g. attendance row); profile fallback applies later. */
  institution_id: string | null;
}

interface SubmissionRow {
  id: string;
  registration_id: string | null;
  description: string | null;
  solution_summary: string | null;
  proof_urls: string[] | null;
  submitted_at: string | null;
  created_at: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract the Instagram shortcode from a post/reel/tv URL, or null.
 *  Mirror of pulse-analytics-service.extractIgShortcode. */
function extractIgShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i.exec(
    url
  );
  return m ? m[1] : null;
}

function isInstagramUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && /instagram\.com\//i.test(url);
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/** Merge a (possibly partial / malformed) policy map over the locked defaults. */
export function resolveSignalMap(policyValue: unknown): SignalMap {
  const merged: SignalMap = {
    engaged_live_session: { ...DEFAULT_SIGNAL_MAP.engaged_live_session },
    domain_sync_submitted: { ...DEFAULT_SIGNAL_MAP.domain_sync_submitted },
    gold_selected: { ...DEFAULT_SIGNAL_MAP.gold_selected },
    publication_above_target: { ...DEFAULT_SIGNAL_MAP.publication_above_target },
  };
  if (!policyValue || typeof policyValue !== 'object') return merged;
  const raw = policyValue as Record<string, unknown>;
  for (const signal of AI_PULSE_BRIDGE_SIGNALS) {
    const entry = raw[signal];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const target = merged[signal];
    if (
      typeof e.category_key === 'string' &&
      VALID_CATEGORY_KEYS.has(e.category_key)
    ) {
      target.category_key = e.category_key;
    }
    if (typeof e.skill_name === 'string' && e.skill_name.trim()) {
      target.skill_name = e.skill_name;
    }
    if (typeof e.evidence_type === 'string' && e.evidence_type.trim()) {
      target.evidence_type = e.evidence_type;
    }
    if (typeof e.status === 'string' && VALID_STATUSES.has(e.status)) {
      target.status = e.status;
    }
    if (signal === 'engaged_live_session') {
      const n = asNumber(e.min_polls_responded, NaN);
      if (Number.isFinite(n) && n >= 0) target.min_polls_responded = n;
      // Out-of-range values fall back to the default rather than clamping: a
      // policy row reading `25` is a fat-fingered `0.25`, not a request to
      // award every attendee a full Agency Index.
      const w = asNumber(e.weight_multiplier, NaN);
      if (Number.isFinite(w) && w >= 0 && w <= 1) target.weight_multiplier = w;
    }
  }
  return merged;
}

/**
 * Pure helper (exported for unit-testing the discount without a DB).
 *
 * A missing quiz score stays `null`, never `0`. pde-agency-live-service treats
 * ANY non-null `weighted_score` as a scored demonstration, so a `0` here would
 * suppress its snapshot fallback and pin an engaged-but-unquizzed learner at an
 * Agency Index of zero.
 */
export function engagementWeightedScore(
  quizScore: number | null,
  multiplier: number,
): number | null {
  return quizScore === null ? null : quizScore * multiplier;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ============================================================================
// Service
// ============================================================================

export class AiPulsePdeBridgeService {
  /**
   * Bridge one AI Pulse cycle's participation signals into
   * pde_demonstrations. Idempotent: rows whose evidence source_key already
   * exists are skipped. `dryRun` evaluates + counts without writing.
   */
  static async bridgeCycle(
    supabase: SupabaseClient,
    cycleId: string,
    options: BridgeCycleOptions = {}
  ): Promise<BridgeCycleResult> {
    const sb = supabase as any;
    const dryRun = options.dryRun === true;
    const errors: string[] = [];
    const perSignal: Record<AiPulseBridgeSignal, SignalCounts> = {
      engaged_live_session: { found: 0, inserted: 0, skipped: 0 },
      domain_sync_submitted: { found: 0, inserted: 0, skipped: 0 },
      gold_selected: { found: 0, inserted: 0, skipped: 0 },
      publication_above_target: { found: 0, inserted: 0, skipped: 0 },
    };

    // ---- 0. Policies (config mandate — no hardcoded knobs) ----------------
    const { data: policiesRaw, error: policiesErr } = await sb
      .from('ai_pulse_policies')
      .select('config_key, value_jsonb')
      .in('config_key', [
        'pde_bridge_signal_map',
        'ig_reach_threshold',
        'quiz_pass_threshold_live',
      ])
      .eq('is_active', true);
    if (policiesErr) {
      throw new Error(`ai_pulse_policies read failed: ${policiesErr.message}`);
    }
    const policyByKey = new Map<string, unknown>();
    for (const row of (policiesRaw ?? []) as any[]) {
      policyByKey.set(row.config_key, row.value_jsonb);
    }
    const signalMap = resolveSignalMap(policyByKey.get('pde_bridge_signal_map'));
    const reachThreshold = asNumber(policyByKey.get('ig_reach_threshold'), 500);
    // Fallback 40 mirrors live-session-service (policy seeded 40).
    const quizPassThreshold = asNumber(
      policyByKey.get('quiz_pass_threshold_live'),
      40
    );

    // ---- 1. Cycle row (must be an ai_pulse cycle) --------------------------
    const { data: cycle, error: cycleErr } = await sb
      .from('startup_events')
      .select('id, config')
      .eq('id', cycleId)
      .filter('config->>kind', 'eq', 'ai_pulse')
      .maybeSingle();
    if (cycleErr) {
      throw new Error(`cycle read failed: ${cycleErr.message}`);
    }
    if (!cycle) {
      throw new Error(`cycle ${cycleId} not found or not an ai_pulse cycle`);
    }

    const candidates: DemoCandidate[] = [];

    // ---- 2. Signal 1 — engaged_live_session (4-AND gate) -------------------
    try {
      const entry = signalMap.engaged_live_session;
      const minPolls = entry.min_polls_responded ?? 3;
      const weightMultiplier = entry.weight_multiplier ?? 0.25;
      const { data: attRows, error: attErr } = await sb
        .from('ai_pulse_live_attendance')
        .select('profile_id, institution_id, engagement_signals')
        .eq('event_id', cycleId)
        .eq('day_type', 'live_session');
      if (attErr) throw new Error(attErr.message);

      const nowISO = new Date().toISOString();
      for (const row of (attRows ?? []) as any[]) {
        const sig = (row.engagement_signals ?? {}) as Record<string, unknown>;
        const joinedOk = sig.joined_within_5min === true;
        const pollsOk = asNumber(sig.polls_responded, 0) >= minPolls;
        // Shared present-at-end derivation. No session-end "HH:MM" is read
        // here, so pass null → the heartbeat is unobservable on external
        // meetings and only the live-quiz proxy can satisfy presence (same
        // helper as evaluateGates / heatmap / digest / learner badge).
        const stayedOk = isPresentAtEnd(
          {
            stayed_until:
              typeof sig.stayed_until === 'string'
                ? (sig.stayed_until as string)
                : undefined,
            quiz_score:
              typeof sig.quiz_score === 'number'
                ? (sig.quiz_score as number)
                : undefined,
            quiz_async_makeup: sig.quiz_async_makeup === true,
          },
          null,
        );
        const quizScore =
          typeof sig.quiz_score === 'number' ? sig.quiz_score : null;
        const quizOk =
          sig.quiz_passed === true ||
          (quizScore !== null && quizScore >= quizPassThreshold);
        // Robust 3-of-4 verdict via the shared rule (was a strict 4-AND).
        if (!isEngagedFromGates({ joined: joinedOk, polls: pollsOk, stayed: stayedOk, quiz: quizOk })) continue;
        if (!row.profile_id) continue;

        candidates.push({
          signal: 'engaged_live_session',
          profile_id: row.profile_id,
          source_key: `${cycleId}:${row.profile_id}:engaged_live_session`,
          category_key: entry.category_key,
          skill_name: entry.skill_name,
          evidence_type: entry.evidence_type,
          status: entry.status,
          evidence: {
            source: 'ai_pulse',
            source_key: `${cycleId}:${row.profile_id}:engaged_live_session`,
            signal: 'engaged_live_session',
            cycle_id: cycleId,
            engagement_signals: sig,
          },
          raw_score: quizScore,
          weighted_score: engagementWeightedScore(quizScore, weightMultiplier),
          passed: true,
          scored_at: nowISO,
          submitted_at: null,
          validator_ids: null,
          institution_id: row.institution_id ?? null,
        });
      }
    } catch (e) {
      errors.push(`engaged_live_session: ${(e as Error).message}`);
    }

    // ---- 3. Shared substrate for signals 2/3/4 -----------------------------
    // Submissions for this cycle + accepted team members per registration.
    let submissions: SubmissionRow[] = [];
    const membersByReg = new Map<string, string[]>(); // registration_id → profile ids
    try {
      const { data: subsRaw, error: subsErr } = await sb
        .from('event_submissions')
        .select(
          'id, registration_id, description, solution_summary, proof_urls, submitted_at, created_at'
        )
        .eq('event_id', cycleId);
      if (subsErr) throw new Error(`submissions read: ${subsErr.message}`);
      submissions = (subsRaw ?? []) as SubmissionRow[];

      const regIds = Array.from(
        new Set(submissions.map((s) => s.registration_id).filter(Boolean))
      ) as string[];

      if (regIds.length > 0) {
        const { data: members, error: memErr } = await sb
          .from('event_team_members')
          .select('registration_id, profile_id, learner_id, status')
          .in('registration_id', regIds)
          .eq('status', 'accepted');
        if (memErr) throw new Error(`team members read: ${memErr.message}`);

        // Back-map learner_id → profiles.id for members without profile_id
        // (profiles.learner_id → learners_profiles.id, per auth chain).
        const learnerIdsNeedingMap = Array.from(
          new Set(
            ((members ?? []) as any[])
              .filter((m) => !m.profile_id && m.learner_id)
              .map((m) => m.learner_id as string)
          )
        );
        const profileByLearner = new Map<string, string>();
        if (learnerIdsNeedingMap.length > 0) {
          for (const ids of chunk(learnerIdsNeedingMap, 200)) {
            const { data: profs, error: profErr } = await sb
              .from('profiles')
              .select('id, learner_id')
              .in('learner_id', ids);
            if (profErr) {
              errors.push(`learner back-map: ${profErr.message}`);
              break;
            }
            for (const p of (profs ?? []) as any[]) {
              if (p.learner_id) profileByLearner.set(p.learner_id, p.id);
            }
          }
        }

        for (const m of (members ?? []) as any[]) {
          const pid: string | null =
            m.profile_id ??
            (m.learner_id ? profileByLearner.get(m.learner_id) ?? null : null);
          if (!pid || !m.registration_id) continue;
          const list = membersByReg.get(m.registration_id) ?? [];
          if (!list.includes(pid)) list.push(pid);
          membersByReg.set(m.registration_id, list);
        }
      }
    } catch (e) {
      errors.push(`team expansion: ${(e as Error).message}`);
    }

    const submissionById = new Map<string, SubmissionRow>(
      submissions.map((s) => [s.id, s])
    );

    const memberProfilesFor = (registrationId: string | null): string[] =>
      registrationId ? membersByReg.get(registrationId) ?? [] : [];

    // ---- 4. Signal 2 — domain_sync_submitted -------------------------------
    try {
      const entry = signalMap.domain_sync_submitted;
      for (const sub of submissions) {
        const urls: string[] = Array.isArray(sub.proof_urls)
          ? sub.proof_urls
          : [];
        const hasText =
          (sub.description ?? '').trim().length > 0 ||
          (sub.solution_summary ?? '').trim().length > 0;
        const hasNonIgProof = urls.some((u) => u && !isInstagramUrl(u));
        if (!hasText && !hasNonIgProof) continue;

        const submittedAt =
          sub.submitted_at ?? sub.created_at ?? new Date().toISOString();
        for (const profileId of memberProfilesFor(sub.registration_id)) {
          const sourceKey = `${cycleId}:${profileId}:domain_sync_submitted`;
          candidates.push({
            signal: 'domain_sync_submitted',
            profile_id: profileId,
            source_key: sourceKey,
            category_key: entry.category_key,
            skill_name: entry.skill_name,
            evidence_type: entry.evidence_type,
            status: entry.status,
            evidence: {
              source: 'ai_pulse',
              source_key: sourceKey,
              signal: 'domain_sync_submitted',
              cycle_id: cycleId,
              submission_id: sub.id,
              registration_id: sub.registration_id,
              proof_urls: urls,
            },
            raw_score: null,
            weighted_score: null,
            passed: null,
            scored_at: null,
            submitted_at: submittedAt,
            validator_ids: null,
            institution_id: null,
          });
        }
      }
    } catch (e) {
      errors.push(`domain_sync_submitted: ${(e as Error).message}`);
    }

    // ---- 5. Signal 3 — gold_selected ----------------------------------------
    try {
      const entry = signalMap.gold_selected;
      const aiPulseCfg =
        cycle.config?.ai_pulse && typeof cycle.config.ai_pulse === 'object'
          ? cycle.config.ai_pulse
          : {};
      const selections =
        aiPulseCfg?.gold_selections &&
        typeof aiPulseCfg.gold_selections === 'object'
          ? (aiPulseCfg.gold_selections as Record<string, any>)
          : {};

      for (const deptBucket of Object.values(selections)) {
        const subIds: string[] = Array.isArray(deptBucket?.submission_ids)
          ? deptBucket.submission_ids.filter(
              (x: unknown): x is string => typeof x === 'string' && !!x
            )
          : [];
        const selectedBy: string | null =
          typeof deptBucket?.selected_by === 'string'
            ? deptBucket.selected_by
            : null;
        const scores =
          deptBucket?.scores && typeof deptBucket.scores === 'object'
            ? (deptBucket.scores as Record<string, any>)
            : {};

        for (const subId of subIds) {
          const sub = submissionById.get(subId);
          if (!sub) continue; // selection points outside this cycle's submissions

          // weighted_score = avg(relevance, clarity) × 10 when both present
          // (1–10 rubric → 10–100 scale); null otherwise.
          const s = scores[subId];
          const relevance =
            typeof s?.relevance === 'number' ? s.relevance : null;
          const clarity = typeof s?.clarity === 'number' ? s.clarity : null;
          const weightedScore =
            relevance !== null && clarity !== null
              ? ((relevance + clarity) / 2) * 10
              : null;

          const submittedAt = sub.submitted_at ?? sub.created_at ?? null;
          for (const profileId of memberProfilesFor(sub.registration_id)) {
            const sourceKey = `${cycleId}:${profileId}:gold_selected`;
            candidates.push({
              signal: 'gold_selected',
              profile_id: profileId,
              source_key: sourceKey,
              category_key: entry.category_key,
              skill_name: entry.skill_name,
              evidence_type: entry.evidence_type,
              status: entry.status,
              evidence: {
                source: 'ai_pulse',
                source_key: sourceKey,
                signal: 'gold_selected',
                cycle_id: cycleId,
                submission_id: sub.id,
                registration_id: sub.registration_id,
                scores: s ?? null,
              },
              raw_score: null,
              weighted_score: weightedScore,
              passed: null,
              scored_at: null,
              submitted_at: submittedAt,
              validator_ids: selectedBy ? [selectedBy] : [],
              institution_id: null,
            });
          }
        }
      }
    } catch (e) {
      errors.push(`gold_selected: ${(e as Error).message}`);
    }

    // ---- 6. Signal 4 — publication_above_target ----------------------------
    // Mirror of pulse-analytics-service: proof URL → shortcode → ig_posts
    // permalink match → latest ig_post_metrics snapshot → reach gate.
    try {
      const entry = signalMap.publication_above_target;
      const igSubs = submissions
        .map((s) => {
          const urls: string[] = Array.isArray(s.proof_urls)
            ? s.proof_urls
            : [];
          const igUrl = urls.find(isInstagramUrl) ?? null;
          return igUrl
            ? { sub: s, ig_url: igUrl, shortcode: extractIgShortcode(igUrl) }
            : null;
        })
        .filter(Boolean) as Array<{
        sub: SubmissionRow;
        ig_url: string;
        shortcode: string | null;
      }>;

      const shortcodes = Array.from(
        new Set(igSubs.map((s) => s.shortcode).filter(Boolean))
      ) as string[];

      const postByShortcode = new Map<string, any>();
      if (shortcodes.length > 0) {
        const orFilter = shortcodes
          .map((sc) => `permalink.ilike.%/${sc}%`)
          .join(',');
        const { data: posts, error: postsErr } = await sb
          .from('ig_posts')
          .select('id, permalink, posted_at')
          .or(orFilter);
        if (postsErr) throw new Error(`ig_posts match: ${postsErr.message}`);
        for (const p of (posts ?? []) as any[]) {
          const sc = extractIgShortcode(p.permalink);
          if (sc) postByShortcode.set(sc, p);
        }
      }

      const postIds = Array.from(postByShortcode.values()).map((p) => p.id);
      const latestReachByPost = new Map<string, number>();
      if (postIds.length > 0) {
        const { data: metrics, error: metricsErr } = await sb
          .from('ig_post_metrics')
          .select('post_id, snapshot_at, reach')
          .in('post_id', postIds)
          .order('snapshot_at', { ascending: false });
        if (metricsErr) {
          throw new Error(`ig_post_metrics read: ${metricsErr.message}`);
        }
        for (const m of (metrics ?? []) as any[]) {
          if (
            !latestReachByPost.has(m.post_id) &&
            typeof m.reach === 'number'
          ) {
            latestReachByPost.set(m.post_id, m.reach);
          }
        }
      }

      for (const { sub, ig_url, shortcode } of igSubs) {
        const post = shortcode ? postByShortcode.get(shortcode) : null;
        if (!post) continue;
        const reach = latestReachByPost.get(post.id);
        if (typeof reach !== 'number' || reach < reachThreshold) continue;

        const submittedAt = sub.submitted_at ?? sub.created_at ?? null;
        for (const profileId of memberProfilesFor(sub.registration_id)) {
          const sourceKey = `${cycleId}:${profileId}:publication_above_target`;
          candidates.push({
            signal: 'publication_above_target',
            profile_id: profileId,
            source_key: sourceKey,
            category_key: entry.category_key,
            skill_name: entry.skill_name,
            evidence_type: entry.evidence_type,
            status: entry.status,
            evidence: {
              source: 'ai_pulse',
              source_key: sourceKey,
              signal: 'publication_above_target',
              cycle_id: cycleId,
              submission_id: sub.id,
              registration_id: sub.registration_id,
              ig_url,
              permalink: post.permalink ?? ig_url,
              reach,
              reach_threshold: reachThreshold,
            },
            raw_score: reach,
            weighted_score: null,
            passed: null,
            scored_at: null,
            submitted_at: submittedAt,
            validator_ids: null,
            institution_id: null,
          });
        }
      }
    } catch (e) {
      errors.push(`publication_above_target: ${(e as Error).message}`);
    }

    // ---- 7. In-run dedupe by source_key ------------------------------------
    const bySourceKey = new Map<string, DemoCandidate>();
    for (const c of candidates) {
      if (!bySourceKey.has(c.source_key)) bySourceKey.set(c.source_key, c);
    }
    const deduped = Array.from(bySourceKey.values());
    for (const c of deduped) perSignal[c.signal].found++;

    // ---- 8. Idempotency — skip source_keys already bridged ------------------
    const existingKeys = new Set<string>();
    const allKeys = deduped.map((c) => c.source_key);
    for (const keys of chunk(allKeys, 200)) {
      const { data: existing, error: existErr } = await sb
        .from('pde_demonstrations')
        .select('id, evidence')
        .filter('evidence->>source', 'eq', 'ai_pulse')
        .in('evidence->>source_key', keys);
      if (existErr) {
        // Fail CLOSED: if we cannot verify, do not insert this chunk.
        errors.push(`idempotency check: ${existErr.message}`);
        for (const k of keys) existingKeys.add(k);
        continue;
      }
      for (const row of (existing ?? []) as any[]) {
        const k = row.evidence?.source_key;
        if (typeof k === 'string') existingKeys.add(k);
      }
    }

    const fresh = deduped.filter((c) => !existingKeys.has(c.source_key));
    for (const c of deduped) {
      if (existingKeys.has(c.source_key)) perSignal[c.signal].skipped++;
    }

    // ---- 9. Resolve institution_id (profiles fallback) ----------------------
    const profileIds = Array.from(new Set(fresh.map((c) => c.profile_id)));
    const institutionByProfile = new Map<string, string | null>();
    for (const ids of chunk(profileIds, 200)) {
      const { data: profs, error: profErr } = await sb
        .from('profiles')
        .select('id, institution_id')
        .in('id', ids);
      if (profErr) {
        errors.push(`profiles institution read: ${profErr.message}`);
        continue;
      }
      for (const p of (profs ?? []) as any[]) {
        institutionByProfile.set(p.id, p.institution_id ?? null);
      }
    }

    // ---- 10. Insert (unless dry run) ----------------------------------------
    if (dryRun) {
      for (const c of fresh) perSignal[c.signal].inserted++;
    } else {
      for (const batch of chunk(fresh, 100)) {
        const rows = batch.map((c) => ({
          learner_id: c.profile_id,
          institution_id:
            c.institution_id ??
            institutionByProfile.get(c.profile_id) ??
            null,
          category_key: c.category_key,
          skill_name: c.skill_name,
          evidence: c.evidence,
          evidence_type: c.evidence_type,
          status: c.status,
          submitted_at: c.submitted_at,
          validator_ids: c.validator_ids ?? undefined,
          raw_score: c.raw_score,
          weighted_score: c.weighted_score,
          passed: c.passed,
          scored_at: c.scored_at,
          created_by: null,
        }));
        const { error: insertErr } = await sb
          .from('pde_demonstrations')
          .insert(rows);
        if (insertErr) {
          errors.push(`insert batch: ${insertErr.message}`);
          continue;
        }
        for (const c of batch) perSignal[c.signal].inserted++;
      }
    }

    const result: BridgeCycleResult = {
      cycle_id: cycleId,
      per_signal: perSignal,
      dry_run: dryRun,
      errors,
    };

    if (errors.length > 0) {
      logger.warn(MODULE, 'bridgeCycle completed with errors', result);
    } else {
      logger.info(MODULE, 'bridgeCycle completed', result);
    }

    return result;
  }
}
