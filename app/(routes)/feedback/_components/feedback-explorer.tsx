'use client';

/**
 * FeedbackExplorer — the "show every damn thing" panel of the super-cockpit.
 *
 * A searchable, paginated table of EVERY feedback_events row (RLS-scoped via the
 * browser client; super-admin sees all). Lets management drill into the full raw
 * feedback: content search, sentiment filter, and per-row expansion revealing the
 * full content + the AI draft reply.
 *
 * Self-fetching: reacts to the shared SuperFilters prop plus its own local
 * search / sentiment / pagination state. Institution names are resolved here via
 * a one-shot institutions(id, name) lookup, because the contract's
 * FeedbackEventDetail carries only institution_id.
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  fetchFeedbackExplorer,
  type SuperFilters,
  type FeedbackEventDetail,
} from '@/lib/services/feedback/super-cockpit-service';
import type { FeedbackSource, AiSentiment } from '@/lib/types/feedback-spine';

const supabase = createClientSupabaseClient();

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;
const TABLE_COLS = 8;

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

const SENTIMENT_FILTERS: Array<{ value: AiSentiment | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'mixed', label: 'Mixed' },
];

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}, ${d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function shortId(id: string | null): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function SentimentBadge({ sentiment }: { sentiment: AiSentiment | null }) {
  if (!sentiment) {
    return (
      <Badge
        variant="outline"
        className="text-xs font-normal bg-muted/40 text-muted-foreground/70 border-dashed"
      >
        unclassified
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`text-xs font-normal ${SENTIMENT_CLASSES[sentiment]}`}
    >
      {sentiment}
    </Badge>
  );
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
          Copy draft reply
        </>
      )}
    </Button>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: TABLE_COLS }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface FeedbackExplorerProps {
  filters: SuperFilters;
}

export function FeedbackExplorer({ filters }: FeedbackExplorerProps) {
  const { source, hideSpam, institutionId } = filters;

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sentiment, setSentiment] = useState<AiSentiment | 'all'>('all');
  const [offset, setOffset] = useState(0);

  const [result, setResult] = useState<{ rows: FeedbackEventDetail[]; total: number } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [instMap, setInstMap] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const reqRef = useRef(0);

  // Debounce the search box so we don't fire a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Whenever the effective query narrows/changes, jump back to the first page.
  useEffect(() => {
    setOffset(0);
  }, [source, hideSpam, institutionId, debouncedSearch, sentiment]);

  // One-shot institution id → name map (super-admin sees all; RLS scopes others).
  useEffect(() => {
    let active = true;
    void supabase
      .from('institutions')
      .select('id, name')
      .then(({ data }) => {
        if (!active || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as Array<{ id: string; name: string | null }>) {
          if (row.name) map[row.id] = row.name;
        }
        setInstMap(map);
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch the page. A request-id guard drops stale/out-of-order responses.
  useEffect(() => {
    const reqId = ++reqRef.current;
    setIsLoading(true);
    setError(null);
    void fetchFeedbackExplorer(
      { source, hideSpam, institutionId },
      {
        search: debouncedSearch.trim() || undefined,
        sentiment,
        limit: PAGE_SIZE,
        offset,
      },
    )
      .then((res) => {
        if (reqRef.current !== reqId) return;
        setResult(res);
        setExpanded(new Set());
      })
      .catch((err: unknown) => {
        if (reqRef.current !== reqId) return;
        setError(err instanceof Error ? err.message : 'Failed to load feedback events.');
        setResult(null);
      })
      .finally(() => {
        if (reqRef.current === reqId) setIsLoading(false);
      });
  }, [source, hideSpam, institutionId, debouncedSearch, sentiment, offset]);

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasActiveQuery =
    debouncedSearch.trim() !== '' ||
    sentiment !== 'all' ||
    source !== 'all' ||
    Boolean(institutionId);

  const institutionName = (id: string | null): string => {
    if (!id) return '—';
    return instMap[id] ?? shortId(id);
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Full Feedback Explorer</CardTitle>
        <CardDescription className="text-xs">
          Every captured feedback event — searchable and paginated. Expand a row to
          read the full content and its AI draft reply. This is the raw record; noise
          and genuine institutional voice are both present here.
        </CardDescription>

        {/* Controls: search + sentiment filter */}
        <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search content…"
              className="h-8 pl-8 text-xs"
              aria-label="Search feedback content"
            />
          </div>

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Sentiment filter"
          >
            {SENTIMENT_FILTERS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={sentiment === opt.value ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setSentiment(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? (
          <div className="px-4 py-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Institution</th>
                  <th className="px-3 py-2 font-medium">Content</th>
                  <th className="px-3 py-2 font-medium">Sentiment</th>
                  <th className="px-3 py-2 font-medium">Intent</th>
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">When</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                <SkeletonRows />
              </tbody>
            </table>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {hasActiveQuery
              ? 'No matches for your search / filters.'
              : 'No feedback events found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Institution</th>
                  <th className="px-3 py-2 font-medium min-w-[220px]">Content</th>
                  <th className="px-3 py-2 font-medium">Sentiment</th>
                  <th className="px-3 py-2 font-medium">Intent</th>
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">When</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = expanded.has(row.id);
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleRow(row.id)}
                      >
                        <td className="px-3 py-3 whitespace-nowrap align-top">
                          <Badge variant="outline" className="text-xs font-normal">
                            {SOURCE_LABELS[row.source] ?? row.source}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 align-top max-w-[140px]">
                          <span
                            className="text-xs text-muted-foreground truncate block"
                            title={row.institution_id ?? undefined}
                          >
                            {institutionName(row.institution_id)}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top max-w-[280px]">
                          <p
                            className={`text-xs leading-relaxed ${
                              isOpen ? '' : 'line-clamp-2'
                            }`}
                          >
                            {row.content ?? (
                              <span className="text-muted-foreground/40">(no content)</span>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap align-top">
                          <SentimentBadge sentiment={row.ai_sentiment} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap align-top">
                          {row.ai_intent ? (
                            <span className="text-xs text-muted-foreground">
                              {row.ai_intent}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top max-w-[140px]">
                          {row.ai_topic ? (
                            <span
                              className="text-xs text-muted-foreground truncate block"
                              title={row.ai_topic}
                            >
                              {row.ai_topic}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap align-top text-xs text-muted-foreground tabular-nums">
                          {formatWhen(row.occurred_at)}
                        </td>
                        <td className="px-3 py-3 align-top text-muted-foreground">
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={TABLE_COLS} className="px-4 py-4">
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Full content
                                </p>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                  {row.content ?? (
                                    <span className="text-muted-foreground/50">
                                      (no content)
                                    </span>
                                  )}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  From:{' '}
                                  <span className="text-foreground">
                                    {row.actor_ref ?? '—'}
                                  </span>
                                </span>
                                <span>
                                  Target:{' '}
                                  <span className="font-mono text-foreground">
                                    {row.target_ref ?? '—'}
                                  </span>
                                </span>
                                <span>
                                  Rating:{' '}
                                  <span className="text-foreground">
                                    {row.rating ?? '—'}
                                  </span>
                                </span>
                                <span>
                                  Institution:{' '}
                                  <span className="text-foreground">
                                    {institutionName(row.institution_id)}
                                  </span>
                                </span>
                              </div>

                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  AI draft reply
                                </p>
                                {row.ai_draft_reply ? (
                                  <div
                                    className="space-y-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                                      {row.ai_draft_reply}
                                    </p>
                                    <CopyDraftButton draft={row.ai_draft_reply} />
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground/50">
                                    No draft reply generated for this event.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Pagination */}
      {!error && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {isLoading && !result
              ? 'Loading…'
              : total === 0
                ? 'No events'
                : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={!hasPrev || isLoading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={!hasNext || isLoading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
