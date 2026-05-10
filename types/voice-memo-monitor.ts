// Shared types for the voice memo monitor surface.
// Consumed by lib/services/admission/voice-memo-monitor-service.ts (server)
// and app/(routes)/admission/counselors/voice-memos/page.tsx (client) — Phase 2.

export type MemoAnalyzeStatus =
  | 'pending'
  | 'transcribing'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'rejected_non_english';

export interface VoiceMemoMonitorPolicy {
  window_hours: number;
  stuck_threshold_minutes: number;
  failure_rate_red_pct: number;
  failure_rate_amber_pct: number;
  recent_rows_limit: number;
  refresh_interval_seconds: number;
  cost_alert_daily_inr: number;
  director_digest_categories: Record<string, string[]>;
}

export interface MemoCounters {
  uploaded: number;
  pending: number;
  transcribing: number;
  analyzing: number;
  completed: number;
  failed: number;
  rejected_non_english: number;
  failure_rate_pct: number; // 0-100
  status_color: 'green' | 'amber' | 'red'; // computed from failure_rate vs thresholds
}

export interface CronHeartbeat {
  last_completed_at: string | null; // ISO string of most recent memo with memo_analyzed_at NOT NULL
  minutes_since_last: number | null;
  has_stuck_rows: boolean; // true if any memo > stuck_threshold_minutes in pending|transcribing
  stuck_count: number;
}

export interface RecentFailure {
  id: string;
  lead_id: string | null;
  call_sid: string;
  memo_audio_url: string;
  memo_analyze_status: MemoAnalyzeStatus;
  memo_transcript_language: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecentCompletion {
  id: string;
  lead_id: string | null;
  call_sid: string;
  memo_summary: string | null;
  memo_sentiment: string | null;
  memo_sentiment_score: number | null;
  memo_categories: string[] | null;
  memo_transcript_language: string | null;
  memo_analyzed_at: string;
}

export interface CostRollup {
  today_inr: number; // 0 if ai_model_usage table missing — fail-soft
  today_calls: number; // count of usage rows
  alert_active: boolean; // today_inr > policy.cost_alert_daily_inr
}

export interface DirectorDigest {
  bucket_counts: Record<string, number>; // { interested: 12, concerned: 4, neutral: 7 }
}

export interface VoiceMemoMonitorSnapshot {
  policy: VoiceMemoMonitorPolicy;
  counters: MemoCounters;
  cron: CronHeartbeat;
  recent_failures: RecentFailure[];
  recent_completions: RecentCompletion[];
  cost: CostRollup;
  digest: DirectorDigest;
  generated_at: string; // ISO of when snapshot was computed
}
