'use client';
// app/(routes)/admin/hostel/rooms/page.tsx
//
// Hostel rooms v2 PR 4a (2026-05-26)
//
// Director-only catalog of all hostel rooms across the network. Pulls
// hostel_rooms ⨝ hostel_blocks(name) and zip-merges live occupancy from
// v_hostel_room_occupancy (active_residents / beds_available /
// derived_status). 146 rows today — flat client-side table, no filters or
// pagination (those land in PR 4b alongside the Allocations module).
//
// "Manage Access" per row opens the room ↔ college access dialog
// (room_institution_access junction).

import { useMemo, useState } from 'react';
import { BedDouble, ShieldCheck } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAllRoomsWithOccupancy } from '@/hooks/campus-living/use-hostel-rooms';
import type {
  HostelRoomWithOccupancy,
  RoomDerivedStatus,
} from '@/lib/services/campus-living/hostel-room-service';

import { RoomCollegeAccessDialog } from './_components/room-college-access-dialog';

export const navMeta = { label: 'Rooms', icon: 'BedDouble' } as const;

// Row shape returned by the hook (room + block join + occupancy).
type RoomRow = HostelRoomWithOccupancy & {
  hostel_blocks: { id: string; name: string; code: string | null } | null;
};

function statusBadge(status: RoomDerivedStatus) {
  switch (status) {
    case 'available':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Available</Badge>;
    case 'partially_occupied':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Partial</Badge>;
    case 'full':
      return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Full</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export default function HostelRoomsAdminPage() {
  const { data, isLoading, error } = useAllRoomsWithOccupancy();
  const [dialogRoom, setDialogRoom] = useState<RoomRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = useMemo<RoomRow[]>(() => (data ?? []) as RoomRow[], [data]);

  const openAccessDialog = (room: RoomRow) => {
    setDialogRoom(room);
    setDialogOpen(true);
  };

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. The Rooms catalog
            governs capacity, block / floor metadata, and per-room college
            access grants across the campus living portfolio.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex items-center gap-3">
          <BedDouble className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hostel Rooms</h1>
            <p className="text-sm text-muted-foreground">
              Full catalog with live occupancy. Use Manage Access to grant or
              revoke per-room college access.
            </p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All rooms</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Loading rooms…'
                : `${rows.length} room${rows.length === 1 ? '' : 's'} across the network.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load rooms: {(error as Error).message}
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm italic text-muted-foreground">
                No rooms found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Room</TableHead>
                      <TableHead>Block</TableHead>
                      <TableHead className="text-center">Floor</TableHead>
                      <TableHead className="text-center">Capacity</TableHead>
                      <TableHead className="text-center">AC</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Beds available</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.room_number}</TableCell>
                        <TableCell>{room.hostel_blocks?.name ?? '—'}</TableCell>
                        <TableCell className="text-center">{room.floor}</TableCell>
                        <TableCell className="text-center">{room.capacity}</TableCell>
                        <TableCell className="text-center">
                          {room.ac_status === 'ac' ? (
                            <Badge variant="secondary" className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                              AC
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Non-AC</span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(room.derived_status)}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {room.beds_available}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAccessDialog(room)}
                          >
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Manage Access
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <RoomCollegeAccessDialog
          room={dialogRoom}
          open={dialogOpen}
          onOpenChange={(next) => {
            setDialogOpen(next);
            if (!next) setDialogRoom(null);
          }}
        />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
