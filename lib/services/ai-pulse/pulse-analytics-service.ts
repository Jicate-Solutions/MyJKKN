// lib/services/ai-pulse/pulse-analytics-service.ts
// Created: 2026-06-11 — AI Lab Hour SOP Phase V (Pulse Impact read path)
//
// Backs: app/(routes)/ai-pulse/my-pulse/_components/pulse-impact-card.tsx
//        app/(routes)/ai-pulse/admin/cycles/[id]/_components/publication-metrics-card.tsx
// Pairs with: event_submissions (proof_urls containing instagram.com links)
//             → ig_posts (permalink shortcode match) → ig_post_metrics
//             (latest snapshot per post) → ig_accounts.department_id
//             → departments.
// Policies READ at runtime (ai_pulse_policies — never hardcoded):
//   gold_standard_count     — how many top posts the learner card shows
//   ig_reach_threshold      — reach a post must hit to count as "above target"
//   ig_post_deadline_hours  — hours after the session before a post is "late"
//   session_start_time      — anchors the posting deadline to the session
// RLS:  Read-only. event_submissions / event_registrations / ig_* are all
//       RLS-scoped to the caller (institution match or social.instagram.view).
//       Rows the caller cannot see simply don't appear — no privilege bypass.
//
// Pattern reference: lib/services/ai-pulse/policies-service.ts (client service
// shape) + lib/services/ai-pulse/naac-evidence-service.ts (batched joins).

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// Types
// ============================================================================

export interface PulsePublication {
  submission_id: string;
  team_name: string;
  department_name: string;
  /** ig_posts.permalink when matched; otherwise the submitted proof URL. */
  permalink: string;
  /** null = post submitted but metrics not yet synced from Instagram. */
  reach: number | null;
  likes: number | null;
  comments: number | null;
  posted_at: string | null;
  /** null when reach is unknown (metrics not yet synced). */
  threshold_met: boolean | null;
}

export interface PulseTopPublications {
  publications: PulsePublication[];
  /** Live value of the ig_reach_threshold policy — for plain-English copy. */
  reach_threshold: number;
  /** Live value of the gold_standard_count policy (list length cap). */
  limit: number;
}

export interface CyclePublicationMetricsRow extends PulsePublication {
  /** null when the post hasn't been matched/synced yet. */
  deadline_met: boolean | null;
}

export interface CyclePublicationMetrics {
  rows: CyclePublicationMetricsRow[];
  reach_threshold: number;
  deadline_hours: number;
  /** ISO timestamp of session start + deadline_hours; null if cycle has no date. */
  deadline_at: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

const MODULE = 'ai-pulse/analytics';

/** Extract the Instagram shortcode from a post/reel/tv URL, or null. */
export function extractIgShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i.exec(
    url
  );
  return m ? m[1] : null;
}

function isInstagramUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && /instagram\.com\//i.test(url);
}

/**
 * Likes for a metrics snapshot. Prefers the real `likes` column (added
 * 2026-06-10); falls back to the raw JSONB payload which may hold either a
 * plain number/string or a Graph-insights entry object.
 */
function coerceLikes(metric: any): number | null {
  if (typeof metric?.likes === 'number') return metric.likes;
  const rawLikes = metric?.raw?.likes;
  if (typeof rawLikes === 'number') return rawLikes;
  if (typeof rawLikes === 'string') {
    const n = parseInt(rawLikes, 10);
    return Number.isNaN(n) ? null : n;
  }
  const v =
    rawLikes?.values?.[0]?.value ?? rawLikes?.total_value?.value ?? null;
  return typeof v === 'number' ? v : null;
}

/**
 * Posting-deadline anchor = the cycle's session start. Takes the cycle's
 * start_date (fallback demo_date) and applies the session start time
 * (cycle config snapshot → policy → 18:55 default).
 */
function deadlineAnchor(
  cycle: { start_date: string | null; demo_date: string | null; config: any },
  policySessionStart: string
): Date | null {
  const base = cycle.start_date ?? cycle.demo_date;
  if (!base) return null;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return null;
  // Nested-first (cycles now write config.ai_pulse.* per the pre-session
  // hotfix lane), flat fallback for legacy rows, then the policy value.
  const timeStr: string =
    cycle.config?.ai_pulse?.session_start_time ||
    cycle.config?.session_start_time ||
    policySessionStart ||
    '18:55';
  const [h, m] = timeStr.split(':').map((x: string) => parseInt(x, 10));
  if (!Number.isNaN(h)) d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
  return d;
}

/** Sort: reach DESC, unsynced (null reach) rows last. */
function byReachDesc(a: PulsePublication, b: PulsePublication): number {
  if (a.reach === null && b.reach === null) return 0;
  if (a.reach === null) return 1;
  if (b.reach === null) return -1;
  return b.reach - a.reach;
}

// ============================================================================
// Service
// ============================================================================

