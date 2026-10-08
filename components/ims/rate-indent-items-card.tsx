'use client';

// Requester (lab assistant) rates what they received on a delivered indent.
// A star tap saves straight away; a comment box opens only for 1–2 stars or "Not to spec".
// Feeds the item average and the vendor score (shared pool with Procurement).

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRating, StarDisplay } from '@/components/ui/star-rating';
import { cn } from '@/lib/utils';
import { formatDateDMY } from '@/lib/utils/date-format';
import { useImsRateableLines, useRateImsIndentItem } from '@/hooks/ims/use-ims-item-ratings';
import type { ImsMeetsSpec, ImsRateableLine } from '@/lib/services/ims/item-rating-service';

export function RateIndentItemsCard({ indentId }: { indentId: string }) {
  const { data: lines = [] } = useImsRateableLines(indentId);
  if (lines.length === 0) return null;
  const toRate = lines.filter((l) => l.my_stars == null).length;

  return (
    <section id="rate" className="scroll-mt-4 overflow-hidden rounded-xl border bg-background shadow">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <h2 className="text-base font-semibold">How are the items you received?</h2>
        {toRate > 0 && <Badge variant="secondary">{toRate} to rate</Badge>}
      </div>
      <div className="divide-y">
        {lines.map((line) => (
          <RateLine key={line.indent_item_id} line={line} />
        ))}
      </div>
    </section>
  );
}

function RateLine({ line }: { line: ImsRateableLine }) {
  const rate = useRateImsIndentItem();
  const rated = line.my_stars != null;
  const [editing, setEditing] = useState(!rated);
  const [stars, setStars] = useState(line.my_stars ?? 0);
  const [spec, setSpec] = useState<ImsMeetsSpec>(line.my_meets_spec === 'no' ? 'no' : 'yes');
  const [comment, setComment] = useState(line.my_comment ?? '');

  const needsComment = stars > 0 && (stars <= 2 || spec === 'no');
  const canSave = stars > 0 && (!needsComment || comment.trim().length > 0);

  const save = (s: number, sp: ImsMeetsSpec, c: string) =>
    rate.mutate(
      { indentItemId: line.indent_item_id, stars: s, meetsSpec: sp, comment: c },
      { onSuccess: () => setEditing(false) }
    );

  const pickStars = (next: number) => {
    if (next === 0) return; // no "clear": a rating is saved or untouched
    setStars(next);
    if (next > 2 && spec === 'yes') save(next, spec, comment);
  };

  const pickSpec = (next: ImsMeetsSpec) => {
    setSpec(next);
    if (next === 'yes' && stars > 2) save(stars, next, comment);
  };

  const vendor = line.supplier_name ? `${line.supplier_name} · ` : '';
  const header = (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {line.item_name}
        {line.item_code && <span className="ml-1 text-muted-foreground">({line.item_code})</span>}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {vendor}received {formatDateDMY(line.delivered_on)}
      </p>
    </div>
  );

  if (rated && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        {header}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StarDisplay value={line.my_stars!} />
          <span>· {line.my_meets_spec === 'no' ? 'Not to spec' : 'Good'}</span>
          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 px-5 py-4', needsComment && 'bg-amber-50/60 dark:bg-amber-950/10')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-3">
          <StarRating value={stars} onChange={pickStars} label={`Rate ${line.item_name}`} />
          <div className="inline-flex overflow-hidden rounded-md border" role="radiogroup" aria-label="Item condition">
            {(
              [
                { value: 'yes', label: 'Good' },
                { value: 'no', label: 'Not to spec' },
              ] as { value: ImsMeetsSpec; label: string }[]
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={spec === o.value}
                onClick={() => pickSpec(o.value)}
                className={cn(
                  'h-9 border-l px-3 text-xs first:border-l-0',
                  spec === o.value
                    ? o.value === 'no'
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {rated && !needsComment && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      )}
      {needsComment && (
        <>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went wrong? (required)"
            rows={2}
            maxLength={500}
            aria-invalid={!comment.trim()}
          />
          <div className="flex justify-end gap-2">
            {rated && (
              <Button variant="ghost" className="h-9" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button className="h-9" disabled={!canSave || rate.isPending} onClick={() => save(stars, spec, comment)}>
              {rate.isPending ? 'Saving…' : 'Save rating'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
