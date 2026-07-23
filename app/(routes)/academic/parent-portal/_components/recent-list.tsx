'use client';

import { Card } from '@/components/ui/card';

/** Simple recent-items list used by each authoring tab. */
export function RecentList({ items, render }: { items: any[]; render: (x: any) => string }) {
  if (!items.length) return <p className="px-1 text-sm text-muted-foreground">Nothing published yet.</p>;
  return (
    <Card className="divide-y divide-black/5 dark:divide-white/10">
      {items.map((x) => (
        <div key={x.id} className="px-4 py-2.5 text-sm">{render(x)}</div>
      ))}
    </Card>
  );
}
