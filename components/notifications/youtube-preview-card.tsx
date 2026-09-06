'use client';

// components/notifications/youtube-preview-card.tsx
//
// The card recipients see when a notification's Action URL is a YouTube link.
// Added 2026-08-13 on the Director's chosen behaviour: "thumbnail + title card,
// taps to YouTube" — deliberately NOT an embedded player, and deliberately only
// YouTube (not generic any-URL previews).
//
// Shared by the recipient inbox (notifications/_components/notification-center)
// and the sender's detail view (notifications/admin/[id]/_components/
// notification-view) so the two never drift.
//
// Plain <img>, not next/image, on purpose: next.config.ts's
// images.remotePatterns allows only supabase.co and lh3.googleusercontent.com,
// so next/image would reject img.youtube.com at runtime. Adding a remote pattern
// would change global build config for the whole app to render one card.

import { useState } from 'react';
import { ExternalLink, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { youTubeThumbnailUrl, youTubeWatchUrl } from '@/lib/media/youtube';

/** Shape stored at notifications.metadata.link_preview. */
export interface YouTubeLinkPreview {
  videoId: string;
  title?: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
}

interface YouTubePreviewCardProps {
  preview: YouTubeLinkPreview | null | undefined;
  className?: string;
  /** Inbox cards are themselves clickable — stop the click bubbling there. */
  stopPropagation?: boolean;
}

export function YouTubePreviewCard({
  preview,
  className,
  stopPropagation = false
}: YouTubePreviewCardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const videoId = preview?.videoId;
  if (!videoId) return null;

  const watchUrl = youTubeWatchUrl(videoId);
  // Fall back to the derived poster if the stored one is missing — the id alone
  // is enough, which is why a failed oEmbed still produces a real card.
  const thumbnail = preview?.thumbnailUrl || youTubeThumbnailUrl(videoId);
  const title = preview?.title?.trim() || 'Watch on YouTube';
  const author = preview?.author?.trim() || null;

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className={cn(
        'group block overflow-hidden rounded-lg border bg-muted/20 transition-colors hover:bg-muted/50',
        className
      )}
    >
      {!thumbnailFailed && (
        <div className="relative bg-black/5 dark:bg-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt=""
            width={480}
            height={360}
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
            className="h-auto max-h-56 w-full object-cover"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-16 items-center justify-center rounded-lg bg-red-600/90 shadow-lg transition-transform group-hover:scale-105">
              <Youtube className="h-6 w-6 text-white" />
            </span>
          </span>
        </div>
      )}

      <div className="flex items-start gap-2 px-3 py-2">
        <Youtube className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {author ? `${author} · YouTube` : 'YouTube'}
          </p>
        </div>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>
    </a>
  );
}
