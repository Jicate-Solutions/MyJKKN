'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertCircle, Camera, CheckCircle2, FolderOpen, Loader2, X } from 'lucide-react';
import { bookingDateLabel } from './booking-status';
import type { BookingBoardRow, PhotoPhase } from '@/types/campus-living/housekeeping';

/**
 * The one place cleaning photos are uploaded.
 *
 * Three things it exists to get right, each of which the old single-shot button
 * got wrong:
 *
 *  1. MANY photos per phase. A room is rarely one photograph — the DB has never
 *     had a one-per-phase constraint, only the UI did.
 *  2. CAMERA *and* FILES as separate doors. `capture='environment'` is what makes
 *     a phone skip the picker and open the rear camera; that is right when you
 *     are standing in the room, and wrong when the photo is already in the
 *     gallery. One input cannot be both, so there are two.
 *  3. The phase is CHOSEN, not inferred from status. Deriving it meant the first
 *     before photo flipped the booking to in_progress and a second one became
 *     unreachable forever.
 *
 * Uploads run ONE REQUEST PER FILE, sequentially: the route advances the booking
 * status under a guard on the current status, and serialising is what keeps a
 * batch from racing that guard. A failure does not abandon the rest — the failed
 * items stay in the tray to retry.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp';
/** Mirrors ALLOWED_TYPES / MAX_BYTES in the upload route — fail before the trip. */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 10;

type ItemState = 'pending' | 'uploading' | 'done' | 'error';

interface Item {
  /** Local only — the row has no id until it is uploaded. */
  key: string;
  file: File;
  previewUrl: string;
  state: ItemState;
  error?: string;
}

interface Props {
  booking: BookingBoardRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once, after the batch, when at least one photo landed. */
  onUploaded: () => void;
  defaultPhase: PhotoPhase;
}

