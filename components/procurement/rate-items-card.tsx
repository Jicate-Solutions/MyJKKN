'use client';

// Requester rates each delivered item: stars, meets spec, comment. Feeds the vendor score
// and the "last bought" hint on the next request. Hidden until something is delivered.

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRating, StarDisplay } from '@/components/ui/star-rating';
import { cn } from '@/lib/utils';
import { formatDateDMY } from '@/lib/utils/date-format';
import { useRateableLines, useRateItem } from '@/hooks/procurement/use-ratings';
import type { MeetsSpec, RateableLine } from '@/types/procurement';

const SPEC_OPTIONS: { value: MeetsSpec; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'partly', label: 'Partly' },
  { value: 'no', label: 'No' },
];

export function RateItemsCard({ requestId }: { requestId: string }) {
  const { data: lines = [] } = useRateableLines(requestId);
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
          <RateLine key={line.grn_item_id} line={line} />
        ))}
      </div>
    </section>
  );
}

function RateLine({ line }: { line: RateableLine }) {
  const rate = useRateItem();
  const rated = line.my_stars != null;
  const [editing, setEditing] = useState(!rated);
  const [stars, setStars] = useState(line.my_stars ?? 0);
  const [spec, setSpec] = useState<MeetsSpec | null>(line.my_meets_spec);
  const [comment, setComment] = useState(line.my_comment ?? '');

  const needsComment = stars > 0 && stars <= 2;
  const canSave = stars > 0 && spec != null && (!needsComment || comment.trim().length > 0);

  const vendor = [line.supplier_name, line.manufacturer].filter(Boolean).join(' · ');
  const header = (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{line.item_name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {vendor} · received {formatDateDMY(line.received_on)} · {line.grn_number}
      </p>
    </div>
  );

  if (rated && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        {header}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StarDisplay value={line.my_stars!} />
          <span>· meets spec: {SPEC_OPTIONS.find((o) => o.value === line.my_meets_spec)?.label}</span>
          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </div>
    );
  }

  const save = () =>
    rate.mutate(
      { grnItemId: line.grn_item_id, stars, meetsSpec: spec!, comment },
      { onSuccess: () => setEditing(false) }
    );

  return (
    <div className="space-y-3 px-5 py-4">
      {header}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <StarRating value={stars} onChange={setStars} label={`Rate ${line.item_name}`} />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Meets the spec?</span>
          <div className="inline-flex overflow-hidden rounded-md border" role="radiogroup" aria-label="Meets the spec?">
            {SPEC_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={spec === o.value}
                onClick={() => setSpec(o.value)}
                className={cn(
                  'border-l px-3 py-1 text-xs first:border-l-0',
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
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={needsComment ? 'What went wrong? (required for 1–2 stars)' : 'Comment (optional)'}
        rows={2}
        maxLength={500}
        aria-invalid={needsComment && !comment.trim()}
      />
      <div className="flex justify-end gap-2">
        {rated && (
          <Button variant="ghost" className="h-9" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button className="h-9" disabled={!canSave || rate.isPending} onClick={save}>
          {rate.isPending ? 'Saving…' : 'Save rating'}
        </Button>
      </div>
    </div>
  );
}
