'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import {
  useSubmitFeedback,
  useBookingPhotos,
  useBookingFeedback,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import { bookingDateLabel } from './learner-booking-status';
import type { BookingBoardRow, MyAllocation } from '@/types/campus-living/housekeeping';

interface Props {
  booking: BookingBoardRow;
  allocation: MyAllocation;
  learnerId: string;
  isOverdue: boolean;
}

/**
 * Shown whenever a cleaning in this room is awaiting feedback.
 *
 * The copy states the stake plainly: until someone in the room rates, hostel
 * attendance is held for ALL of them. Once overdue the tone escalates and the
 * consequence is described as current, not pending — because by then it is.
 */
export function RateCleaningCard({ booking, allocation, learnerId, isOverdue }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const submit = useSubmitFeedback();
  const { data: photos = [] } = useBookingPhotos(booking.id);
  const { data: feedback = [] } = useBookingFeedback(booking.id);

  // ALL of each phase, not the first of each: a cleaning can carry several
  // before and after photos, and a learner rating against 1 of 4 is rating
  // something they were never shown.
  const beforePhotos = photos.filter((p) => p.phase === 'before');
  const afterPhotos = photos.filter((p) => p.phase === 'after');

  // ux_hk_feedback_one_per_learner is UNIQUE (booking_id, learner_id): a second
  // submit is a 23505, not an update. So the form must not be offered once this
  // learner has rated -- even though a roommate still can.
  const myRating = feedback.find((f) => f.learner_id === learnerId) ?? null;

  function handleSubmit() {
    if (!rating || !learnerId) return;
    submit.mutate({
      bookingId: booking.id,
      institutionId: allocation.institution_id,
      roomId: allocation.room_id,
      learnerId,
      rating,
      comment,
    });
  }

  return (
    <Card className={isOverdue ? 'border-destructive' : 'border-primary'}>
      <CardContent className='space-y-4 p-4'>
        <div>
          <h2 className='font-semibold'>
            {myRating ? 'Your rating' : 'Rate your room cleaning'}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {booking.type_name} · {bookingDateLabel(booking.booking_date)}
          </p>
        </div>

        {!myRating && (
          <p className={`text-sm ${isOverdue ? 'font-medium text-destructive' : ''}`}>
            {isOverdue
              ? 'Hostel attendance is on hold for everyone in your room until one of you rates this cleaning.'
              : 'Rate this cleaning to close it. Until someone in your room does, hostel attendance will be held for all of you.'}
          </p>
        )}

        {/* Photos through the authenticated proxy — drive_url is not
            link-shared and would render broken. */}
        {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
          <div className='flex gap-3'>
            {([
              { label: 'Before', alt: 'Room before cleaning', list: beforePhotos },
              { label: 'After', alt: 'Room after cleaning', list: afterPhotos },
            ] as const).map(({ label, alt, list }) =>
              list.length === 0 ? null : (
                <div key={label} className='flex-1 space-y-1'>
                  <div className={list.length > 1 ? 'grid grid-cols-2 gap-1' : ''}>
                    {list.map((p) => (
                      /* Plain <img>, not next/image: the source is an
                         AUTHENTICATED proxy route. next/image would fetch it
                         through Next's optimizer server-side, without the
                         viewer's cookies, and every photo would 401. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={p.id}
                        src={`/api/campus-living/housekeeping/photos/${p.id}/image`}
                        alt={alt}
                        className={`w-full rounded-md object-cover ${
                          list.length > 1 ? 'h-20' : 'h-32'
                        }`}
                      />
                    ))}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {label}
                    {list.length > 1 && ` (${list.length})`}
                  </p>
                </div>
              ),
            )}
          </div>
        )}

        {myRating ? (
          <div className='rounded-md border bg-muted/40 p-3'>
            <p className='flex items-center gap-1.5 text-sm font-medium'>
              <Star className='h-4 w-4 fill-amber-400 text-amber-400' />
              You rated this {myRating.rating} out of 5
            </p>
            {myRating.comment && (
              <p className='mt-1 text-sm text-muted-foreground'>{myRating.comment}</p>
            )}
            <p className='mt-1 text-xs text-muted-foreground'>
              Thanks — a rating cannot be changed, and your room&rsquo;s attendance is
              released.
            </p>
          </div>
        ) : (
          <>
            {/* Touch targets: 44px minimum so a star is tappable on a phone. */}
            <div className='flex items-center gap-1'>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type='button'
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setRating(n)}
                  className='min-h-11 min-w-11 p-1'
                >
                  <Star
                    className={`h-7 w-7 ${
                      n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>

            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder='Anything the warden should know? (optional)'
            />

            <Button
              className='w-full sm:w-auto'
              disabled={!rating || submit.isPending}
              onClick={handleSubmit}
            >
              {submit.isPending ? 'Submitting…' : 'Submit rating'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
