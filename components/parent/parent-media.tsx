'use client';

/**
 * Parent-portal inline media.
 *
 * Parents read announcements / homework / achievements on their phone and
 * should NEVER be bounced to a new tab to see a picture or watch a clip.
 * These helpers detect image/video links — whether pasted inside a rich-text
 * message, sat in a dedicated link field, or uploaded as a Drive attachment —
 * and render them inline: images preview, videos play, right on the page.
 *
 * Kept separate from the shared `RichTextDisplay` so admin notification views
 * (which reuse that primitive) are unaffected.
 */
import { ExternalLink, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;

export type MediaKind = 'image' | 'video' | 'youtube' | 'vimeo' | 'drive' | 'link';

export interface MediaInfo {
  kind: MediaKind;
  /** Original, click-through URL. */
  url: string;
  /** iframe `src` for player kinds (youtube / vimeo / drive). */
  embedUrl?: string;
}

/**
 * Classify a URL into how it should be shown. Anything we don't recognise as
 * embeddable media falls back to `link` (a normal anchor), so this is safe to
 * run on every URL we find.
 */
export function classifyMediaUrl(raw: string): MediaInfo {
  const url = (raw || '').trim();

  // YouTube (watch / share / embed / shorts / live) → 11-char video id.
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i
  );
  if (yt) return { kind: 'youtube', url, embedUrl: `https://www.youtube.com/embed/${yt[1]}` };

  // Vimeo → numeric id.
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vm) return { kind: 'vimeo', url, embedUrl: `https://player.vimeo.com/video/${vm[1]}` };

  // Google Drive file → /preview renders images AND plays video/pdf.
  const drive =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i) ||
    url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/i);
  if (drive) {
    return { kind: 'drive', url, embedUrl: `https://drive.google.com/file/d/${drive[1]}/preview` };
  }

  // Direct files by extension (ignore any query string / hash).
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (IMAGE_EXT.test(path)) return { kind: 'image', url };
  if (VIDEO_EXT.test(path)) return { kind: 'video', url };

  return { kind: 'link', url };
}

/** True when the URL is something we can preview/play inline. */
export function isMediaUrl(url: string): boolean {
  return classifyMediaUrl(url).kind !== 'link';
}

/**
 * Whether an uploaded attachment should preview inline (image / video) rather
 * than show as a compact download link. Drive URLs carry no extension, so we
 * lean on the stored filename — keeping PDFs/docs as tidy links while pictures
 * and clips render in place.
 */
function isPreviewableAttachment(name: string | undefined, url: string): boolean {
  if (name && (IMAGE_EXT.test(name) || VIDEO_EXT.test(name))) return true;
  const { kind } = classifyMediaUrl(url);
  return kind === 'image' || kind === 'video' || kind === 'youtube' || kind === 'vimeo';
}

/**
 * Pull every embeddable media URL out of a rich-text HTML body — both the
 * `href`s of links and any bare URLs typed into the text. De-duplicated and
 * order-preserved so the previews appear once, in the order they were written.
 */
export function extractMediaUrls(html: string): string[] {
  if (!html) return [];
  const found = new Set<string>();
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#38;/g, '&');

  // href="..." on anchors.
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) found.add(decode(m[1]));

  // Bare URLs in the visible text (strip tags first so we don't re-match hrefs).
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    found.add(decode(m[0].replace(/[.,;]+$/, ''))); // drop trailing sentence punctuation
  }

  return [...found].filter(isMediaUrl);
}

/**
 * Render a single URL inline according to its kind. Images preview, direct
 * videos get native controls, YouTube/Vimeo/Drive get a responsive player,
 * and anything else degrades to a styled link (same look as before).
 */
export function MediaEmbed({
  url,
  name,
  className,
}: {
  url: string;
  name?: string;
  className?: string;
}) {
  const m = classifyMediaUrl(url);

  switch (m.kind) {
    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.url}
          alt={name ?? ''}
          loading="lazy"
          className={cn('max-h-[70vh] w-full rounded-xl border object-contain', className)}
        />
      );

    case 'video':
      return (
        <video
          src={m.url}
          controls
          playsInline
          preload="metadata"
          className={cn('w-full rounded-xl border bg-black', className)}
        />
      );

    case 'drive': {
      const id = m.embedUrl?.match(/\/file\/d\/([\w-]+)/)?.[1];
      // When the filename tells us it's an image, show the real picture via our
      // same-origin proxy (Drive's thumbnail/preview hosts 403 cross-origin
      // hotlinks, so a direct <img src=drive…> shows a broken icon). Video/PDF/
      // unknown fall through to the iframe, which plays video and renders PDFs.
      if (id && name && IMAGE_EXT.test(name)) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/parent/attachment?fileId=${id}`}
            alt={name}
            loading="lazy"
            className={cn('max-h-[70vh] w-full rounded-xl border object-contain', className)}
          />
        );
      }
      return (
        <div className={cn('aspect-video w-full overflow-hidden rounded-xl border', className)}>
          <iframe
            src={m.embedUrl}
            title={name ?? 'Embedded media'}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      );
    }

    case 'youtube':
    case 'vimeo':
      return (
        <div className={cn('aspect-video w-full overflow-hidden rounded-xl border', className)}>
          <iframe
            src={m.embedUrl}
            title={name ?? 'Embedded media'}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      );

    default:
      return (
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1 text-sm font-medium text-[#0b6d41]',
            className
          )}
        >
          {name ?? 'Open link'} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      );
  }
}

/**
 * Rich-text message body + inline previews for any media links it contains.
 * Drop-in replacement for `RichTextDisplay` on parent-portal pages: the text
 * (with its clickable links) renders as before, and image/video links found
 * inside get previewed/played right beneath it.
 */
export function ParentRichContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;
  const media = extractMediaUrls(content);

  return (
    <div className="space-y-3">
      <RichTextDisplay content={content} className={className} />
      {media.length > 0 && (
        <div className="space-y-3">
          {media.map((u) => (
            <MediaEmbed key={u} url={u} />
          ))}
        </div>
      )}
    </div>
  );
}

type AttachmentLike = { name: string; url?: string; driveFileId?: string };

/**
 * Attachment list that previews media inline (image preview / video play) and
 * keeps non-media files (PDFs, docs, etc.) as the familiar paperclip link.
 */
export function ParentAttachments({
  files,
  className,
}: {
  files: AttachmentLike[];
  className?: string;
}) {
  const usable = files.filter((f) => !!f.url);
  if (usable.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {usable.map((f, i) =>
        isPreviewableAttachment(f.name, f.url!) ? (
          <figure key={f.driveFileId ?? i} className="space-y-1">
            <MediaEmbed url={f.url!} name={f.name} />
            {f.name && (
              <figcaption className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <a
                  href={f.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[#0b6d41]"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </figcaption>
            )}
          </figure>
        ) : (
          <a
            key={f.driveFileId ?? i}
            href={f.url!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border bg-neutral-50 px-3 py-2 text-sm font-medium text-[#0b6d41] dark:bg-neutral-800"
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      )}
    </div>
  );
}
