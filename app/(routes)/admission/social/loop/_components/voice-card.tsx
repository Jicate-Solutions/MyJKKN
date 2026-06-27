'use client';

/**
 * VoiceCard — Voice-of-Audience dimension for the Social Loop.
 *
 * Reads the `voice` block from LoopResponse (derived from feedback_events
 * ig_comments matched to the current window's posts) and renders:
 *
 *  - Sentiment bar / pills (positive / neutral / negative / mixed)
 *  - Top themes as chips (spam excluded server-side)
 *  - "N comments needing reply" list — each item shows the draft reply
 *    and a Copy button so the social team can paste it into Instagram
 *  - A muted "N spam/troll comments hidden" line
 *
 * Matches the visual conventions of decide-card.tsx and read-table.tsx:
 *  - Card with subtle border
 *  - Muted labels, foreground values
 *  - No computed logic — all numbers come from the route
 */

import { useState } from 'react';
import { MessageSquare, Copy, Check, AlertCircle } from 'lucide-react';
import type { LoopResponse } from '@/lib/types/social-loop';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type VoiceBlock = NonNullable<LoopResponse['voice']>;

/** Colour mapping for ai_sentiment values. */
function sentimentClass(s: string | null): string {
  switch (s) {
    case 'positive':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'negative':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'mixed':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/** Sentiment bar — proportional segments. */
function SentimentBar({ breakdown, total }: { breakdown: VoiceBlock['sentimentBreakdown']; total: number }) {
  if (total === 0) return null;
  const entries: [string, number][] = [
    ['positive', breakdown.positive],
    ['neutral', breakdown.neutral],
    ['negative', breakdown.negative],
    ['mixed', breakdown.mixed],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];

  return (
    <div className="space-y-2">
      {/* Proportional bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {entries.map(([label, count]) => (
          <div
            key={label}
            style={{ width: `${Math.round((count / total) * 100)}%` }}
            className={
              label === 'positive'
                ? 'bg-green-500'
                : label === 'negative'
                  ? 'bg-red-500'
                  : label === 'mixed'
                    ? 'bg-amber-400'
                    : 'bg-muted-foreground/30'
            }
            title={`${label}: ${count}`}
          />
        ))}
      </div>
      {/* Pills */}
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([label, count]) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sentimentClass(label)}`}
          >
            {label} · {count}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Copy-to-clipboard button — one per needsReply row. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 shrink-0 gap-1 px-2 text-xs"
      title="Copy draft reply"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : 'Copy reply'}
    </Button>
  );
}

export function VoiceCard({ voice }: { voice: VoiceBlock }) {
  // If zero processed comments, show a placeholder rather than empty UI.
  if (voice.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Voice of Audience
          </CardTitle>
          <CardDescription>
            AI-classified comments from this cycle&apos;s posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No classified comments matched the current window yet. Comments are
            ingested and classified via the feedback spine &mdash; check back once the
            classifier has processed some.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasNeedsReply = voice.needsReply.length > 0;
  const hasThemes = voice.topThemes.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Voice of Audience
          <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">
            {voice.total} comment{voice.total !== 1 ? 's' : ''}
          </span>
        </CardTitle>
        <CardDescription>
          What the audience is actually saying — classified by AI from the feedback
          spine.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Sentiment breakdown */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sentiment
          </p>
          <SentimentBar
            breakdown={voice.sentimentBreakdown}
            total={
              voice.sentimentBreakdown.positive +
              voice.sentimentBreakdown.neutral +
              voice.sentimentBreakdown.negative +
              voice.sentimentBreakdown.mixed
            }
          />
        </div>

        {/* Top themes */}
        {hasThemes && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top themes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {voice.topThemes.map((theme) => (
                <Badge key={theme} variant="secondary" className="text-xs font-normal">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Needs-reply list */}
        {hasNeedsReply && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {voice.needsReply.length} comment
              {voice.needsReply.length !== 1 ? 's' : ''} needing reply
            </p>
            <div className="space-y-2">
              {voice.needsReply.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                >
                  {/* Comment content */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="leading-snug text-foreground">{item.content}</p>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {item.ai_sentiment && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sentimentClass(item.ai_sentiment)}`}
                        >
                          {item.ai_sentiment}
                        </span>
                      )}
                      {item.ai_topic && (
                        <span className="text-[10px] text-muted-foreground">
                          {item.ai_topic}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Draft reply */}
                  {item.ai_draft_reply && (
                    <div className="mt-2 flex items-start justify-between gap-2 rounded border-l-2 border-l-primary/30 bg-background pl-2.5 pr-2 py-1.5">
                      <p className="text-xs text-muted-foreground leading-snug italic">
                        {item.ai_draft_reply}
                      </p>
                      <CopyButton text={item.ai_draft_reply} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spam/troll footer — muted */}
        {voice.spamCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {voice.spamCount} spam / troll comment
            {voice.spamCount !== 1 ? 's' : ''} hidden
          </p>
        )}
      </CardContent>
    </Card>
  );
}
