'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { useRoomsByBlockWithOccupancy } from '@/hooks/campus-living/use-hostel-rooms';
import { useHostelBlock } from '@/hooks/campus-living/use-hostel-blocks';
import { createRoomColumns } from './_components/rooms-columns';
import { RoomFormDialog } from './_components/room-form-dialog';
import { BulkUploadRooms } from './_components/bulk-upload-rooms';
import {
  HostelRoomService,
  type HostelRoomWithBedsAndOccupancy,
} from '@/lib/services/campus-living/hostel-room-service';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'available', label: 'Available' },
  { value: 'partially_occupied', label: 'Partial' },
  { value: 'full', label: 'Full' },
];

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];

// DataTable search matches the room number (the only free-text identifier).
const roomGlobalFilter = (
  row: { original: HostelRoomWithBedsAndOccupancy },
  _columnId: string,
  value: string
) =>
  String(row.original.room_number ?? '')
    .toLowerCase()
    .includes(value.toLowerCase());

export default function BlockRoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const floorParam = searchParams.get('floor');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<number | null>(
    floorParam !== null ? parseInt(floorParam) : null
  );
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rooms, isLoading, refetch } = useRoomsByBlockWithOccupancy(id);
  const { data: blockData } = useHostelBlock(id);
  const blockType = (blockData as { hostel_type?: string } | undefined)?.hostel_type;

  // Floor + status chip filters are block-specific UX; the DataTable layers
  // search + sort + pagination + column visibility on top of the filtered set.
  const filteredRooms = useMemo(
    () =>
      (rooms ?? []).filter((room) => {
        const matchesStatus =
          statusFilter === 'all' || room.derived_status === statusFilter;
        const matchesFloor = selectedFloor === null || room.floor === selectedFloor;
        return matchesStatus && matchesFloor;
      }),
    [rooms, statusFilter, selectedFloor]
  );

  const columns = useMemo(
    () => createRoomColumns({ blockId: id, blockType }),
    [id, blockType]
  );

  // Multi-select bulk delete. DataTable renders its own confirm dialog + the
  // selection checkbox column (auto-added once a bulk action is wired) and
  // owns the success/error toast — so this handler stays quiet and just throws
  // on failure (rooms with active residents can't be deleted).
  const handleBulkDelete = async (selected: HostelRoomWithBedsAndOccupancy[]) => {
    const results = await Promise.allSettled(
      selected.map((room) => HostelRoomService.deleteRoom(room.id))
    );
    await refetch();
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (rejected.length === 0) return;

    // Beds cascade-delete with the room, so the remaining blockers are real
    // dependencies. Surface the actual Postgres reason (Supabase errors are
    // plain { code, details, message } objects, not Error instances).
    const reasonFor = (e: { details?: string; message?: string } | undefined) => {
      const text = `${e?.details ?? ''} ${e?.message ?? ''}`;
      if (text.includes('hostel_allocations')) return 'have active residents (vacate them first)';
      if (text.includes('hostel_maintenance_requests')) return 'have open maintenance requests';
      return 'have linked records that must be removed first';
    };
    const reason = reasonFor(rejected[0].reason as { details?: string; message?: string });
    throw new Error(
      `${rejected.length} of ${selected.length} room${selected.length === 1 ? '' : 's'} could not be deleted — they ${reason}.`
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Rooms">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Block Rooms">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: 'Block Details', href: `/campus-living/blocks/${id}` },
          { label: 'Rooms' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/campus-living/blocks/${id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Rooms</h1>
              <p className="text-sm text-muted-foreground">
                {filteredRooms.length} rooms found
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BulkUploadRooms blockId={id} blockType={blockType} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Button>
          </div>
        </div>

        {/* Floor Filter */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedFloor === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFloor(null)}
          >
            All Floors
          </Button>
          {FLOOR_LABELS.map((label, idx) => (
            <Button
              key={idx}
              variant={selectedFloor === idx ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFloor(idx)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((status) => (
            <Button
              key={status.value}
              variant={statusFilter === status.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status.value)}
            >
              {status.label}
            </Button>
          ))}
        </div>

        {/* Advanced Rooms Table */}
        <DataTable
          columns={columns}
          data={filteredRooms}
          searchPlaceholder="Search rooms..."
          globalFilterFn={roomGlobalFilter}
          getRowId={(row) => row.id}
          onRefresh={() => refetch()}
          onBulkAction={handleBulkDelete}
          bulkActionConfig={{
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive',
            confirmTitle: 'Delete selected rooms?',
            confirmDescription:
              'This permanently deletes the selected room{plural} and their beds. This cannot be undone.',
            successMessage: 'Deleted {count} room{plural}',
            errorMessage: 'Failed to delete the selected rooms',
            loadingText: 'Deleting...',
          }}
        />
      </div>

      <RoomFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        blockId={id}
        blockType={blockType}
      />
    </ContentLayout>
  );
}
