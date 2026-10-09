'use client';

// Store admin's one-tap delivery rating on a verified GRN — feeds the vendor score.
// Optional: never blocks verification. Once saved it collapses to "Rated ★4 · Edit".

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRating, StarDisplay } from '@/components/ui/star-rating';
import { cn } from '@/lib/utils';
import { useMyDeliveryRating, useRateDelivery } from '@/hooks/procurement/use-ratings';
import { DELIVERY_TAGS } from '@/types/procurement';

export function DeliveryRatingRow({ grnId, userId }: { grnId: string; userId: string }) {
  const { data: existing, isLoading } = useMyDeliveryRating(grnId, userId);
  const rate = useRateDelivery();
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const startEdit = () => {
    if (existing) {
      setStars(existing.stars);
      setTags(existing.tags ?? []);
      setNote(existing.comment ?? '');
    }
    setEditing(true);
  };

  if (isLoading) return null;

  if (existing && !editing) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Your delivery rating:</span>
        <StarDisplay value={existing.stars} />
        {existing.tags.length > 0 && <span>· {existing.tags.join(', ')}</span>}
        <Button variant="ghost" size="sm" className="h-10 px-2 sm:h-8" onClick={startEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
      </div>
    );
  }

  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const save = () =>
    rate.mutate(
      { grnId, stars, tags, comment: note },
      { onSuccess: () => setEditing(false) }
    );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium">How was this delivery?</p>
          <StarRating value={stars} onChange={setStars} label="Rate this delivery" />
          <span className="text-xs text-muted-foreground">Optional — helps choose vendors next time</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tags.includes(t)}
              onClick={() => toggle(t)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                tags.includes(t) ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything the purchase team should know (optional)"
          rows={2}
          maxLength={500}
        />
        <div className="flex justify-end gap-2">
          {existing && (
            <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
          <Button size="sm" className="h-10 sm:h-8" disabled={stars === 0 || rate.isPending} onClick={save}>
            {rate.isPending ? 'Saving…' : 'Save rating'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
