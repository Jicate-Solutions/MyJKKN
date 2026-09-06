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
  RoomFiltersPanel,
  EMPTY_ROOM_FILTERS,
  roomMatchesFilters,
  type RoomAdvancedFilters,
} from './_components/room-filters-panel';
import {
  HostelRoomService,
  type HostelRoomWithBedsAndOccupancy,
} from '@/lib/services/campus-living/hostel-room-service';
import { ArrowLeft, Loader2, Plus, Trash2, FileDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  const [advancedFilters, setAdvancedFilters] =
    useState<RoomAdvancedFilters>(EMPTY_ROOM_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  // The DataTable owns its search box; mirror the query here (via onSearch) so
  // the PDF export can honour it on top of the floor/status/advanced filters.
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

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
        return (
          matchesStatus &&
          matchesFloor &&
          roomMatchesFilters(room, advancedFilters)
        );
      }),
    [rooms, statusFilter, selectedFloor, advancedFilters]
  );

  const columns = useMemo(
    () => createRoomColumns({ blockId: id, blockType }),
    [id, blockType]
  );

  // Multi-select bulk delete. DataTable renders its own confirm dialog + the
  // selection checkbox column (auto-added once a bulk action is wired) and
  // owns the success/error toast — so this handler stays quiet and just throws
  // on failure.
  const handleBulkDelete = async (selected: HostelRoomWithBedsAndOccupancy[]) => {
    const results = await Promise.allSettled(
      selected.map((room) => HostelRoomService.deleteRoom(room.id))
    );
    await refetch();
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (rejected.length === 0) return;

    // fn_delete_hostel_room names the blocking room and the real reason
    // (residents / deposits / vacate requests / open maintenance), so repeat it
    // verbatim. The previous version inferred "active residents" from the
    // constraint name in a 23503 and told operators to vacate rooms that had
    // been empty for days — the FK also trips on vacated history rows.
    const messages = Array.from(
      new Set(
        rejected.map((r) => {
          const e = r.reason as { message?: string } | undefined;
          return e?.message?.trim() || 'This room could not be deleted.';
        })
      )
    );
    const shown = messages.slice(0, 3).join(' ');
    const rest = messages.length > 3 ? ` …and ${messages.length - 3} more.` : '';
    throw new Error(
      `${rejected.length} of ${selected.length} room${selected.length === 1 ? '' : 's'} could not be deleted. ${shown}${rest}`
    );
  };

  // Bulk PDF export of the currently-visible rooms (floor + status + advanced
  // filters, plus the table's free-text search). jsPDF is dynamically imported
  // so it stays out of the page bundle until the operator actually exports.
  const handleExportPdf = async () => {
    const q = search.trim().toLowerCase();
    const exportRooms = q
      ? filteredRooms.filter((r) =>
          String(r.room_number ?? '').toLowerCase().includes(q)
        )
      : filteredRooms;

    if (exportRooms.length === 0) {
      toast.error('No rooms to export for the current filters');
      return;
    }

    const filters: string[] = [];
    if (selectedFloor !== null)
      filters.push(`Floor = ${FLOOR_LABELS[selectedFloor] ?? `Floor ${selectedFloor}`}`);
    if (statusFilter !== 'all')
      filters.push(
        `Status = ${STATUS_FILTERS.find((s) => s.value === statusFilter)?.label ?? statusFilter}`
      );
    if (JSON.stringify(advancedFilters) !== JSON.stringify(EMPTY_ROOM_FILTERS))
      filters.push('Advanced filters applied');
    if (q) filters.push(`Search = "${search.trim()}"`);

    const blockName =
      (blockData as { name?: string } | undefined)?.name ?? 'Block';

    try {
      setExporting(true);
      const { exportRoomsPdf } = await import('./_components/rooms-pdf');
      await exportRoomsPdf(exportRooms, { blockName, filters });
      toast.success(
        `Exported ${exportRooms.length} room${exportRooms.length === 1 ? '' : 's'} to PDF`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
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
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={exporting || filteredRooms.length === 0}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Export PDF
            </Button>
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
          onSearch={setSearch}
          getRowId={(row) => row.id}
          tableTools={
            <RoomFiltersPanel
              rooms={rooms ?? []}
              value={advancedFilters}
              onChange={setAdvancedFilters}
            />
          }
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
