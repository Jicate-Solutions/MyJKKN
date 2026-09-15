'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ImageIcon, Loader2, X } from 'lucide-react';
import type { BookingPhoto, PhotoPhase } from '@/types/campus-living/housekeeping';

/**
 * One phase's photos, grouped under a heading with its count.
 *
 * Rendering is split per phase rather than one flat grid because "three before,
 * one after" is the thing a warden is actually checking, and a mixed grid with
 * per-tile captions makes that a counting exercise.
 */

const PHASE_LABEL: Record<PhotoPhase, string> = { before: 'Before', after: 'After' };

interface Props {
  phase: PhotoPhase;
  photos: BookingPhoto[];
  /** campus_living.housekeeping.execute. Without it no remove control renders. */
  canDelete?: boolean;
  onDelete?: (photoId: string) => void;
  /** The photo currently being removed, so only its own tile shows a spinner. */
  deletingId?: string | null;
  formatStamp: (iso: string) => string;
}

export function PhotoPhaseGallery({
  phase,
  photos,
  canDelete = false,
  onDelete,
  deletingId,
  formatStamp,
}: Props) {
  const [confirming, setConfirming] = useState<BookingPhoto | null>(null);

  return (
    <div className='space-y-2'>
      <h4 className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
        {PHASE_LABEL[phase]}
        <span>({photos.length})</span>
      </h4>

      {photos.length === 0 ? (
        <p className='flex items-center gap-1.5 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground'>
          <ImageIcon className='h-3.5 w-3.5' />
          No {phase} photo uploaded.
        </p>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
          {photos.map((p) => (
            <figure key={p.id} className='group relative space-y-1'>
              {/* Plain <img>, not next/image: the source is an AUTHENTICATED
                  proxy route. next/image would fetch it through Next's
                  optimizer server-side, without the viewer's cookies, and
                  every photo would 401. Same reason as rate-cleaning-card.tsx
                  on the learner side. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/campus-living/housekeeping/photos/${p.id}/image`}
                alt={`${PHASE_LABEL[p.phase]} cleaning photo`}
                className='aspect-video w-full rounded-md border bg-muted object-cover'
              />
              {canDelete && (
                <button
                  type='button'
                  aria-label={`Remove this ${phase} photo`}
                  title={`Remove this ${phase} photo`}
                  disabled={deletingId === p.id}
                  className='absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground opacity-0 shadow transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100'
                  onClick={() => setConfirming(p)}
                >
                  {deletingId === p.id ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <X className='h-3.5 w-3.5' />
                  )}
                </button>
              )}
              <figcaption className='text-xs text-muted-foreground'>
                {formatStamp(p.uploaded_at)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this {phase} photo?</AlertDialogTitle>
            <AlertDialogDescription>
              The photo is deleted from Drive as well and cannot be recovered. The
              cleaning itself is not reopened — only this photo goes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) onDelete?.(confirming.id);
                setConfirming(null);
              }}
            >
              Remove photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
