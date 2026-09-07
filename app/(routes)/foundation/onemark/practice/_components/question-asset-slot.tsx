'use client';

// OneMark — the diagram slot in the runner (ruling 11).
//
// Physics one-mark questions carry circuits and ray diagrams. Lane D owns the
// upload, the storage bucket and the signed URL, and exports the renderer at
// `lib/onemark/assets/render.tsx`. This is the SEAT that renderer drops into:
// it is null-checked in both directions, so the runner builds and runs today
// with Lane D unmerged (`assets` is simply absent from the question) and gains
// pictures the moment Lane D lands and starts sending them.
//
// RULING 11 — when a diagram will not load, the learner gets its DESCRIPTION
// (the alt text, which Lane D makes mandatory at upload) and a Retry button,
// AND THE CLOCK KEEPS RUNNING. That last part is why the retry lives here and
// not in the runner: nothing in this component touches the sitting, the
// deadline or the answer path. A picture that will not load is a bad minute,
// not a broken paper — and a learner who can read the description can very
// often still answer.

import { useState } from 'react';
import { ImageOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface QuestionAssetRef {
  /** Signed, short-lived URL. Absent while it is still being minted. */
  url?: string | null;
  /** The description the review queue insisted on. Never optional in practice. */
  altText?: string | null;
  assetType?: string | null;
  sortOrder?: number | null;
}

function OneAsset({ asset }: { asset: QuestionAssetRef }) {
  // Bumped on Retry; it is also the cache-buster, so a retry actually re-asks
  // rather than re-reading the same failed response out of the browser cache.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const description = asset.altText?.trim() || 'No description was recorded for this diagram.';

  if (!asset.url || failed) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ImageOff className="h-3.5 w-3.5" />
          The diagram did not load
        </p>
        <p className="text-sm leading-relaxed text-foreground">{description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Your time is still running — answer from the description if you can.
        </p>
        {asset.url && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={attempt === 0 ? asset.url : `${asset.url}${asset.url.includes('?') ? '&' : '?'}r=${attempt}`}
      alt={description}
      onError={() => setFailed(true)}
      className="max-h-80 w-auto max-w-full rounded-xl border border-border bg-background"
    />
  );
}

/** Renders whatever diagrams a question carries, and nothing at all when it
 *  carries none — which is every question until Lane D merges. */
export function QuestionAssetSlot({ assets }: { assets?: QuestionAssetRef[] | null }) {
  const list = Array.isArray(assets) ? assets.filter(Boolean) : [];
  if (list.length === 0) return null;
  return (
    <div className="mb-8 space-y-3">
      {list.map((a, i) => (
        <OneAsset key={`${a.url ?? 'no-url'}-${i}`} asset={a} />
      ))}
    </div>
  );
}
