'use client';

// Row-actions (View / Edit / Delete) for a room in the block rooms table.
//
// Built on the shared CrudRowActions generic so the dropdown matches the rest
// of campus-living. Delete goes straight to the service + invalidates the
// rooms cache here (rather than via useDeleteHostelRoom) because CrudRowActions
// already owns the success/error toast — routing delete through the mutation
// hook would double-toast.

import { useQueryClient } from '@tanstack/react-query';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import {
  HostelRoomService,
  type HostelRoomWithBedsAndOccupancy,
} from '@/lib/services/campus-living/hostel-room-service';
import { hostelRoomKeys } from '@/hooks/campus-living/use-hostel-rooms';
import { RoomFormDialog } from './room-form-dialog';
import { RoomDetailsContent } from './room-details-content';

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
    <RoomDetailsContent room={entity} />
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
      deleteImpactHint="Beds plus this room's past allocation, maintenance and cleaning history will be removed. Rooms with current residents, deposits, vacate requests or open maintenance can't be deleted."
    />
  );
}
