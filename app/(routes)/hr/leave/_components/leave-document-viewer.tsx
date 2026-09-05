'use client';

// In-app viewer for a leave / comp-off supporting document. VIEW ONLY.
//
// WHY A MODAL AND NOT A LINK. The list this replaces opened
// /api/hr/leave/documents/[fileId] in a new tab, which sent every certificate
// straight to the Downloads folder: the proxy was serving them as
// application/octet-stream (a gaxios 7 header-shape trap, fixed in that route),
// and nothing in a new-tab navigation can recover from that. Rendering the
// bytes into an <img> / <iframe> we control keeps the approver on the queue,
// and — because there is no anchor, no `download` attribute and no "open in new
// tab" — the only affordance offered is looking at it.
//
// It is a UI restriction, not DRM: anyone determined can still reach the bytes
// through devtools, and Chrome's PDF plugin keeps its own save shortcut behind
// the toolbar we hide. What it does guarantee is that the ordinary click — the
// one an approver makes forty times while clearing a queue — shows the document
// instead of silently writing it to disk.

import { useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, FileQuestion, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { LeaveDocument } from '@/types/hr';

/**
 * The ONLY way these bytes are reachable. The Drive file carries no public
 * permission by design, so doc.url is useless to anyone but the service
 * account; the proxy authorises the viewer against the application and streams
 * it. Older rows (or a partial write) can lack the id — there is nothing to
 * show for those, and a link that 404s is worse than saying so.
 */
export function leaveDocumentHref(doc: LeaveDocument): string | null {
  return doc.drive_file_id ? `/api/hr/leave/documents/${doc.drive_file_id}` : null;
}

type DocKind = 'image' | 'pdf' | 'unknown';

/**
 * mime_type is optional on the type, so fall back to the filename. Every stored
 * document today carries one (79 jpeg, 36 pdf, 15 png), but one written by an
 * older path would render as "cannot display" for want of a single field.
 */
export function leaveDocumentKind(doc: LeaveDocument): DocKind {
  const mime = (doc.mime_type ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';

  const name = (doc.name ?? '').toLowerCase();
  if (/\.(jpe?g|png|webp|gif)$/.test(name)) return 'image';
  if (name.endsWith('.pdf')) return 'pdf';
  return 'unknown';
}

function humanSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  documents: LeaveDocument[] | null | undefined;
  /** Which one to show first — the list opens the item that was clicked. */
  startIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whose document it is: staff name, or name + leave type. */
  title?: string;
}

export function LeaveDocumentViewer({
  documents, startIndex = 0, open, onOpenChange, title,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        DialogContent ships with NO max-height and NO overflow handling (see
        components/ui/dialog.tsx) — a tall document would push the whole panel
        off the viewport with nothing to scroll. The height, the flex column and
        the min-h-0 on the body are all load-bearing.
      */}
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {/*
          Radix unmounts a closed Dialog's content, so every open mounts this
          fresh and its state starts at the clicked document with nothing
          loaded. That is why there is no effect resetting the index: an effect
          that calls setState on open is exactly what react-hooks/
          set-state-in-effect refuses, and the mount does the same job for free.
        */}
        <ViewerBody documents={documents ?? []} startIndex={startIndex} title={title} />
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({
  documents, startIndex, title,
}: {
  documents: LeaveDocument[];
  startIndex: number;
  title?: string;
}) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, documents.length - 1))
  );

  const doc = documents[index];
  const href = doc ? leaveDocumentHref(doc) : null;
  const kind = doc ? leaveDocumentKind(doc) : 'unknown';
  const size = doc ? humanSize(doc.size_bytes) : null;

  /*
   * Load state is DERIVED from which href has reported back, not reset by an
   * effect when the index moves: "the document showing is the one that loaded"
   * is a comparison, and paging to the next document makes it false again on
   * its own. Storing a boolean instead would need an effect to clear it, and
   * would flash the previous page's image under a stale "loaded".
   */
  const [loadedHref, setLoadedHref] = useState<string | null>(null);
  const [failedHref, setFailedHref] = useState<string | null>(null);
  const loading = href !== null && loadedHref !== href && failedHref !== href;
  const failed = href !== null && failedHref === href;

  return (
    <>
      {/* pr-10 keeps the title clear of Radix's own close button. */}
      <DialogHeader className="shrink-0 space-y-1 border-b p-4 pr-10 text-left">
        <DialogTitle className="truncate text-base">
          {doc?.name || 'Supporting document'}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {[title, size, documents.length > 1 ? `${index + 1} of ${documents.length}` : null]
            .filter(Boolean)
            .join(' · ') || 'Supporting document'}
        </DialogDescription>
      </DialogHeader>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40">
        {!doc || !href ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <FileQuestion className="h-8 w-8" />
            <p>
              This attachment has no stored file reference, so there is nothing to
              display. It was recorded as{' '}
              <span className="font-medium">{doc?.name || 'unknown'}</span>.
            </p>
          </div>
        ) : failed ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p>
              Couldn&rsquo;t load this document. It may have been removed from
              storage, or you may not have access to the request it belongs to.
            </p>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {kind === 'image' ? (
              // An authorised proxy stream, not an optimisable static asset:
              // next/image would round-trip these private bytes through the
              // image optimiser and cache them under a public URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={href}
                src={href}
                alt={doc.name || 'Supporting document'}
                className="max-h-full max-w-full object-contain"
                onLoad={() => setLoadedHref(href)}
                onError={() => setFailedHref(href)}
              />
            ) : kind === 'pdf' ? (
              // #toolbar=0&navpanes=0 hides Chrome's built-in PDF chrome —
              // which is where its download and print buttons live. The viewer
              // still scrolls and zooms.
              <iframe
                key={href}
                src={`${href}#toolbar=0&navpanes=0&view=FitH`}
                title={doc.name || 'Supporting document'}
                className="h-full w-full border-0 bg-white"
                onLoad={() => setLoadedHref(href)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <FileQuestion className="h-8 w-8" />
                <p>
                  This file type ({doc.mime_type || 'unknown'}) can&rsquo;t be
                  shown here. Ask the requester to re-attach it as a PDF or an
                  image.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {documents.length > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            {index + 1} of {documents.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={index >= documents.length - 1}
            onClick={() => setIndex((i) => Math.min(documents.length - 1, i + 1))}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}