export class PulseAnalyticsService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Read live policy values by key. Missing/inactive keys → fallback. */
  private static async readPolicies(
    keys: string[]
  ): Promise<Map<string, unknown>> {
    const map = new Map<string, unknown>();
    const { data, error } = await (this.supabase as any)
      .from('ai_pulse_policies')
      .select('config_key, value_jsonb')
      .in('config_key', keys)
      .eq('is_active', true);
    if (error) {
      logger.error(MODULE, 'policy read failed', error);
      return map;
    }
    for (const row of (data ?? []) as any[]) {
      map.set(row.config_key, row.value_jsonb);
    }
    return map;
  }

  private static policyNumber(
    map: Map<string, unknown>,
    key: string,
    fallback: number
  ): number {
    const v = map.get(key);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) return n;
    }
    return fallback;
  }

  /**
   * Shared pipeline: submissions with Instagram proof → matched ig_posts →
   * latest metrics snapshot → department. One row per qualifying submission.
   */
  private static async collectPublications(cycleId: string): Promise<{
    rows: CyclePublicationMetricsRow[];
    reachThreshold: number;
    deadlineHours: number;
    deadlineAt: Date | null;
    goldStandardCount: number;
  }> {
    const supabase = this.supabase as any;

    const policies = await this.readPolicies([
      'gold_standard_count',
      'ig_reach_threshold',
      'ig_post_deadline_hours',
      'session_start_time',
    ]);
    const goldStandardCount = this.policyNumber(
      policies,
      'gold_standard_count',
      2
    );
    const reachThreshold = this.policyNumber(policies, 'ig_reach_threshold', 500);
    const deadlineHours = this.policyNumber(
      policies,
      'ig_post_deadline_hours',
      24
    );
    const policySessionStart =
      typeof policies.get('session_start_time') === 'string'
        ? (policies.get('session_start_time') as string)
        : '18:55';

    // 1. Cycle row — needed for the posting-deadline anchor.
    const { data: cycle, error: cycleErr } = await supabase
      .from('startup_events')
      .select('id, start_date, demo_date, config')
      .eq('id', cycleId)
      .maybeSingle();
    if (cycleErr) {
      logger.error(MODULE, 'cycle read failed', cycleErr);
      throw new Error(cycleErr.message);
    }

    const anchor = cycle ? deadlineAnchor(cycle, policySessionStart) : null;
    const deadlineAt = anchor
      ? new Date(anchor.getTime() + deadlineHours * 3_600_000)
      : null;

    // 2. Submissions for this cycle that carry an Instagram proof URL.
    const { data: subsRaw, error: subsErr } = await supabase
      .from('event_submissions')
      .select('id, registration_id, proof_urls')
      .eq('event_id', cycleId);
    if (subsErr) {
      logger.error(MODULE, 'submissions read failed', subsErr);
      throw new Error(subsErr.message);
    }

    const igSubs = ((subsRaw ?? []) as any[])
      .map((s) => {
        const urls: string[] = Array.isArray(s.proof_urls) ? s.proof_urls : [];
        const igUrl = urls.find(isInstagramUrl) ?? null;
        return igUrl
          ? {
              id: s.id as string,
              registration_id: s.registration_id as string | null,
              ig_url: igUrl,
              shortcode: extractIgShortcode(igUrl),
            }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      registration_id: string | null;
      ig_url: string;
      shortcode: string | null;
    }>;

    if (igSubs.length === 0) {
      return {
        rows: [],
        reachThreshold,
        deadlineHours,
        deadlineAt,
        goldStandardCount,
      };
    }

    // 3. Team names from registrations (batch).
    const regIds = Array.from(
      new Set(igSubs.map((s) => s.registration_id).filter(Boolean))
    ) as string[];
    const teamNameByReg = new Map<string, string>();
    if (regIds.length > 0) {
      const { data: regs } = await supabase
        .from('event_registrations')
        .select('id, team_name')
        .in('id', regIds);
      for (const r of (regs ?? []) as any[]) {
        teamNameByReg.set(r.id, r.team_name ?? '');
      }
    }

    // 4. Match ig_posts by permalink shortcode (one OR-filter batch).
    const shortcodes = Array.from(
      new Set(igSubs.map((s) => s.shortcode).filter(Boolean))
    ) as string[];

    const postByShortcode = new Map<string, any>();
    if (shortcodes.length > 0) {
      const orFilter = shortcodes
        .map((sc) => `permalink.ilike.%/${sc}%`)
        .join(',');
      const { data: posts, error: postsErr } = await supabase
        .from('ig_posts')
        .select('id, account_id, permalink, posted_at')
        .or(orFilter);
      if (postsErr) {
        // Non-fatal — render submissions without metrics.
        logger.warn(MODULE, 'ig_posts match failed', postsErr);
      }
      for (const p of (posts ?? []) as any[]) {
        const sc = extractIgShortcode(p.permalink);
        if (sc) postByShortcode.set(sc, p);
      }
    }

    const matchedPosts = Array.from(postByShortcode.values());
    const postIds = matchedPosts.map((p) => p.id);

    // 5. Latest metrics snapshot per post (likes via column, raw fallback).
    const latestMetricByPost = new Map<string, any>();
    if (postIds.length > 0) {
      const { data: metrics, error: metricsErr } = await supabase
        .from('ig_post_metrics')
        .select('post_id, snapshot_at, reach, comments, likes, raw')
        .in('post_id', postIds)
        .order('snapshot_at', { ascending: false });
      if (metricsErr) {
        logger.warn(MODULE, 'ig_post_metrics read failed', metricsErr);
      }
      for (const m of (metrics ?? []) as any[]) {
        if (!latestMetricByPost.has(m.post_id)) {
          latestMetricByPost.set(m.post_id, m);
        }
      }
    }

    // 6. Department names via ig_accounts.department_id.
    const accountIds = Array.from(
      new Set(matchedPosts.map((p) => p.account_id).filter(Boolean))
    ) as string[];
    const deptIdByAccount = new Map<string, string | null>();
    if (accountIds.length > 0) {
      const { data: accounts } = await supabase
        .from('ig_accounts')
        .select('id, department_id')
        .in('id', accountIds);
      for (const a of (accounts ?? []) as any[]) {
        deptIdByAccount.set(a.id, a.department_id ?? null);
      }
    }

    const deptIds = Array.from(
      new Set(Array.from(deptIdByAccount.values()).filter(Boolean))
    ) as string[];
    const deptNameById = new Map<string, string>();
    if (deptIds.length > 0) {
      const { data: depts } = await supabase
        .from('departments')
        .select('id, department_name, display_name')
        .in('id', deptIds);
      for (const d of (depts ?? []) as any[]) {
        deptNameById.set(d.id, d.display_name || d.department_name || '');
      }
    }

    // 7. Assemble rows — one per Instagram submission.
    const rows: CyclePublicationMetricsRow[] = igSubs.map((sub) => {
      const post = sub.shortcode ? postByShortcode.get(sub.shortcode) : null;
      const metric = post ? latestMetricByPost.get(post.id) : null;
      const deptId = post ? deptIdByAccount.get(post.account_id) ?? null : null;

      const reach =
        metric && typeof metric.reach === 'number' ? metric.reach : null;
      const postedAt: string | null = post?.posted_at ?? null;

      return {
        submission_id: sub.id,
        team_name: sub.registration_id
          ? teamNameByReg.get(sub.registration_id) ?? ''
          : '',
        department_name: deptId ? deptNameById.get(deptId) ?? '' : '',
        permalink: post?.permalink || sub.ig_url,
        reach,
        likes: metric ? coerceLikes(metric) : null,
        comments:
          metric && typeof metric.comments === 'number'
            ? metric.comments
            : null,
        posted_at: postedAt,
        threshold_met: reach === null ? null : reach >= reachThreshold,
        deadline_met:
          postedAt && deadlineAt
            ? new Date(postedAt).getTime() <= deadlineAt.getTime()
            : null,
      };
    });

    rows.sort(byReachDesc);

    return { rows, reachThreshold, deadlineHours, deadlineAt, goldStandardCount };
  }

  /**
   * Top publications for the learner-facing Pulse Impact card.
   * Limit = gold_standard_count policy (live).
   */
  static async getTopPublications(cycleId: string): Promise<PulseTopPublications> {
    const { rows, reachThreshold, goldStandardCount } =
      await this.collectPublications(cycleId);
    return {
      publications: rows.slice(0, Math.max(1, goldStandardCount)),
      reach_threshold: reachThreshold,
      limit: goldStandardCount,
    };
  }

  /** Full per-department metrics table for the admin cycle detail view. */
  static async getCyclePublicationMetrics(
    cycleId: string
  ): Promise<CyclePublicationMetrics> {
    const { rows, reachThreshold, deadlineHours, deadlineAt } =
      await this.collectPublications(cycleId);
    return {
      rows,
      reach_threshold: reachThreshold,
      deadline_hours: deadlineHours,
      deadline_at: deadlineAt ? deadlineAt.toISOString() : null,
    };
  }
}

// ============================================================================
// React Query hooks
// ============================================================================

export function useTopPublications(cycleId: string | null) {
  return useQuery<PulseTopPublications, Error>({
    queryKey: ['ai-pulse', 'pulse-impact', cycleId],
    queryFn: () => PulseAnalyticsService.getTopPublications(cycleId as string),
    enabled: !!cycleId,
    staleTime: 60_000,
  });
}

export function useCyclePublicationMetrics(cycleId: string | null) {
  return useQuery<CyclePublicationMetrics, Error>({
    queryKey: ['ai-pulse', 'publication-metrics', cycleId],
    queryFn: () =>
      PulseAnalyticsService.getCyclePublicationMetrics(cycleId as string),
    enabled: !!cycleId,
    staleTime: 60_000,
  });
}
