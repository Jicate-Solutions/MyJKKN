'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Camera, Loader2 } from 'lucide-react';
import type { BookingBoardRow, PhotoPhase } from '@/types/campus-living/housekeeping';

/**
 * The one place a cleaning photo is uploaded.
 *
 * Both surfaces use it — the desktop table row and the mobile booking card — so
 * the upload contract, the error copy and the phase gating cannot drift apart.
 *
 * WHICH PHASE IS LEGAL IS DECIDED BY STATUS, not by the caller:
 *   assigned     -> before   (the cleaner has arrived, nothing done yet)
 *   in_progress  -> after    (the before photo is what moved it here)
 * Any other status has no upload, which is why this renders null rather than a
 * disabled button — a greyed-out camera on a completed job is just noise.
 *
 * `capture='environment'` asks a phone for the rear camera directly. On desktop
 * it is ignored and the file picker opens, so the same control serves both.
 */
export function uploadablePhase(status: BookingBoardRow['status']): PhotoPhase | null {
  if (status === 'assigned') return 'before';
  if (status === 'in_progress') return 'after';
  return null;
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
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const phase = uploadablePhase(booking.status);
  if (!phase) return null;

  const label = phase === 'before' ? 'Upload before photo' : 'Upload after photo';

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('phase', phase as PhotoPhase);
      const res = await fetch(
        `/api/campus-living/housekeeping/bookings/${booking.id}/photos`,
        { method: 'POST', body },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The route's own copy is already actionable ("Upload the before photo
        // first."), so surface it rather than a generic failure.
        toast.error(json?.error ?? 'Could not upload the photo.');
        return;
      }
      toast.success(phase === 'before' ? 'Before photo saved' : 'After photo saved');
      onUploaded();
    } catch {
      toast.error('Could not upload the photo. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        accept='image/jpeg,image/png,image/webp'
        capture='environment'
        className='hidden'
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          // Reset so re-picking the SAME file still fires onChange.
          e.target.value = '';
        }}
      />
      <Button
        type='button'
        size={variant === 'icon' ? 'icon' : 'sm'}
        variant={variant === 'icon' ? 'ghost' : 'default'}
        className={className}
        disabled={uploading}
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className={`h-4 w-4 animate-spin ${variant === 'button' ? 'mr-1.5' : ''}`} />
        ) : (
          <Camera className={`h-4 w-4 ${variant === 'button' ? 'mr-1.5' : ''}`} />
        )}
        {variant === 'button' && (phase === 'before' ? 'Upload before' : 'Upload after')}
      </Button>
    </>
  );
}
