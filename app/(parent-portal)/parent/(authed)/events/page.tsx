'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useParentEvents } from '@/hooks/parent/use-parent-features';

export default function EventsPage() {
  const { data, isLoading } = useParentEvents();
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Events &amp; Gallery</h1>
      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No events to show yet.
        </Card>
      ) : (
        items.map((e) => (
          <Card key={e.id} className="overflow-hidden">
            {e.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.bannerUrl} alt="" className="h-36 w-full object-cover" />
            )}
            <div className="space-y-2 p-4">
              <h2 className="font-semibold">{e.title}</h2>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {e.eventDate && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(e.eventDate)}
                  </span>
                )}
                {e.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {e.venue}
                  </span>
                )}
              </div>
              {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
              {e.gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {e.gallery.map((g) => (
                    <a key={g.id} href={g.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.thumbnailUrl || g.url}
                        alt={g.title ?? ''}
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
