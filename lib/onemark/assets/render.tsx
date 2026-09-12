'use client';

// File: lib/onemark/assets/render.tsx
//
// OneMark Wave 3 Lane D — <QuestionAsset>, the picture that belongs to a
// one-mark question, as a learner sees it on screen.
//
// Lane L owns the practice runner. This component is the whole contract
// between the two lanes: drop
//
//     <QuestionAsset itemId={current.id} />
//
// between the stem and the options and nothing else changes. It renders
// NOTHING (returns null) for a question with no picture, so the runner is safe
// to ship before any diagram exists.
//
// RULING #11, and it is the reason this component exists rather than a bare
// <img>: when a picture will not load the learner sees THE ALT TEXT and a
// Retry control, and the clock keeps running. There is no free skip and no
// automatic extra time — a broken image is not a reason to stop the sitting,
// and the alt text is written precisely so the question can still be answered.
//
// Reads are private: the API hands back 60-second signed URLs, never a public
// object URL, so a link copied out of the page is dead within the minute.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface QuestionAssetRow {
  id: string;
  asset_type: string;
  alt_text: string | null;
  sort_order: number;
  url: string | null;
}

type LoadState = 'loading' | 'ready' | 'failed';

export interface QuestionAssetProps {
  /** fp_items.id of the question on screen. */
  itemId: string | null | undefined;
  className?: string;
  /** Test seam — production callers leave this undefined. */
  fetcher?: (itemId: string) => Promise<QuestionAssetRow[]>;
}

async function defaultFetcher(itemId: string): Promise<QuestionAssetRow[]> {
  const res = await fetch(`/api/foundation/onemark/assets?item_id=${encodeURIComponent(itemId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`assets ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.assets) ? (body.assets as QuestionAssetRow[]) : [];
}

/** Only rows that are actually a picture; a katex_block renders as notation in
 *  the stem itself and has no object to fetch. */
export function pictureAssets(rows: QuestionAssetRow[]): QuestionAssetRow[] {
  return rows
    .filter((r) => r.asset_type !== 'katex_block')
    .sort((a, b) => (a.sort_order ?? 1) - (b.sort_order ?? 1));
}

export function QuestionAsset({ itemId, className, fetcher }: QuestionAssetProps) {
  const [rows, setRows] = useState<QuestionAssetRow[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  // Bumping this re-mounts every <img> so a retry re-requests the bytes even
  // when the URL is unchanged.
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const load = fetcher ?? defaultFetcher;
  const liveItem = useRef<string | null>(null);

  const fetchRows = useCallback(
    async (id: string) => {
      setState('loading');
      try {
        const next = await load(id);
        if (liveItem.current !== id) return;
        setRows(pictureAssets(next));
        setBroken({});
        setState('ready');
      } catch {
        if (liveItem.current !== id) return;
        // The list itself failed. There is nothing to describe yet, so the
        // panel offers a retry and stays out of the learner's way otherwise.
        setRows([]);
        setState('failed');
      }
    },
    [load],
  );

  useEffect(() => {
    if (!itemId) {
      liveItem.current = null;
      setRows([]);
      setState('ready');
      return;
    }
    liveItem.current = itemId;
    void fetchRows(itemId);
  }, [itemId, fetchRows]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
    setBroken({});
    if (itemId) void fetchRows(itemId);
  }, [itemId, fetchRows]);

  if (!itemId) return null;

  if (state === 'loading') {
    return (
      <div className={cn('my-4 flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Loading the picture for this question…</span>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <FailedPanel
        className={className}
        description={null}
        onRetry={retry}
        message="The picture for this question did not load."
      />
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className={cn('my-4 space-y-4', className)}>
      {rows.map((row) => {
        const alt = (row.alt_text ?? '').trim();
        if (!row.url || broken[row.id]) {
          return (
            <FailedPanel
              key={row.id}
              description={alt || null}
              onRetry={retry}
              message="This picture did not load."
            />
          );
        }
        return (
          <figure key={`${row.id}-${attempt}`} className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- a 60-second
                signed URL on a private bucket cannot go through the image
                optimiser's remote allowlist. */}
            <img
              src={row.url}
              alt={alt}
              onError={() => setBroken((b) => ({ ...b, [row.id]: true }))}
              className="mx-auto max-h-[420px] w-auto max-w-full rounded-lg border border-border bg-white p-2"
            />
          </figure>
        );
      })}
    </div>
  );
}

function FailedPanel({
  description,
  onRetry,
  message,
  className,
}: {
  description: string | null;
  onRetry: () => void;
  message: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Picture unavailable"
      className={cn(
        'my-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-foreground',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{message}</p>
          {description ? (
            <p className="mt-1 text-muted-foreground">{description}</p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              There is no description saved for it, so answer from the question text.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Your time is still running — this question is not skipped for you.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

export default QuestionAsset;
