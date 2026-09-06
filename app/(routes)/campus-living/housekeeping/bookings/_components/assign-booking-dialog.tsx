'use client';

// Assign / re-assign a resident cleaning booking to a cleaner.
// Assignee is EITHER a system user (fn_housekeeping_assignable_staff — active
// profiles whose roles grant '.mark_done' in this institution) OR a free-text
// name for workers without a login. fn_housekeeping_assign_booking enforces
// the '.schedule' permission server-side; the board only shows the button to
// holders of that key.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserCog, UserX } from 'lucide-react';
import {
  useAssignBooking,
  useAssignableStaff,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import type { BookingBoardRow } from '@/lib/services/campus-living/housekeeping-booking-service';

const NONE = 'none';

interface Props {
  booking: BookingBoardRow | null;
  onOpenChange: (open: boolean) => void;
}

export function AssignBookingDialog({ booking, onOpenChange }: Props) {
  return (
    <Dialog open={booking !== null} onOpenChange={onOpenChange}>
      {booking && (
        // key remounts the form per booking so state seeds from props —
        // avoids the setState-in-effect re-seed pattern the compiler flags.
        <AssignForm
          key={booking.id}
          booking={booking}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function AssignForm({
  booking,
  onOpenChange,
}: {
  booking: BookingBoardRow;
  onOpenChange: (open: boolean) => void;
}) {
  const assignMut = useAssignBooking();
  // Staff list comes from the BOOKING's institution, not the viewer's profile
  // or the board filter — in "All Institutions" mode those differ, and the
  // cleaner must belong to the college that owns the room.
  const { data: staff, isLoading: staffLoading } = useAssignableStaff(
    booking.institution_id
  );

  const [profileId, setProfileId] = useState<string>(
    booking.assigned_profile_id ?? NONE
  );
  const [name, setName] = useState(
    booking.assigned_profile_id ? '' : (booking.assigned_staff_name ?? '')
  );

  const isReassign = booking.status === 'assigned';
  const canSubmit = profileId !== NONE || name.trim().length > 0;

  function submit(clear = false) {
    assignMut.mutate(
      {
        bookingId: booking.id,
        profileId: clear || profileId === NONE ? null : profileId,
        name: clear ? null : name.trim() || null,
        clear,
      },
      { onSuccess: (result) => result.success && onOpenChange(false) }
    );
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-primary" />
          {isReassign ? 'Re-assign cleaning' : 'Assign cleaning'}
        </DialogTitle>
        <DialogDescription>
          {`${booking.slot_start?.slice(0, 5)}–${booking.slot_end?.slice(0, 5)} · ${
            booking.block_name ?? 'Block —'
          } · Room ${booking.room_number ?? '—'} · ${booking.learner_name ?? 'Resident —'}`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="assignee-staff">Housekeeping staff</Label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger id="assignee-staff">
              <SelectValue
                placeholder={staffLoading ? 'Loading staff…' : 'Select a staff member'}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No system user — type a name below</SelectItem>
              {(staff ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name ?? 'Unnamed staff'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!staffLoading && (staff ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              No staff with the housekeeping mark-done permission in this
              institution — type the cleaner&apos;s name instead.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignee-name">
            {profileId === NONE ? 'Cleaner name' : 'Display name override (optional)'}
          </Label>
          <Input
            id="assignee-name"
            placeholder="e.g. Rajesh K."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {isReassign ? (
          <Button
            type="button"
            variant="outline"
            className="text-amber-700"
            disabled={assignMut.isPending}
            onClick={() => submit(true)}
          >
            <UserX className="mr-1.5 h-4 w-4" />
            Unassign
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || assignMut.isPending}
            onClick={() => submit(false)}
          >
            {assignMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReassign ? 'Re-assign' : 'Assign'}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
