'use client';

// ════════════════════════════════════════════════════════════════════════════
// VoiceMemoPanel
// Surfaces the voice-memo data (audio + transcript + summary + sentiment +
// categories) the new memo pipeline writes to admission_call_logs.memo_*
// columns. Used in two places:
//   1. Lead detail Calls tab — collapsed by default, one panel per call row
//      that has a memo_audio_url.
//   2. Counselor call detail page — expanded by default, in parallel to the
//      legacy <CallIntelligence> panel that reads ExoVoiceAnalyze data.
//
// State machine (matches the analyze-voice-memos cron):
//   pending | transcribing | analyzing → "Analysis in progress…"
//   completed                          → full render
//   failed                             → "Analysis failed" + retake hint
//   rejected_non_english               → "Non-English audio — analysis skipped"
//
// The audio URL is fetched lazily via /api/admission/calls/log/[id]/memo/
// signed-url so we never expose the storage path or service-role key client-
// side. If signing fails, the panel still renders text content.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Frown,
  Loader2,
  MessageSquare,
  Mic,
  Smile,
  Meh,
  Sparkles,
} from 'lucide-react';

export interface VoiceMemoPanelMemo {
  audio_url: string | null;
  audio_duration_seconds: number | null;
  transcript: string | null;
  transcript_language: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  summary: string | null;
  categories: string[] | null;
  analyze_status: string | null;
  analyzed_at: string | null;
}

