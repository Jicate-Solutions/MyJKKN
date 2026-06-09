'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useEligibilityRooms } from '@/hooks/campus-living/use-room-eligibility';
import { formatDateTimeDMY } from '@/lib/utils/date-format';
import type { RoomEligibilityRuleRow } from '@/types/room-eligibility';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RoomEligibilityRuleRow;
}

// A single label/value pair in the read-only details grid.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <dt className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

const Any = () => <span className='text-muted-foreground'>Any</span>;

// Whole block / specific floor / explicit room set — mirrors the table's scope
// badge but spelled out for the detail view.
const scopeDescription = (r: RoomEligibilityRuleRow) =>
  r.room_count > 0
    ? `${r.room_count} specific room${r.room_count > 1 ? 's' : ''}`
    : r.floor != null
    ? r.floor === 0
      ? 'Ground floor'
      : `Floor ${r.floor}`
    : 'Whole block';

export function RoomRuleDetailDialog({ open, onOpenChange, rule }: Props) {
  const targetsRooms = (rule.room_ids?.length ?? 0) > 0;

  // Only fetch the block's rooms when the rule pins specific rooms — to resolve
  // the stored room_ids into human room numbers. Whole-block / floor rules don't
  // need it, so we pass null to keep the query disabled.
  const { rooms, loading } = useEligibilityRooms(
    open && targetsRooms ? rule.block_id : null
  );
  const reservedRoomNumbers = rooms
    .filter((room) => rule.room_ids.includes(room.id))
    .map((room) => room.room_number);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Room Eligibility Rule Details</DialogTitle>
          <DialogDescription>
            Read-only view of this physical-room reservation. Covered rooms admit
            only the matching cohort; uncovered rooms stay open to all.
          </DialogDescription>
        </DialogHeader>

        <dl className='grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2'>
          <Field label='Institution'>{rule.institution_name || '—'}</Field>
          <Field label='Block'>{rule.block_name || '—'}</Field>
          <Field label='Rule Name'>{rule.rule_name || '—'}</Field>
          <Field label='Scope'>
            <Badge variant='outline'>{scopeDescription(rule)}</Badge>
          </Field>
          <Field label='Degree'>{rule.degree_name ?? <Any />}</Field>
          <Field label='Department'>{rule.department_name ?? <Any />}</Field>
          <Field label='Program'>{rule.program_name ?? <Any />}</Field>
          <Field label='Semester (year)'>{rule.semester_name ?? <Any />}</Field>
          <Field label='Status'>
            <Badge variant={rule.is_active ? 'default' : 'outline'}>
              {rule.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </Field>
          <Field label='Created'>{formatDateTimeDMY(rule.created_at)}</Field>
          <Field label='Last Updated'>{formatDateTimeDMY(rule.updated_at)}</Field>
        </dl>

        {targetsRooms && (
          <div className='space-y-2 pt-2'>
            <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              Reserved Rooms ({rule.room_count})
            </p>
            {loading ? (
              <div className='flex items-center text-sm text-muted-foreground'>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading rooms…
              </div>
            ) : reservedRoomNumbers.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {reservedRoomNumbers.map((roomNumber) => (
                  <Badge key={roomNumber} variant='secondary' className='text-xs'>
                    {roomNumber}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {rule.room_count} room{rule.room_count > 1 ? 's' : ''} reserved.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
