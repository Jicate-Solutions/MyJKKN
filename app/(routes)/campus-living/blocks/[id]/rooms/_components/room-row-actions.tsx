'use client';

// Row-actions (View / Edit / Delete) for a room in the block rooms table.
//
// Built on the shared CrudRowActions generic so the dropdown matches the rest
// of campus-living. Delete goes straight to the service + invalidates the
// rooms cache here (rather than via useDeleteHostelRoom) because CrudRowActions
// already owns the success/error toast — routing delete through the mutation
// hook would double-toast.

import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import {
  HostelRoomService,
  type HostelRoomWithBedsAndOccupancy,
} from '@/lib/services/campus-living/hostel-room-service';
import { hostelRoomKeys } from '@/hooks/campus-living/use-hostel-rooms';
import { RoomFormDialog } from './room-form-dialog';

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];

interface RoomRowActionsProps {
  room: HostelRoomWithBedsAndOccupancy;
  blockId: string;
  blockType?: string;
}

export function RoomRowActions({ room, blockId, blockType }: RoomRowActionsProps) {
  const queryClient = useQueryClient();

  const EditDialogAdapter = ({
    open,
    onOpenChange,
    mode,
    entity,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'edit';
    entity: HostelRoomWithBedsAndOccupancy;
  }) => (
    <RoomFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      blockId={blockId}
      blockType={blockType}
      room={entity}
    />
  );

  const RoomDetails = ({ entity }: { entity: HostelRoomWithBedsAndOccupancy }) => (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="text-muted-foreground">Room No.:</div>
      <div className="font-medium">{entity.room_number}</div>

      <div className="text-muted-foreground">Floor:</div>
      <div>{FLOOR_LABELS[entity.floor] ?? `Floor ${entity.floor}`}</div>

      <div className="text-muted-foreground">Type:</div>
      <div className="capitalize">{entity.room_type}</div>

      <div className="text-muted-foreground">AC:</div>
      <div className="capitalize">{entity.ac_status.replace('_', ' ')}</div>

      <div className="text-muted-foreground">Category:</div>
      <div>{entity.hostel_categories?.name ?? '—'}</div>

      <div className="text-muted-foreground">Occupancy:</div>
      <div>
        {entity.active_residents}/{entity.capacity}
      </div>

      <div className="text-muted-foreground">Status:</div>
      <div>
        <Badge variant="outline" className="capitalize">
          {entity.derived_status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="text-muted-foreground">Attached Bathroom:</div>
      <div>{entity.has_attached_bathroom ? 'Yes' : 'No'}</div>

      <div className="text-muted-foreground">Annual Fee:</div>
      <div>
        {entity.annual_fee != null
          ? new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
              maximumFractionDigits: 0,
            }).format(entity.annual_fee)
          : '—'}
      </div>
    </div>
  );

  return (
    <CrudRowActions<HostelRoomWithBedsAndOccupancy>
      entity={room}
      entityLabel="room"
      entityDisplayName={(e) => `Room ${e.room_number}`}
      onDelete={async (id) => {
        await HostelRoomService.deleteRoom(id);
        await queryClient.invalidateQueries({ queryKey: hostelRoomKeys.all });
      }}
      EditDialog={EditDialogAdapter}
      ViewDetailsRenderer={RoomDetails}
      deleteImpactHint="Beds and any allocation history for this room will be removed. Active residents must be moved out first."
    />
  );
}
