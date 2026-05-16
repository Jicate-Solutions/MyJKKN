'use client';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import type { AdmissionFeeChangeEvent } from '@/types/admission';
import { EventReviewDialog } from './event-review-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
}

export function EventsPanel({ open, onOpenChange, institutionId }: Props) {
  const [events, setEvents] = useState<AdmissionFeeChangeEvent[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    FeeChangeEventService.listPending(institutionId).then(setEvents);
  }, [open, institutionId]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader><SheetTitle>Pending Fee Change Events</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {events.length === 0 && <p className="text-sm text-muted-foreground">No pending events.</p>}
            {events.map((e) => (
              <button
                key={e.id}
                className="block w-full rounded border p-3 text-left hover:bg-muted"
                onClick={() => setReviewing(e.id)}
              >
                <div className="text-sm font-medium">Learner {e.learner_id.slice(0, 8)}…</div>
                <div className="text-xs text-muted-foreground">
                  Trigger: {e.trigger_field} • Requested {new Date(e.requested_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      {reviewing && (
        <EventReviewDialog
          eventId={reviewing}
          onOpenChange={(o) => { if (!o) { setReviewing(null); FeeChangeEventService.listPending(institutionId).then(setEvents); } }}
        />
      )}
    </>
  );
}
