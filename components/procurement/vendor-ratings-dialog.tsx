'use client';

// Latest ratings for one vendor (delivery + item), newest first. RLS limits it to
// deliveries the viewer can already see.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StarDisplay } from '@/components/ui/star-rating';
import { formatDateDMY } from '@/lib/utils/date-format';
import { useRecentVendorRatings } from '@/hooks/procurement/use-ratings';

export function VendorRatingsDialog({
  supplier,
  onOpenChange,
}: {
  supplier: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: ratings = [], isLoading } = useRecentVendorRatings(supplier?.id);
  return (
    <Dialog open={!!supplier} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ratings · {supplier?.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : ratings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No ratings yet.</p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {ratings.map((r) => (
              <li key={r.id} className="space-y-0.5 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.kind === 'delivery' ? 'Delivery' : 'Item quality'}
                    {r.manufacturer ? <span className="text-muted-foreground"> · {r.manufacturer}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <StarDisplay value={r.stars} />
                    <span className="text-xs text-muted-foreground">{formatDateDMY(r.updated_at)}</span>
                  </span>
                </div>
                {(r.meets_spec === 'no' || r.meets_spec === 'partly') && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {r.meets_spec === 'no' ? 'Not to spec' : 'Partly to spec'}
                  </p>
                )}
                {r.tags.length > 0 && <p className="text-xs text-muted-foreground">{r.tags.join(' · ')}</p>}
                {r.comment && <p className="text-muted-foreground">“{r.comment}”</p>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
