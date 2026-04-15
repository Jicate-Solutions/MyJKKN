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
import { useRoomsByBlock } from '@/hooks/campus-living/use-hostel-rooms';
import {
  ArrowLeft,
  Search,
  BedDouble,
  Loader2,
  Plus,
  Filter,
  Users
} from 'lucide-react';

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

  const { data: rooms, isLoading } = useRoomsByBlock(id);

  const filteredRooms = rooms?.filter((room) => {
    const matchesSearch = room.room_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
    const matchesFloor = selectedFloor === null || room.floor === selectedFloor;
    return matchesSearch && matchesStatus && matchesFloor;
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
