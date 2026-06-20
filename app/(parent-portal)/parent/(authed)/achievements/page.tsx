'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ParentRichContent, ParentAttachments } from '@/components/parent/parent-media';
import { useParentAchievements } from '@/hooks/parent/use-parent-features';

export default function AchievementsPage() {
  const { data, isLoading } = useParentAchievements();
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Achievements</h1>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          You have no achievements to show. Check back later!
        </Card>
      ) : (
        items.map((a) => (
          <Card key={a.id} className="flex gap-3 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
              <Trophy className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              {a.category && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6d41]">
                  {a.category}
                </span>
              )}
              <h2 className="font-bold leading-snug">{a.title}</h2>
              {a.description && (
                <ParentRichContent content={a.description} className="text-sm text-muted-foreground" />
              )}
              {a.achievedOn && (
                <span className="mt-1 block text-xs text-muted-foreground">{formatDate(a.achievedOn)}</span>
              )}
              {(() => {
                // Prefer the attachment list; fall back to the legacy single cert.
                const files = a.attachmentUrls?.length
                  ? a.attachmentUrls
                  : a.certificateUrl
                  ? [{ name: 'Certificate', url: a.certificateUrl }]
                  : [];
                if (!files.length) return null;
                return <ParentAttachments files={files} className="mt-2" />;
              })()}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
