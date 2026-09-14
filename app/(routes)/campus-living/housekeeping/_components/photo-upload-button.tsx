'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { PhotoUploadDialog } from './photo-upload-dialog';
import type { BookingBoardRow, PhotoPhase } from '@/types/campus-living/housekeeping';

/**
 * The photo-upload entry point, used by BOTH surfaces — the desktop table's
 * action strip and the mobile booking card — so the gating cannot drift apart.
 * The picking, previewing and uploading all live in PhotoUploadDialog.
 *
 * The status decides whether uploading is possible at all, but NOT which phase:
 * it only seeds the dialog's default. Deriving the phase from the status is what
 * used to make a second before photo unreachable, because the first one moved the
 * booking to in_progress.
 */

/** Which phase the dialog opens on. The uploader can still switch. */
export function defaultPhase(status: BookingBoardRow['status']): PhotoPhase {
  return status === 'assigned' ? 'before' : 'after';
}

/**
 * Uploading is legal while the job is live:
 *   assigned          — the cleaner has arrived, before photos
 *   in_progress       — work under way, after photos (or more before ones)
 *   awaiting_feedback — still addable; the room has not rated yet
 * 'booked' is excluded because no cleaner is assigned and no status transition
 * could follow, and completed/cancelled are closed. Those render nothing rather
 * than a disabled control — a greyed-out camera on a finished job is just noise.
 */
export function canUploadPhotos(status: BookingBoardRow['status']): boolean {
  return status === 'assigned' || status === 'in_progress' || status === 'awaiting_feedback';
}

/** Kept for callers that only need the seed phase when an upload is legal. */
export function uploadablePhase(status: BookingBoardRow['status']): PhotoPhase | null {
  return canUploadPhotos(status) ? defaultPhase(status) : null;
}

interface Props {
  booking: BookingBoardRow;
  onUploaded: () => void;
  /** 'icon' for the table's action strip, 'button' for the card. */
  variant?: 'icon' | 'button';
  className?: string;
}

export function PhotoUploadButton({
  booking,
  onUploaded,
  variant = 'icon',
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!canUploadPhotos(booking.status)) return null;

  const label = 'Upload cleaning photos';

  return (
    <>
      <Button
        type='button'
        size={variant === 'icon' ? 'icon' : 'sm'}
        variant={variant === 'icon' ? 'ghost' : 'default'}
        className={className}
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        <Camera className={`h-4 w-4 ${variant === 'button' ? 'mr-1.5' : ''}`} />
        {variant === 'button' && 'Add photos'}
      </Button>

      {/* Mounted only while open so each session starts with an empty tray and
          a freshly seeded phase. */}
      {open && (
        <PhotoUploadDialog
          booking={booking}
          open={open}
          onOpenChange={setOpen}
          onUploaded={onUploaded}
          defaultPhase={defaultPhase(booking.status)}
        />
      )}
    </>
  );
}
