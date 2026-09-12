'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CalendarClock, Loader2, Star } from 'lucide-react';
import {
  useBookingDetail,
  useDeleteBookingPhoto,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import { RESCHEDULE_REASON_LABEL } from '@/lib/services/campus-living/housekeeping-rules';
import { formatCurrency } from '@/lib/utils';
import { STATUS_LABEL, STATUS_TONE, bookingDateLabel, hhmm } from './booking-status';
import { PhotoPhaseGallery } from './photo-phase-gallery';
import type { BookingBoardRow, PhotoPhase } from '@/types/campus-living/housekeeping';

interface Props {
  booking: BookingBoardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** campus_living.housekeeping.execute — the key hk_photos_delete gates on. */
  canExecute?: boolean;
  /** Bumped when a photo is removed, so the table's counts move with it. */
  onChanged?: () => void;
}


export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
  canExecute = false,
  onChanged,
}: Props) {
  const { data, isLoading } = useBookingDetail(open ? booking?.id : undefined);
  const deletePhoto = useDeleteBookingPhoto();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent has no max-height in this repo, and min-h-0 means nothing
          without overflow-y-auto on the SAME element — otherwise the body paints
          over the footer. */}
      <DialogContent className='flex max-h-[88vh] flex-col sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Booking details</DialogTitle>
          <DialogDescription>
            {booking
              ? `${booking.type_name} · ${bookingDateLabel(booking.booking_date)}`
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto pr-1'>
          {isLoading && (
            <p className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> Loading the full record…
            </p>
          )}

          {!isLoading && !data && (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              This booking is no longer available.
            </p>
          )}

          {!isLoading && data && (
            <>
              {/* Status */}
              <section className='flex flex-wrap items-center gap-2'>
                <Badge className={STATUS_TONE[data.booking.status]} variant='secondary'>
                  {STATUS_LABEL[data.booking.status]}
                </Badge>
                <span className='text-sm text-muted-foreground'>
                  {bookingDateLabel(data.booking.booking_date)} ·{' '}
                  {hhmm(data.booking.slot_start)}–{hhmm(data.booking.slot_end)}
                </span>
              </section>

              <Separator />

              {/* Cleaning — snapshot first. These four columns are frozen at
                  booking time so renaming or repricing a type never rewrites the
                  history of jobs already done. */}
              <Section title='Cleaning'>
                <Field label='Type' value={data.booking.type_name} />
                <Field label='Duration' value={`${data.booking.duration_minutes} minutes`} />
                <Field
                  label='Expected cost'
                  value={formatCurrency(data.booking.expected_cost_inr)}
                />
                {data.type ? (
                  <>
                    <Field
                      label='Quota (current)'
                      value={`${data.type.usage_limit_count} per ${data.type.usage_period}, per room`}
                    />
                    {data.type.description && (
                      <Field label='Description (current)' value={data.type.description} wide />
                    )}
                    {!data.type.is_active && (
                      <Field
                        label='Catalogue'
                        value='This type is now inactive — new bookings cannot be made.'
                        wide
                      />
                    )}
                  </>
                ) : (
                  <Field
                    label='Catalogue'
                    value='The type has been removed. The snapshot above is what was booked.'
                    wide
                  />
                )}
              </Section>

              <Separator />

              {/* Learner */}
              <Section title='Booked by'>
                <Field label='Name' value={data.learner?.full_name ?? '—'} />
                <Field label='Email' value={data.learner?.email ?? '—'} />
                <Field label='Gender' value={data.learner?.gender ?? '—'} />
                <Field label='Institution' value={data.institution_name ?? '—'} />
              </Section>

              <Separator />

              {/* Room */}
              <Section title='Room'>
                <Field
                  label='Room'
                  value={data.room?.room_number ? `Room ${data.room.room_number}` : '—'}
                />
                <Field label='Block' value={data.block?.name ?? '—'} />
                <Field label='Floor' value={data.room?.floor != null ? `${data.room.floor}` : '—'} />
                <Field label='Category' value={data.room?.category_name ?? '—'} />
                <Field
                  label='Capacity'
                  value={data.room?.capacity != null ? `${data.room.capacity} beds` : '—'}
                />
                <Field
                  label='Attached bathroom'
                  value={
                    data.room?.has_attached_bathroom == null
                      ? '—'
                      : data.room.has_attached_bathroom
                        ? 'Yes'
                        : 'No'
                  }
                />
              </Section>

              <Separator />

              {/* Cleaner + who did what */}
              <Section title='Cleaner'>
                <Field label='Assigned to' value={data.booking.cleaner_name ?? 'Not assigned'} />
                <Field label='Assigned by' value={data.assigned_by?.full_name ?? '—'} />
                <Field
                  label='Started'
                  value={data.booking.started_at ? formatStamp(data.booking.started_at) : '—'}
                />
                <Field
                  label='Finished'
                  value={data.booking.finished_at ? formatStamp(data.booking.finished_at) : '—'}
                />
              </Section>

              {(data.booking.notes ||
                data.booking.cancel_reason ||
                data.booking.waive_reason) && (
                <>
                  <Separator />
                  <Section title='Notes'>
                    {data.booking.notes && (
                      <Field label='Learner note' value={data.booking.notes} wide />
                    )}
                    {data.booking.cancel_reason && (
                      <Field
                        label={`Cancelled by ${data.cancelled_by?.full_name ?? 'someone'}`}
                        value={data.booking.cancel_reason}
                        wide
                      />
                    )}
                    {data.booking.waive_reason && (
                      <Field
                        label={`Hold waived by ${data.waived_by?.full_name ?? 'someone'}`}
                        value={data.booking.waive_reason}
                        wide
                      />
                    )}
                  </Section>
                </>
              )}

              <Separator />

              {/* Photos. Streamed through our own origin — Drive rejects
                  cross-origin hotlinks even for anyone:reader files, and these
                  are not link-shared at all. */}
              <section className='space-y-3'>
                <h3 className='text-sm font-semibold'>
                  Photos
                  {data.photos.length > 0 && (
                    <span className='ml-1 font-normal text-muted-foreground'>
                      ({data.photos.length})
                    </span>
                  )}
                </h3>
                {data.photos.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    No photos uploaded for this cleaning.
                  </p>
                ) : (
                  // Grouped per phase: "three before, one after" is what is
                  // actually being checked here, and a flat grid makes that a
                  // counting exercise.
                  (['before', 'after'] as PhotoPhase[]).map((ph) => (
                    <PhotoPhaseGallery
                      key={ph}
                      phase={ph}
                      photos={data.photos.filter((p) => p.phase === ph)}
                      canDelete={canExecute}
                      deletingId={deletePhoto.isPending ? deletePhoto.variables?.photoId : null}
                      onDelete={(photoId) => {
                        if (!booking) return;
                        deletePhoto.mutate(
                          { photoId, bookingId: booking.id },
                          { onSuccess: () => onChanged?.() },
                        );
                      }}
                      formatStamp={formatStamp}
                    />
                  ))
                )}
              </section>

              {/* Every move this booking has made. Absent for most bookings, so
                  the whole section only appears once there is something to say. */}
              {data.reschedules.length > 0 && (
                <>
                  <Separator />
                  <section className='space-y-2'>
                    <h3 className='flex items-center gap-2 text-sm font-semibold'>
                      <CalendarClock className='h-4 w-4' />
                      Changes to this booking
                    </h3>
                    <ul className='space-y-2'>
                      {data.reschedules.map((r) => (
                        <li key={r.id} className='rounded-md border p-3'>
                          <p className='text-sm'>
                            <span className='text-muted-foreground line-through'>
                              {bookingDateLabel(r.from_date)} {hhmm(r.from_slot_start)}
                            </span>
                            {' → '}
                            <span className='font-medium'>
                              {bookingDateLabel(r.to_date)} {hhmm(r.to_slot_start)}–
                              {hhmm(r.to_slot_end)}
                            </span>
                          </p>
                          <p className='mt-1 text-sm'>{RESCHEDULE_REASON_LABEL[r.reason_code]}</p>
                          {r.reason_note && (
                            <p className='mt-1 text-sm text-muted-foreground'>{r.reason_note}</p>
                          )}
                          {r.from_cleaner_name !== r.to_cleaner_name && (
                            <p className='mt-1 text-xs text-muted-foreground'>
                              Cleaner: {r.from_cleaner_name ?? 'none'} →{' '}
                              {r.to_cleaner_name ?? 'none'}
                            </p>
                          )}
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {r.rescheduled_by_name ?? 'A warden'} · {formatStamp(r.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              <Separator />

              {/* Feedback. Any roommate may rate, so each row names its rater —
                  the rating that lifted the attendance hold is not necessarily
                  from the learner who booked. */}
              <section className='space-y-2'>
                <h3 className='flex items-center gap-2 text-sm font-semibold'>
                  Feedback
                  {data.booking.average_rating != null && (
                    <span className='flex items-center gap-1 text-sm font-normal text-muted-foreground'>
                      <Star className='h-3.5 w-3.5 fill-amber-400 text-amber-400' />
                      {data.booking.average_rating} / 5 ({data.booking.feedback_count})
                    </span>
                  )}
                </h3>
                {data.feedback.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    Not rated yet.
                    {data.booking.status === 'awaiting_feedback' &&
                      ' The room’s attendance is held until any roommate rates it.'}
                  </p>
                ) : (
                  <ul className='space-y-2'>
                    {data.feedback.map((f) => (
                      <li key={f.id} className='rounded-md border p-3'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <span className='text-sm font-medium'>
                            {f.learner_name ?? 'A roommate'}
                          </span>
                          <span className='flex items-center gap-1 text-sm'>
                            <Star className='h-3.5 w-3.5 fill-amber-400 text-amber-400' />
                            {f.rating} / 5
                          </span>
                        </div>
                        {f.comment && (
                          <p className='mt-1 text-sm text-muted-foreground'>{f.comment}</p>
                        )}
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {formatStamp(f.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='space-y-2'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      <dl className='grid gap-x-6 gap-y-2 sm:grid-cols-2'>{children}</dl>
    </section>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{value}</dd>
    </div>
  );
}

/** A timestamptz rendered in the viewer's own zone — unlike booking_date, this
 *  really is an instant, so local time is the correct reading. */
function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
