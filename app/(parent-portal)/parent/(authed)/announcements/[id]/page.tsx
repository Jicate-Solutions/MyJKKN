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
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ParentRichContent, ParentAttachments, MediaEmbed } from '@/components/parent/parent-media';
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
          {a.body && <ParentRichContent content={a.body} className="pt-1 text-sm text-foreground/90" />}

          {!!a.attachmentUrls?.length && (
            <div className="pt-2">
              <ParentAttachments files={a.attachmentUrls} />
            </div>
          )}

          {a.linkUrl && (
            <div className="pt-1">
              <MediaEmbed url={a.linkUrl} />
            </div>
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
