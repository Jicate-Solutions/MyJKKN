'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, ExternalLink, Paperclip } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
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
                <RichTextDisplay content={a.description} className="text-sm text-muted-foreground" />
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
                return (
                  <div className="mt-2 space-y-1.5">
                    {files.map((att, i) => (
                      <a
                        key={('driveFileId' in att && att.driveFileId) || i}
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
                );
              })()}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