export function PhotoUploadDialog({
  booking,
  open,
  onOpenChange,
  onUploaded,
  defaultPhase,
}: Props) {
  const [phase, setPhase] = useState<PhotoPhase>(defaultPhase);
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  // Object URLs are leaked memory until revoked, and the dialog can be closed
  // with files still in the tray. The unmount cleanup reads a REF, not `items`:
  // an empty-dep effect would close over the first render's empty array and
  // revoke nothing at all.
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => {
      for (const i of itemsRef.current) URL.revokeObjectURL(i.previewUrl);
    };
  }, []);

  const pending = items.filter((i) => i.state === 'pending' || i.state === 'error');
  const doneCount = items.filter((i) => i.state === 'done').length;

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;

    const rejected: string[] = [];
    const accepted: Item[] = [];
    let room = MAX_FILES - items.length;

    for (const file of Array.from(picked)) {
      if (room <= 0) {
        rejected.push(`${file.name} — at most ${MAX_FILES} photos at a time`);
        continue;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        rejected.push(`${file.name} — only JPEG, PNG and WebP`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejected.push(`${file.name} — over 8 MB`);
        continue;
      }
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        state: 'pending',
      });
      room -= 1;
    }

    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? `Skipped ${rejected[0]}`
          : `Skipped ${rejected.length} files`,
        { description: rejected.slice(0, 4).join('\n') },
      );
    }
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const hit = prev.find((i) => i.key === key);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }

  async function uploadOne(item: Item): Promise<string | null> {
    const body = new FormData();
    body.append('file', item.file);
    body.append('phase', phase);
    try {
      const res = await fetch(
        `/api/campus-living/housekeeping/bookings/${booking.id}/photos`,
        { method: 'POST', body },
      );
      const json = await res.json().catch(() => ({}));
      // The route's copy is already actionable ("Upload the before photo
      // first."), so it is surfaced rather than a generic failure.
      if (!res.ok) return json?.error ?? 'Upload failed.';
      return null;
    } catch {
      return 'Network error.';
    }
  }

  async function uploadAll() {
    const queue = items.filter((i) => i.state === 'pending' || i.state === 'error');
    if (queue.length === 0) return;

    setUploading(true);
    let succeeded = 0;
    const failures: string[] = [];

    // Sequential on purpose — see the header note about the status guard.
    for (const item of queue) {
      setItems((prev) =>
        prev.map((i) => (i.key === item.key ? { ...i, state: 'uploading', error: undefined } : i)),
      );
      const error = await uploadOne(item);
      setItems((prev) =>
        prev.map((i) =>
          i.key === item.key
            ? { ...i, state: error ? 'error' : 'done', error: error ?? undefined }
            : i,
        ),
      );
      if (error) failures.push(`${item.file.name} — ${error}`);
      else succeeded += 1;
    }

    setUploading(false);

    if (succeeded > 0) {
      const noun = succeeded === 1 ? 'photo' : 'photos';
      toast.success(
        failures.length === 0
          ? `${succeeded} ${phase} ${noun} uploaded`
          : `${succeeded} uploaded, ${failures.length} failed`,
        failures.length > 0 ? { description: failures.slice(0, 3).join('\n') } : undefined,
      );
      onUploaded();
    } else {
      toast.error('No photos were uploaded.', {
        description: failures.slice(0, 3).join('\n'),
      });
    }

    // Everything landed — nothing left to review, so get out of the way.
    if (failures.length === 0) {
      for (const i of queue) URL.revokeObjectURL(i.previewUrl);
      setItems([]);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-batch would orphan the loop's setState calls on an
        // unmounted tray; the uploads themselves are already committed.
        if (uploading) return;
        onOpenChange(next);
      }}
    >
      {/* DialogContent carries no max-height in this repo, and min-h-0 means
          nothing without overflow-y-auto on the SAME element — otherwise the
          preview tray paints over the footer. */}
      <DialogContent className='flex max-h-[88vh] flex-col sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Upload cleaning photos</DialogTitle>
          <DialogDescription>
            {booking.room_number ? `Room ${booking.room_number}` : 'Room'}
            {booking.block_name ? ` · ${booking.block_name}` : ''} ·{' '}
            {bookingDateLabel(booking.booking_date)}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto pr-1'>
          <div className='space-y-2'>
            <Label>Phase</Label>
            <RadioGroup
              value={phase}
              onValueChange={(v) => setPhase(v as PhotoPhase)}
              disabled={uploading}
              className='flex gap-6'
            >
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='before' id='phase-before' />
                <Label htmlFor='phase-before' className='font-normal'>
                  Before
                  {booking.before_photo_count > 0 && (
                    <span className='ml-1 text-muted-foreground'>
                      ({booking.before_photo_count} already)
                    </span>
                  )}
                </Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='after' id='phase-after' />
                <Label htmlFor='phase-after' className='font-normal'>
                  After
                  {booking.after_photo_count > 0 && (
                    <span className='ml-1 text-muted-foreground'>
                      ({booking.after_photo_count} already)
                    </span>
                  )}
                </Label>
              </div>
            </RadioGroup>
            {phase === 'after' && !booking.has_before_photo && (
              <p className='flex items-start gap-1.5 text-xs text-destructive'>
                <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                This cleaning has no before photo yet — upload that first, or the
                after photos will be refused.
              </p>
            )}
          </div>

          <div className='flex flex-wrap gap-2'>
            {/* Two inputs, not one: `capture` is what suppresses the file picker. */}
            <input
              ref={cameraRef}
              type='file'
              accept={ACCEPT}
              capture='environment'
              multiple
              className='hidden'
              onChange={(e) => {
                addFiles(e.target.files);
                // Reset so re-picking the SAME file still fires onChange.
                e.target.value = '';
              }}
            />
            <input
              ref={filesRef}
              type='file'
              accept={ACCEPT}
              multiple
              className='hidden'
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={uploading}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className='mr-1.5 h-4 w-4' />
              Take photos
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={uploading}
              onClick={() => filesRef.current?.click()}
            >
              <FolderOpen className='mr-1.5 h-4 w-4' />
              Choose files
            </Button>
          </div>

          {items.length === 0 ? (
            <p className='rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground'>
              No photos selected yet. JPEG, PNG or WebP · up to 8 MB each · up to{' '}
              {MAX_FILES} at a time.
            </p>
          ) : (
            <div className='space-y-2'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span>
                  {items.length} selected
                  {doneCount > 0 ? ` · ${doneCount} uploaded` : ''}
                </span>
                {uploading && (
                  <span className='flex items-center gap-1.5'>
                    <Loader2 className='h-3 w-3 animate-spin' />
                    {doneCount} of {items.length} uploaded
                  </span>
                )}
              </div>
              <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
                {items.map((item) => (
                  <figure key={item.key} className='relative'>
                    {/* Plain <img>: the src is a local blob: URL, which
                        next/image cannot process. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className={`aspect-square w-full rounded-md border object-cover ${
                        item.state === 'done' ? 'opacity-50' : ''
                      } ${item.state === 'error' ? 'border-destructive' : ''}`}
                    />
                    {item.state === 'uploading' && (
                      <span className='absolute inset-0 flex items-center justify-center rounded-md bg-background/70'>
                        <Loader2 className='h-5 w-5 animate-spin' />
                      </span>
                    )}
                    {item.state === 'done' && (
                      <CheckCircle2 className='absolute left-1 top-1 h-4 w-4 text-emerald-600' />
                    )}
                    {item.state !== 'uploading' && item.state !== 'done' && (
                      <button
                        type='button'
                        aria-label={`Remove ${item.file.name}`}
                        title={`Remove ${item.file.name}`}
                        className='absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground shadow hover:text-destructive'
                        onClick={() => removeItem(item.key)}
                      >
                        <X className='h-3.5 w-3.5' />
                      </button>
                    )}
                    {item.state === 'error' && (
                      <figcaption
                        className='mt-0.5 line-clamp-2 text-[11px] leading-tight text-destructive'
                        title={item.error}
                      >
                        {item.error}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={uploading}
            onClick={() => onOpenChange(false)}
          >
            {doneCount > 0 ? 'Done' : 'Cancel'}
          </Button>
          <Button type='button' disabled={uploading || pending.length === 0} onClick={uploadAll}>
            {uploading && <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />}
            {pending.length > 0
              ? `Upload ${pending.length} ${phase} ${pending.length === 1 ? 'photo' : 'photos'}`
              : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
