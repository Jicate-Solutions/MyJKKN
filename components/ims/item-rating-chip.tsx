'use client';

// "★ 4.2 (6)" beside an item name; tap for the last few ratings. Nothing shown until rated.

import { Star } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StarDisplay } from '@/components/ui/star-rating';
import { formatDateDMY } from '@/lib/utils/date-format';
import { useImsRecentItemRatings } from '@/hooks/ims/use-ims-item-ratings';
import type { ImsItemRatingSummary } from '@/lib/services/ims/item-rating-service';
import { useState } from 'react';

export function ItemRatingChip({ itemId, summary }: { itemId: string; summary: ImsItemRatingSummary | undefined }) {
  const [open, setOpen] = useState(false);
  const { data: recent = [] } = useImsRecentItemRatings(itemId, open);
  if (!summary || summary.star_n === 0) return null;
  const avg = summary.star_sum / summary.star_n;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Rating ${avg.toFixed(1)} from ${summary.star_n} ratings`}
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-50 px-1.5 py-px text-[10px] font-semibold leading-4 tabular-nums text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-hidden />
          {avg.toFixed(1)} ({summary.star_n})
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 text-xs">
        <p className="mb-2 text-sm font-semibold">Last ratings</p>
        {summary.meets_no > 0 && (
          <p className="mb-2 text-destructive">{summary.meets_no} reported not to spec</p>
        )}
        <ul className="space-y-2">
          {recent.map((r, i) => (
            <li key={i}>
              <div className="flex items-center justify-between gap-2">
                <StarDisplay value={r.stars} />
                <span className="truncate text-muted-foreground">
                  {r.supplier_name ? `${r.supplier_name} · ` : ''}
                  {r.meets_spec === 'no' ? 'Not to spec' : 'Good'} · {formatDateDMY(r.rated_at)}
                </span>
              </div>
              {r.comment && <p className="mt-0.5 text-muted-foreground">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
