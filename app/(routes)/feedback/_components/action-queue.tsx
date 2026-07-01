'use client';

/**
 * ActionQueue — the prioritized list of GENUINE feedback items that need a human
 * decision (a reply). This is the real actionable signal of the super-cockpit:
 * external troll noise is already excluded upstream by fetchActionQueue, so every
 * row here is genuine institutional voice awaiting a response.
 *
 * Self-fetching (props are just the shared SuperFilters). AI draft replies are
 * shown with a "Copy draft" button — there is deliberately NO send button;
 * replies are handled out-of-band, and a human reviews the draft first.
 */

import { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchActionQueue,
  type SuperFilters,
  type ActionItem,
} from '@/lib/services/feedback/super-cockpit-service';
import type { FeedbackSource, AiSentiment } from '@/lib/types/feedback-spine';

interface ActionQueueProps {
  filters: SuperFilters;
}

const SOURCE_LABELS: Record<FeedbackSource, string> = {
  ig_comment: 'Instagram',
  ig_dm: 'IG DM',
  session_feedback: 'Session',
  ai_pulse: 'AI Pulse',
  mess: 'Mess',
  class_feedback: 'Class',
  parent: 'Parent',
  scf_checkin: 'SCF',
};

const SENTIMENT_CLASSES: Record<AiSentiment, string> = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-muted text-muted-foreground border-border',
  negative: 'bg-red-50 text-red-700 border-red-200',
  mixed: 'bg-amber-50 text-amber-700 border-amber-200',
};

const INTENT_CLASSES: Record<string, string> = {
  complaint: 'bg-red-50 text-red-700 border-red-200',
  question: 'bg-blue-50 text-blue-700 border-blue-200',
  request: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  suggestion: 'bg-amber-50 text-amber-700 border-amber-200',
  praise: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function CopyDraftButton({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs h-7"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy draft
        </>
      )}
    </Button>
  );
}

function SkeletonItems() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border-b px-4 py-4 last:border-b-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-3/4" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ActionQueue({ filters }: ActionQueueProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Depend on the primitive filter fields, not the object identity, so parent
  // re-renders that recreate the filters object don't trigger redundant fetches.
  const { source, hideSpam, institutionId } = filters;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchActionQueue({ source, hideSpam, institutionId })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load the action queue.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, hideSpam, institutionId]);

  // Defensive sort: highest priority first (internal complaints > external,
  // recent > old). The backend already orders these, but never trust ordering.
  const ordered = [...items].sort((a, b) => b.priority - a.priority);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Action Queue — Genuine Voice Needing a Reply</CardTitle>
        <CardDescription className="text-xs">
          The real actionable signal. External troll noise is already excluded, so
          every item below is genuine institutional feedback awaiting a decision.
          AI draft replies are shown for convenience — review carefully before
          sending. No send button; replies are handled out-of-band.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <SkeletonItems />
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">
            {error}
          </div>
        ) : ordered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No open items needing a reply — genuine voice is being heard.
          </div>
        ) : (
          <div>
            {ordered.map((item) => (
              <div
                key={item.id}
                className="border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs font-normal">
                      {SOURCE_LABELS[item.source] ?? item.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.institution_name ?? 'Unknown institution'}
                    </span>
                    {item.ai_intent && (
                      <Badge
                        variant="outline"
                        className={`text-xs font-normal ${INTENT_CLASSES[item.ai_intent] ?? ''}`}
                      >
                        {item.ai_intent}
                      </Badge>
                    )}
                    {item.ai_sentiment && (
                      <Badge
                        variant="outline"
                        className={`text-xs font-normal ${SENTIMENT_CLASSES[item.ai_sentiment]}`}
                      >
                        {item.ai_sentiment}
                      </Badge>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground/70">
                    {formatWhen(item.occurred_at)}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed">
                  {item.content ?? '(no content)'}
                </p>

                {item.ai_topic && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Topic: <span className="text-foreground/80">{item.ai_topic}</span>
                  </p>
                )}

                {item.ai_draft_reply ? (
                  <div className="mt-2.5 space-y-1.5 rounded-md border bg-muted/30 p-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      AI draft reply
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/90">
                      {item.ai_draft_reply}
                    </p>
                    <CopyDraftButton draft={item.ai_draft_reply} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground/40">
                    No AI draft reply yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
