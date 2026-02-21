'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  ArrowLeft,
  Search,
  BedDouble,
  Loader2,
  Plus,
  Filter,
  Users
} from 'lucide-react';

// Placeholder data
const useHostelRooms = (blockId: string, floor?: number | null) => {
  const allRooms = [
    { id: 'r1', room_number: 'G-101', floor: 0, room_type: 'double', ac_status: 'non_ac', capacity: 2, current_occupancy: 2, status: 'full', has_attached_bathroom: true, annual_fee: 45000 },
    { id: 'r2', room_number: 'G-102', floor: 0, room_type: 'double', ac_status: 'non_ac', capacity: 2, current_occupancy: 1, status: 'partially_occupied', has_attached_bathroom: true, annual_fee: 45000 },
    { id: 'r3', room_number: 'G-103', floor: 0, room_type: 'triple', ac_status: 'non_ac', capacity: 3, current_occupancy: 0, status: 'available', has_attached_bathroom: false, annual_fee: 35000 },
    { id: 'r4', room_number: 'G-104', floor: 0, room_type: 'triple', ac_status: 'non_ac', capacity: 3, current_occupancy: 3, status: 'full', has_attached_bathroom: false, annual_fee: 35000 },
    { id: 'r5', room_number: 'G-105', floor: 0, room_type: 'single', ac_status: 'ac', capacity: 1, current_occupancy: 0, status: 'maintenance', has_attached_bathroom: true, annual_fee: 75000 },
    { id: 'r6', room_number: 'F1-201', floor: 1, room_type: 'double', ac_status: 'ac', capacity: 2, current_occupancy: 2, status: 'full', has_attached_bathroom: true, annual_fee: 65000 },
    { id: 'r7', room_number: 'F1-202', floor: 1, room_type: 'double', ac_status: 'ac', capacity: 2, current_occupancy: 1, status: 'partially_occupied', has_attached_bathroom: true, annual_fee: 65000 },
    { id: 'r8', room_number: 'F1-203', floor: 1, room_type: 'triple', ac_status: 'non_ac', capacity: 3, current_occupancy: 2, status: 'partially_occupied', has_attached_bathroom: false, annual_fee: 35000 },
    { id: 'r9', room_number: 'F2-301', floor: 2, room_type: 'quad', ac_status: 'non_ac', capacity: 4, current_occupancy: 4, status: 'full', has_attached_bathroom: false, annual_fee: 30000 },
    { id: 'r10', room_number: 'F2-302', floor: 2, room_type: 'quad', ac_status: 'non_ac', capacity: 4, current_occupancy: 3, status: 'partially_occupied', has_attached_bathroom: false, annual_fee: 30000 },
    { id: 'r11', room_number: 'F3-401', floor: 3, room_type: 'double', ac_status: 'cooler', capacity: 2, current_occupancy: 0, status: 'reserved', has_attached_bathroom: true, annual_fee: 50000 },
    { id: 'r12', room_number: 'F3-402', floor: 3, room_type: 'double', ac_status: 'cooler', capacity: 2, current_occupancy: 2, status: 'full', has_attached_bathroom: true, annual_fee: 50000 },
  ];

  const rooms = floor !== null && floor !== undefined
    ? allRooms.filter((r) => r.floor === floor)
    : allRooms;

  return { data: rooms, isLoading: false, error: null };
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  available: { label: 'Available', variant: 'success' },
  partially_occupied: { label: 'Partial', variant: 'default' },
  full: { label: 'Full', variant: 'secondary' },
  maintenance: { label: 'Maintenance', variant: 'destructive' },
  reserved: { label: 'Reserved', variant: 'outline' },
  closed: { label: 'Closed', variant: 'outline' },
};

export default function BlockRoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const floorParam = searchParams.get('floor');
  const { profile } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<number | null>(
    floorParam !== null ? parseInt(floorParam) : null
  );

  const { data: rooms, isLoading } = useHostelRooms(id, selectedFloor);

  const filteredRooms = rooms?.filter((room) => {
    const matchesSearch = room.room_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  const floorLabels = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];

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
          <Button asChild>
            <Link href={`/campus-living/blocks/${id}/rooms/new`}>
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
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
            {floorLabels.map((label, idx) => (
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
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'available', 'partially_occupied', 'full', 'maintenance', 'reserved'].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All Status' : statusConfig[status]?.label ?? status}
            </Button>
          ))}
        </div>

        {/* Rooms Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room No.</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>AC</TableHead>
                  <TableHead>Occupancy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bathroom</TableHead>
                  <TableHead className="text-right">Annual Fee</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRooms.map((room) => {
                  const sCfg = statusConfig[room.status] ?? { label: room.status, variant: 'outline' as const };
                  return (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">{room.room_number}</TableCell>
                      <TableCell>{floorLabels[room.floor] ?? `Floor ${room.floor}`}</TableCell>
                      <TableCell className="capitalize">{room.room_type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {room.ac_status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{room.current_occupancy}/{room.capacity}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                      </TableCell>
                      <TableCell>{room.has_attached_bathroom ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(room.annual_fee)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campus-living/blocks/${id}/rooms/${room.id}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRooms.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No rooms found matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
