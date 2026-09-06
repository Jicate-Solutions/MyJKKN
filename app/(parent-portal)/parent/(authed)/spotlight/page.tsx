'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Sparkles } from 'lucide-react';
import { useParentSpotlight } from '@/hooks/parent/use-parent-features';

export default function SpotlightPage() {
  const { data, isLoading } = useParentSpotlight();
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Spotlight</h1>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          Nothing in the spotlight right now.
        </Card>
      ) : (
        items.map((s) => (
          <Card key={s.id} className="overflow-hidden">
            {s.mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.mediaUrl} alt="" className="h-36 w-full object-cover" />
            )}
            <div className="space-y-1.5 p-4">
              <h2 className="font-semibold">{s.title}</h2>
              {s.body && <p className="text-sm text-muted-foreground">{s.body}</p>}
              {s.linkUrl && (
                <a
                  href={s.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-[#0b6d41]"
                >
                  Learn more <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
