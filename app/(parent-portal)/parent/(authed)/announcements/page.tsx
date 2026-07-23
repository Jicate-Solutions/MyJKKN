'use client';

/** Announcements — time-ordered list; tap a card to read the single message. */
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Paperclip } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { stripHtml } from '@/components/ui/rich-text-editor';
import { useParentAnnouncements } from '@/hooks/parent/use-parent-announcements';
import { useParentSession } from '@/hooks/parent/use-parent-session';

export default function ParentAnnouncementsPage() {
  const { activeLearnerId } = useParentSession();
  const { data, isLoading, isError } = useParentAnnouncements();
  const items = data?.data ?? [];
  // Until the active learner resolves (cookie read after mount) the query is
  // disabled; treat that as loading so we never flash the empty state.
  const loading = isLoading || !activeLearnerId;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Announcements</h1>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Couldn’t load announcements.
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          You have no announcements to show. Check back later!
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Link key={a.id} href={`/parent/announcements/${a.id}`} className="block">
              <Card className="overflow-hidden transition-shadow hover:shadow-md active:scale-[0.99]">
                {a.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.bannerUrl} alt="" className="h-32 w-full object-cover" />
                )}
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    {a.category && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6d41]">
                        {a.category}
                      </span>
                    )}
                    <h2 className="truncate font-bold leading-snug">{a.title}</h2>
                    {a.body && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{stripHtml(a.body)}</p>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-xs text-muted-foreground">{formatDate(a.publishedAt)}</span>
                      {!!a.attachmentUrls?.length && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {a.attachmentUrls.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
