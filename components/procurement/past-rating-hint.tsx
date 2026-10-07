'use client';

// Under a request line: how this item went last time, from requesters' ratings.
// "Last bought: Vendor · ★4.2 (6)" and, if any vendor/brand did badly, an amber warning
// with the latest comment (no rater name).

import { AlertTriangle } from 'lucide-react';
import { StarDisplay } from '@/components/ui/star-rating';
import { isPoorItemRating, rawAverage } from '@/lib/procurement/vendor-history';
import type { ItemVendorRating } from '@/types/procurement';

export function PastRatingHint({ ratings }: { ratings: ItemVendorRating[] }) {
  if (ratings.length === 0) return null;
  const label = (r: ItemVendorRating) => [r.supplier_name, r.manufacturer].filter(Boolean).join(' / ');
  const latest = [...ratings].sort((a, b) => b.last_rated_at.localeCompare(a.last_rated_at))[0];
  const poor = ratings.filter((r) => isPoorItemRating(r));

  return (
    <div className="space-y-0.5 text-xs">
      <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
        Last bought: {label(latest)} · <StarDisplay value={rawAverage(latest)} count={Number(latest.star_n)} className="text-xs" />
      </p>
      {poor.map((r) => (
        <p key={`${r.supplier_id}-${r.manufacturer ?? ''}`} className="flex items-start gap-1 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {label(r)}: {rawAverage(r)}★ from {Number(r.star_n)} rating{Number(r.star_n) === 1 ? '' : 's'}
            {Number(r.meets_no) > 0 ? ', not to spec' : ''}
            {r.latest_comment ? ` — “${r.latest_comment}”` : ''}
          </span>
        </p>
      ))}
    </div>
  );
}
