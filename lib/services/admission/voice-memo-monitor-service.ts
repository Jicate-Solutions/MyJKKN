import 'server-only';
import { getPolicyInt, getPolicy } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';
import type {
  VoiceMemoMonitorPolicy,
  VoiceMemoMonitorSnapshot,
  MemoCounters,
  CronHeartbeat,
  RecentFailure,
  RecentCompletion,
  CostRollup,
  DirectorDigest,
  MemoAnalyzeStatus,
} from '@/types/voice-memo-monitor';

/**
 * Voice Memo Monitor — server-side aggregation service.
 *
 * Reads the 8-key voice_memo_monitor policy bundle (with safe defaults), then
 * computes a single snapshot off `admission_call_logs.memo_*` columns plus
 * `ai_model_usage` cost rows for the configured rolling window.
 *
 * Consumed by:
 *   - app/api/admission/voice-memo-monitor/snapshot/route.ts (Phase 1)
 *   - app/(routes)/admission/counselors/voice-memos/page.tsx (Phase 2)
 *
 * Companion to lib/services/admission/lead-mood-service.ts — that one is
 * client-bundle safe (anon-key reads); this one is server-only because the
 * cost rollup hits ai_model_usage which is service-role gated.
 */
export class VoiceMemoMonitorService {
  /**
   * Resolves the 8-key policy bundle, falling back to safe defaults when a
   * key is missing (e.g. before the seed migration has run).
   */
  static async getPolicy(): Promise<VoiceMemoMonitorPolicy> {
    const [
      window_hours,
      stuck_threshold_minutes,
      failure_rate_red_pct,
      failure_rate_amber_pct,
      recent_rows_limit,
      refresh_interval_seconds,
      cost_alert_daily_inr,
    ] = await Promise.all([
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_WINDOW_HOURS, 24),
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_STUCK_THRESHOLD_MINUTES, 10),
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_RED_PCT, 20),
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_AMBER_PCT, 5),
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_RECENT_ROWS_LIMIT, 20),
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_REFRESH_INTERVAL_SECONDS, 30),
      getPolicyInt(POLICY_KEYS.VOICE_MEMO_MONITOR_COST_ALERT_DAILY_INR, 100),
    ]);
    const director_digest_categories =
      (await getPolicy<Record<string, string[]>>(
        POLICY_KEYS.VOICE_MEMO_MONITOR_DIRECTOR_DIGEST_CATEGORIES,
      )) ?? {
        interested: ['interested'],
        concerned: ['concerned', 'anxious', 'hostile'],
        neutral: ['neutral'],
      };
    return {
      window_hours,
      stuck_threshold_minutes,
      failure_rate_red_pct,
      failure_rate_amber_pct,
      recent_rows_limit,
      refresh_interval_seconds,
      cost_alert_daily_inr,
      director_digest_categories,
    };
  }

  /**
   * Returns the full snapshot. `supabase` MUST be a service-role client —
   * counters and cost rows would otherwise be filtered by RLS.
   */
  static async getSnapshot(supabase: any): Promise<VoiceMemoMonitorSnapshot> {
    const policy = await this.getPolicy();
    const windowStart = new Date(
      Date.now() - policy.window_hours * 3_600_000,
    ).toISOString();
    const stuckThresholdIso = new Date(
      Date.now() - policy.stuck_threshold_minutes * 60_000,
    ).toISOString();

    // -------------------------------------------------------------------
    // Counters in window
    // -------------------------------------------------------------------
    const { data: rows } = await supabase
      .from('admission_call_logs')
      .select('memo_analyze_status')
      .not('memo_audio_url', 'is', null)
      .gte('updated_at', windowStart);
    const counters = this.computeCounters(rows ?? [], policy);

    // -------------------------------------------------------------------
    // Cron heartbeat — last completed memo + stuck-row count
    // -------------------------------------------------------------------
    const { data: lastDone } = await supabase
      .from('admission_call_logs')
      .select('memo_analyzed_at')
      .not('memo_analyzed_at', 'is', null)
      .order('memo_analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count: stuckCount } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .not('memo_audio_url', 'is', null)
      .in('memo_analyze_status', ['pending', 'transcribing'])
      .lt('updated_at', stuckThresholdIso);
    const lastIso = lastDone?.memo_analyzed_at ?? null;
    const cron: CronHeartbeat = {
      last_completed_at: lastIso,
      minutes_since_last: lastIso
        ? Math.round((Date.now() - new Date(lastIso).getTime()) / 60_000)
        : null,
      has_stuck_rows: (stuckCount ?? 0) > 0,
      stuck_count: stuckCount ?? 0,
    };

    // -------------------------------------------------------------------
    // Recent failures (failed + rejected_non_english) — most recent first
    // -------------------------------------------------------------------
    const { data: failuresRaw } = await supabase
      .from('admission_call_logs')
      .select(
        'id, lead_id, call_sid, memo_audio_url, memo_analyze_status, memo_transcript_language, created_at, updated_at',
      )
      .not('memo_audio_url', 'is', null)
      .in('memo_analyze_status', ['failed', 'rejected_non_english'])
      .order('updated_at', { ascending: false })
      .limit(policy.recent_rows_limit);

    // -------------------------------------------------------------------
    // Recent completions — most recent first
    // -------------------------------------------------------------------
    const { data: completionsRaw } = await supabase
      .from('admission_call_logs')
      .select(
        'id, lead_id, call_sid, memo_summary, memo_sentiment, memo_sentiment_score, memo_categories, memo_transcript_language, memo_analyzed_at',
      )
      .eq('memo_analyze_status', 'completed')
      .order('memo_analyzed_at', { ascending: false })
      .limit(policy.recent_rows_limit);

    // -------------------------------------------------------------------
    // Cost rollup — fail-soft if ai_model_usage table missing
    // -------------------------------------------------------------------
    let cost: CostRollup = { today_inr: 0, today_calls: 0, alert_active: false };
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: usage } = await supabase
        .from('ai_model_usage')
        .select('cost_inr')
        .gte('invoked_at', todayStart.toISOString())
        .like('feature_key', 'voice_memo_%');
      if (usage) {
        const today_inr = usage.reduce(
          (s: number, r: any) => s + (r.cost_inr ?? 0),
          0,
        );
        cost = {
          today_inr,
          today_calls: usage.length,
          alert_active: today_inr > policy.cost_alert_daily_inr,
        };
      }
    } catch {
      // ai_model_usage may not exist on this branch — fail-soft to zeros
    }

    // -------------------------------------------------------------------
    // Director digest — bucket completions by sentiment per policy mapping
    // -------------------------------------------------------------------
    const digest: DirectorDigest = { bucket_counts: {} };
    for (const bucket of Object.keys(policy.director_digest_categories)) {
      digest.bucket_counts[bucket] = 0;
    }
    for (const c of completionsRaw ?? []) {
      const s = (c.memo_sentiment ?? '').toString();
      for (const [bucket, members] of Object.entries(
        policy.director_digest_categories,
      )) {
        if (members.includes(s)) {
          digest.bucket_counts[bucket]++;
          break;
        }
      }
    }

    return {
      policy,
      counters,
      cron,
      recent_failures: (failuresRaw ?? []) as RecentFailure[],
      recent_completions: (completionsRaw ?? []) as RecentCompletion[],
      cost,
      digest,
      generated_at: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private static computeCounters(
    rows: { memo_analyze_status: MemoAnalyzeStatus | null }[],
    policy: VoiceMemoMonitorPolicy,
  ): MemoCounters {
    const c = {
      uploaded: rows.length,
      pending: 0,
      transcribing: 0,
      analyzing: 0,
      completed: 0,
      failed: 0,
      rejected_non_english: 0,
    };
    for (const r of rows) {
      const s = r.memo_analyze_status ?? 'pending';
      if (s in c) (c as any)[s]++;
    }
    const decided = c.completed + c.failed + c.rejected_non_english;
    const failureRate =
      decided === 0
        ? 0
        : Math.round(((c.failed + c.rejected_non_english) / decided) * 100);
    let status_color: 'green' | 'amber' | 'red' = 'green';
    if (failureRate > policy.failure_rate_red_pct) status_color = 'red';
    else if (failureRate > policy.failure_rate_amber_pct) status_color = 'amber';
    return { ...c, failure_rate_pct: failureRate, status_color };
  }
}
