'use client';

// ════════════════════════════════════════════════════════════════════════════
// LeadVoiceJourney
// Longitudinal view of every voice memo recorded for a single lead. Solves the
// Einstein/Darwin synthesis gap surfaced 2026-05-10 — counsellors with N memos
// for one lead were seeing N disconnected cards instead of a journey arc.
//
// Three things this view adds on top of the per-call <VoiceMemoPanel>:
//   1. Trajectory line     — plain-English summary of the arc (e.g. "5 memos
//                            across 18 days — started enthusiastic, now silent").
//   2. Recurring themes    — categories that appear in ≥2 memos with counts
//                            (e.g. "hostel fees — 4 of 5 memos"). Surfaces the
//                            pattern the lead keeps coming back to.
//   3. Sentiment timeline  — chronological list with a colour-coded marker per
//                            call. Same sentiment buckets as voice-memo-panel.tsx
//                            so they read consistently across surfaces.
//
// Data source — useLeadCallLogs (same hook the Calls tab uses) so the row
// shape is identical to <CallHistoryCard>'s. Filters to memos only (any call
// with a memo_audio_url OR memo_transcript OR memo_analyze_status), sorted
// chronologically ascending.
// ════════════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadCallLogs } from '@/hooks/admission';
import {
  AlertCircle,
  ExternalLink,
  Frown,
  Meh,
  Mic,
  Smile,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────
// Sentiment classification — keep in sync with voice-memo-panel.tsx so the
// per-call badge and the journey marker agree on what "concerned" means.
// ────────────────────────────────────────────────────────────────────────

type SentimentBucket = 'positive' | 'concerned' | 'hostile' | 'neutral';

function classifySentiment(s: string | null | undefined): SentimentBucket {
  const lower = (s || '').toLowerCase();
  if (['positive', 'happy', 'enthusiastic', 'interested'].includes(lower)) return 'positive';
  if (['concerned', 'anxious'].includes(lower)) return 'concerned';
  if (['negative', 'angry', 'frustrated', 'hostile'].includes(lower)) return 'hostile';
  return 'neutral';
}

const SENTIMENT_STYLES: Record<SentimentBucket, {
  dotClass: string;
  textClass: string;
  borderClass: string;
  icon: typeof Smile;
  label: string;
}> = {
  positive: {
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-300',
    icon: Smile,
    label: 'Positive',
  },
  concerned: {
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-300',
    icon: AlertCircle,
    label: 'Concerned',
  },
  hostile: {
    dotClass: 'bg-red-500',
    textClass: 'text-red-700',
    borderClass: 'border-red-300',
    icon: Frown,
    label: 'Hostile',
  },
  neutral: {
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300',
    icon: Meh,
    label: 'Neutral',
  },
};

// ────────────────────────────────────────────────────────────────────────
// Pattern aggregation — count categories that appear in ≥2 completed memos
// to surface the theme the lead keeps returning to. We dedupe categories
// per memo first so a memo that mentions "hostel fees" three times only
// counts once toward the recurrence tally.
// ────────────────────────────────────────────────────────────────────────

interface PatternFinding {
  category: string;
  count: number;
  totalMemos: number;
}

function aggregatePatterns(logs: CallLogLike[]): PatternFinding[] {
  const completed = logs.filter(
    (l) =>
      l.memo_analyze_status === 'completed' &&
      Array.isArray(l.memo_categories) &&
      l.memo_categories.length > 0,
  );
  if (completed.length < 2) return [];

  const counter = new Map<string, number>();
  for (const memo of completed) {
    const seen = new Set<string>();
    for (const cat of memo.memo_categories ?? []) {
      const key = String(cat).toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        counter.set(key, (counter.get(key) ?? 0) + 1);
      }
    }
  }

  return Array.from(counter.entries())
    .filter(([, count]) => count >= 2)
    .map(([category, count]) => ({ category, count, totalMemos: completed.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ────────────────────────────────────────────────────────────────────────
// Trajectory line — one-sentence arc summary for the card description.
// Uses first vs last sentiment buckets + count + day-span so the counsellor
// can read the arc at a glance ("started concerned, now positive").
// ────────────────────────────────────────────────────────────────────────

function buildTrajectoryLine(logs: CallLogLike[]): string {
  const memos = logs
    .filter((l) => l.memo_analyze_status === 'completed' && l.memo_sentiment)
    .sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
  if (memos.length === 0) return '';

  if (memos.length === 1) {
    const bucket = classifySentiment(memos[0].memo_sentiment);
    return `Single completed memo — ${bucket}.`;
  }

  const first = memos[0];
  const last = memos[memos.length - 1];
  const firstBucket = classifySentiment(first.memo_sentiment);
  const lastBucket = classifySentiment(last.memo_sentiment);
  const days = Math.max(
    0,
    Math.round(
      (new Date(last.created_at ?? 0).getTime() - new Date(first.created_at ?? 0).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const span = days === 0 ? 'today' : `across ${days} day${days === 1 ? '' : 's'}`;

  if (firstBucket === lastBucket) {
    return `${memos.length} memos ${span} — consistently ${firstBucket}.`;
  }
  return `${memos.length} memos ${span} — started ${firstBucket}, now ${lastBucket}.`;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers

function formatJourneyDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return 'No memo data';
  if (status === 'pending' || status === 'transcribing' || status === 'analyzing') {
    return 'Analysis in progress';
  }
  if (status === 'failed') return 'Analysis failed';
  if (status === 'rejected_non_english') return 'Non-English audio';
  return status;
}

// ────────────────────────────────────────────────────────────────────────
// Row shape — narrow subset of admission_call_logs we touch here. Mirrors
// the shape that <CallHistoryCard> reads from useLeadCallLogs, so any
// schema additions there work here without changes.
// ────────────────────────────────────────────────────────────────────────

interface CallLogLike {
  id: string;
  created_at: string | null;
  memo_audio_url: string | null;
  memo_transcript: string | null;
  memo_summary: string | null;
  memo_sentiment: string | null;
  memo_categories: string[] | null;
  memo_analyze_status: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Component

interface LeadVoiceJourneyProps {
  leadId: string;
  institutionId: string;
}

export function LeadVoiceJourney({ leadId, institutionId }: LeadVoiceJourneyProps) {
  const { logs, isLoading, isError } = useLeadCallLogs(institutionId, leadId);

  const memoLogs = useMemo<CallLogLike[]>(() => {
    if (!logs) return [];
    return (logs as CallLogLike[])
      .filter(
        (l) => l.memo_audio_url || l.memo_transcript || l.memo_analyze_status,
      )
      .sort(
        (a, b) =>
          new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
      );
  }, [logs]);

  const patterns = useMemo(() => aggregatePatterns(memoLogs), [memoLogs]);
  const trajectoryLine = useMemo(() => buildTrajectoryLine(memoLogs), [memoLogs]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Voice Journey
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
          <p>Could not load voice journey for this lead.</p>
        </CardContent>
      </Card>
    );
  }

  if (memoLogs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Voice Journey
          </CardTitle>
          <CardDescription>
            As counsellors record memos for this lead, the trajectory builds here.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Mic className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No voice memos yet</p>
          <p className="text-sm mt-1">
            Record one from a counsellor session and it will appear here automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Voice Journey
        </CardTitle>
        <CardDescription>
          {trajectoryLine ||
            `${memoLogs.length} memo${memoLogs.length === 1 ? '' : 's'} on this lead.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {patterns.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-600 font-medium mb-2">
              <Sparkles className="h-3 w-3" /> Recurring themes
            </div>
            <ul className="space-y-1">
              {patterns.map((p) => (
                <li key={p.category} className="text-sm text-slate-700">
                  <span className="font-medium capitalize">{p.category}</span>{' '}
                  <span className="text-muted-foreground">
                    — {p.count} of {p.totalMemos} memos
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="space-y-4 relative">
          <div
            className="absolute left-2 top-2 bottom-2 w-px bg-slate-200"
            aria-hidden="true"
          />
          {memoLogs.map((memo, idx) => {
            const bucket = classifySentiment(memo.memo_sentiment);
            const styles = SENTIMENT_STYLES[bucket];
            const Icon = styles.icon;
            const status = memo.memo_analyze_status;
            const isCompleted = status === 'completed';
            const callDate = formatJourneyDate(memo.created_at);
            const summary =
              memo.memo_summary || (isCompleted ? null : statusLabel(status));

            return (
              <li key={memo.id} className="relative pl-7">
                <div
                  className={`absolute left-0 top-1.5 h-4 w-4 rounded-full ${styles.dotClass} ring-2 ring-white shadow-sm flex items-center justify-center`}
                  aria-label={`${styles.label} sentiment`}
                >
                  <Icon className="h-2.5 w-2.5 text-white" />
                </div>

                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium">Call {idx + 1}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{callDate}</span>
                  {isCompleted && memo.memo_sentiment && (
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${styles.textClass} ${styles.borderClass}`}
                    >
                      {styles.label}
                    </Badge>
                  )}
                  {!isCompleted && (
                    <Badge variant="outline" className="text-xs">
                      {statusLabel(status)}
                    </Badge>
                  )}
                </div>

                {summary && (
                  <p className="text-sm text-slate-700 mt-1 line-clamp-3">{summary}</p>
                )}

                {Array.isArray(memo.memo_categories) && memo.memo_categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {memo.memo_categories.slice(0, 4).map((c) => (
                      <span
                        key={c}
                        className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded capitalize"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <Link
                  href={`/admission/counselors/calls/${memo.id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1.5"
                >
                  Open call <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
