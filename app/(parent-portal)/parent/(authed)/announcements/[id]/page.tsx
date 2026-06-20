'use client';

/**
 * Announcement detail — shows ONE message. Reuses the cached list query
 * (same queryKey → no extra fetch), finds the item by id, and offers
 * Previous / Next navigation across the same time-ordered list.
 */
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Paperclip } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { useParentAnnouncements } from '@/hooks/parent/use-parent-announcements';

export default function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useParentAnnouncements();
  const items = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const index = items.findIndex((a) => a.id === id);
  const a = index >= 0 ? items[index] : undefined;

  if (!a) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="p-8 text-center text-sm text-muted-foreground">
          This announcement is no longer available.
        </Card>
      </div>
    );
  }

  const prev = index > 0 ? items[index - 1] : undefined;
  const next = index < items.length - 1 ? items[index + 1] : undefined;

  return (
    <div className="space-y-4">
      <BackLink />

      <Card className="overflow-hidden">
        {a.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.bannerUrl} alt="" className="h-40 w-full object-cover" />
        )}
        <div className="space-y-2 p-5">
          {a.category && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6d41]">
              {a.category}
            </span>
          )}
          <h1 className="text-lg font-bold leading-snug">{a.title}</h1>
          <span className="block text-xs text-muted-foreground">{formatDate(a.publishedAt)}</span>
          {a.body && <RichTextDisplay content={a.body} className="pt-1 text-sm text-foreground/90" />}

          {!!a.attachmentUrls?.length && (
            <div className="space-y-1.5 pt-2">
              {a.attachmentUrls.map((att, i) => (
                <a
                  key={att.driveFileId ?? i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border bg-neutral-50 px-3 py-2 text-sm font-medium text-[#0b6d41] dark:bg-neutral-800"
                >
                  <Paperclip className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{att.name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ))}
            </div>
          )}

          {a.linkUrl && (
            <a
              href={a.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-[#0b6d41]"
            >
              Open link <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </Card>

      {/* Previous / Next message navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!prev}
          onClick={() => prev && router.push(`/parent/announcements/${prev.id}`)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={!next}
          onClick={() => next && router.push(`/parent/announcements/${next.id}`)}
        >
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/parent/announcements"
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> All announcements
    </Link>
  );
}