export interface VoiceMemoPanelProps {
  callLogId: string;
  institutionId: string;
  memo: VoiceMemoPanelMemo;
  /** Calls tab → false (start collapsed). Call detail page → true. */
  defaultExpanded?: boolean;
  /** Optional compact title — defaults to "Voice Memo". */
  title?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers — sentiment + status styling kept inline (presentation-only,
// not policy). Mirrors the shapes used in:
//   - app/(routes)/admission/counselors/calls/[id]/page.tsx (SentimentBadge)
//   - app/(routes)/admission/counselors/voice-memos/_components/recent-completions-table.tsx
// ────────────────────────────────────────────────────────────────────────

function classifySentiment(s: string | null): 'positive' | 'concerned' | 'hostile' | 'neutral' {
  const lower = (s || '').toLowerCase();
  if (['positive', 'happy', 'enthusiastic', 'interested'].includes(lower)) return 'positive';
  if (['concerned', 'anxious'].includes(lower)) return 'concerned';
  if (['negative', 'angry', 'frustrated', 'hostile'].includes(lower)) return 'hostile';
  return 'neutral';
}

function SentimentBadge({ sentiment, score }: { sentiment: string | null; score: number | null }) {
  if (!sentiment && score == null) return null;
  const cls = classifySentiment(sentiment);
  const config: { Icon: React.ElementType; className: string } =
    cls === 'positive'
      ? { Icon: Smile, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      : cls === 'concerned'
      ? { Icon: AlertCircle, className: 'bg-amber-50 text-amber-700 border-amber-200' }
      : cls === 'hostile'
      ? { Icon: Frown, className: 'bg-red-50 text-red-700 border-red-200' }
      : { Icon: Meh, className: 'bg-slate-50 text-slate-700 border-slate-200' };
  return (
    <Badge variant="outline" className={`${config.className} gap-1 capitalize`}>
      <config.Icon className="h-3.5 w-3.5" />
      <span>{sentiment || 'unknown'}</span>
      {typeof score === 'number' && (
        <span className="ml-0.5 text-[10px] font-mono opacity-75">
          ({score.toFixed(2)})
        </span>
      )}
    </Badge>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status || '').toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Queued', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    transcribing: { label: 'Transcribing', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    analyzing: { label: 'Analyzing', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
    rejected_non_english: { label: 'Non-English', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  const cfg = map[s] || { label: status || 'Unknown', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <Badge variant="outline" className={`${cfg.className} text-[10px]`}>
      {cfg.label}
    </Badge>
  );
}

function formatTimestampIST(input: string | null): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function formatDurationSec(s: number | null): string {
  if (s == null || Number.isNaN(s)) return '';
  const sec = Math.round(s);
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────────────────
// Audio player — lazy signed-URL fetch via /api/admission/calls/log/[id]/memo/signed-url
// ────────────────────────────────────────────────────────────────────────

function MemoAudioPlayer({ callLogId }: { callLogId: string }) {
  const { data, isLoading, isError, error } = useQuery<{ url: string; expires_at: string }>({
    queryKey: ['call-memo-signed-url', callLogId],
    queryFn: async () => {
      const res = await fetch(`/api/admission/calls/log/${callLogId}/memo/signed-url`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed to load audio' }));
        throw new Error(body.message || 'Failed to load audio');
      }
      return res.json();
    },
    staleTime: 50 * 60 * 1000, // 50 min — TTL is 1hr, refresh just before expiry
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading audio…
      </div>
    );
  }
  if (isError || !data?.url) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" />
        Audio unavailable {error instanceof Error ? `— ${error.message}` : ''}
      </div>
    );
  }
  return (
    <audio
      controls
      preload="metadata"
      src={data.url}
      className="w-full h-9"
    >
      Your browser does not support audio playback.
    </audio>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────

export function VoiceMemoPanel({
  callLogId,
  institutionId: _institutionId,
  memo,
  defaultExpanded = false,
  title = 'Voice Memo',
}: VoiceMemoPanelProps) {
  // No audio at all → render nothing (graceful no-op for call rows that
  // pre-date the voice-memo feature OR where the counselor skipped recording).
  if (!memo.audio_url) return null;

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  // Reset transcript-collapsed state if memo content changes (e.g., cron
  // catches up while panel is mounted).
  useEffect(() => {
    setShowFullTranscript(false);
  }, [memo.transcript]);

  const status = (memo.analyze_status || 'pending').toLowerCase();
  const isInFlight = status === 'pending' || status === 'transcribing' || status === 'analyzing';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isRejected = status === 'rejected_non_english';

  const transcript = memo.transcript || '';
  const transcriptIsLong = transcript.length > 280;
  const visibleTranscript = showFullTranscript || !transcriptIsLong
    ? transcript
    : transcript.slice(0, 280) + '…';

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Mic className="h-4 w-4" />
          {title}
          <StatusPill status={memo.analyze_status} />
          {memo.audio_duration_seconds != null && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatDurationSec(memo.audio_duration_seconds)}
            </span>
          )}
          {isCompleted && (
            <span className="ml-auto">
              <SentimentBadge sentiment={memo.sentiment} score={memo.sentiment_score} />
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 ml-auto"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Collapse voice memo' : 'Expand voice memo'}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 pt-1">
          {/* Audio always shown when expanded — counselor can listen even
              before AI analysis finishes / if it fails. */}
          <MemoAudioPlayer callLogId={callLogId} />

          {/* In-flight state */}
          {isInFlight && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50/50 border border-blue-100 text-xs">
              <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-900">Analysis in progress…</p>
                <p className="text-muted-foreground mt-0.5">
                  {status === 'pending' && 'Queued for transcription.'}
                  {status === 'transcribing' && 'Whisper is transcribing the audio.'}
                  {status === 'analyzing' && 'Gemini is extracting summary, sentiment, and categories.'}
                </p>
              </div>
            </div>
          )}

          {/* Failed */}
          {isFailed && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50/50 border border-red-100 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-900">Analysis failed</p>
                <p className="text-muted-foreground mt-0.5">
                  The cron will retry automatically on the next sweep. You can still listen to the audio above.
                </p>
              </div>
            </div>
          )}

          {/* Rejected — non-English */}
          {isRejected && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50/50 border border-amber-100 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-900">Non-English audio detected</p>
                <p className="text-muted-foreground mt-0.5">
                  Whisper detected a non-English language
                  {memo.transcript_language ? ` (${memo.transcript_language})` : ''}
                  . AI summary/sentiment was skipped to keep cost predictable.
                </p>
                {transcript && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded bg-white/60 p-2 border">
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{transcript}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Completed — summary + transcript + categories */}
          {isCompleted && (
            <>
              {memo.summary && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Summary
                  </p>
                  <p className="text-sm leading-relaxed">{memo.summary}</p>
                </div>
              )}

              {memo.categories && memo.categories.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Categories
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {memo.categories.map((cat, i) => (
                      <Badge key={`${cat}-${i}`} variant="secondary" className="text-[10px]">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {transcript && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Transcript
                    {memo.transcript_language && (
                      <Badge variant="outline" className="text-[9px] ml-1 px-1.5 py-0">
                        {memo.transcript_language}
                      </Badge>
                    )}
                  </p>
                  <div className="rounded-md border bg-muted/30 p-2.5">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{visibleTranscript}</p>
                    {transcriptIsLong && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 mt-1.5 text-xs"
                        onClick={() => setShowFullTranscript((v) => !v)}
                      >
                        {showFullTranscript ? 'Show less' : 'Show full transcript'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {memo.analyzed_at && (
                <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                  <FileText className="h-2.5 w-2.5" />
                  Analyzed {formatTimestampIST(memo.analyzed_at)}
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
