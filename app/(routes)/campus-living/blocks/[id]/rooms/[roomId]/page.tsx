'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useHostelRoom } from '@/hooks/campus-living/use-hostel-rooms';
import {
  ArrowLeft,
  BedDouble,
  User,
  Wrench,
  Phone,
  Calendar,
  Loader2,
  Edit,
  UserPlus
} from 'lucide-react';

const bedStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  available: { label: 'Available', variant: 'success' },
  occupied: { label: 'Occupied', variant: 'default' },
  reserved: { label: 'Reserved', variant: 'outline' },
  maintenance: { label: 'Maintenance', variant: 'destructive' },
};

const maintenancePriorityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'text-red-600 bg-red-50' },
  high: { label: 'High', color: 'text-orange-600 bg-orange-50' },
  medium: { label: 'Medium', color: 'text-amber-600 bg-amber-50' },
  low: { label: 'Low', color: 'text-blue-600 bg-blue-50' },
};

export default function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id, roomId } = use(params);
  const { profile } = useAuth();
  const { data: roomData, isLoading } = useHostelRoom(roomId);
  const room = roomData as any;

  if (isLoading || !room) {
    return (
      <ContentLayout title="Room Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Room ${room.room_number}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: room.block_name, href: `/campus-living/blocks/${id}` },
          { label: 'Rooms', href: `/campus-living/blocks/${id}/rooms` },
          { label: room.room_number },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/campus-living/blocks/${id}/rooms`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">Room {room.room_number}</h1>
                <Badge variant="outline" className="capitalize">{room.room_type}</Badge>
                <Badge variant="outline" className="capitalize">{room.ac_status.replace('_', ' ')}</Badge>
                <Badge variant={room.status === 'full' ? 'secondary' : room.status === 'available' ? 'success' : 'default'}>
                  {room.status.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {room.block_name} &middot; Ground Floor &middot; {room.current_occupancy}/{room.capacity} occupied
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {room.current_occupancy < room.capacity && (
              <Button asChild>
                <Link href={`/campus-living/allocations/new?block=${id}&room=${roomId}`}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Allocate Bed
                </Link>
              </Button>
            )}
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit Room
            </Button>
          </div>
        </div>

        {/* Room Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{room.capacity}</p>
              <p className="text-xs text-muted-foreground">Capacity</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{room.current_occupancy}</p>
              <p className="text-xs text-muted-foreground">Occupied</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(room.annual_fee)}
              </p>
              <p className="text-xs text-muted-foreground">Annual Fee</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{room.has_attached_bathroom ? 'Yes' : 'No'}</p>
              <p className="text-xs text-muted-foreground">Attached Bath</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bed Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Beds</CardTitle>
              <CardDescription>{room.beds.length} beds in this room</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {room.beds.map((bed) => {
                const bCfg = bedStatusConfig[bed.status] ?? { label: bed.status, variant: 'outline' as const };
                return (
                  <div key={bed.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <BedDouble className="h-5 w-5 text-primary" />
                        <span className="font-medium">Bed {bed.bed_number}</span>
                        <Badge variant="outline" className="text-xs capitalize">{bed.bed_type.replace('_', ' ')}</Badge>
                      </div>
                      <Badge variant={bCfg.variant}>{bCfg.label}</Badge>
                    </div>

                    {bed.occupant && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{bed.occupant.name}</span>
                          <span className="text-sm text-muted-foreground">({bed.occupant.roll_number})</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <p>{bed.occupant.department}</p>
                          <p>{bed.occupant.semester}</p>
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {bed.occupant.phone}
                          </p>
                          <p className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Since {bed.occupant.allocation_date}
                          </p>
                        </div>
                      </div>
                    )}

                    {!bed.occupant && bed.status === 'available' && (
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link href={`/campus-living/allocations/new?block=${id}&room=${roomId}&bed=${bed.id}`}>
                          <UserPlus className="mr-2 h-3.5 w-3.5" />
                          Allocate Student
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Room Details & Furniture */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Furniture Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(room.furniture).map(([item, count]) => (
                    <div key={item} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm capitalize">{item}</span>
                      <span className="font-medium">{count as number}</span>
                    </div>
                  ))}
                </div>
                {room.is_accessible && (
                  <Badge variant="outline" className="mt-3">Wheelchair Accessible</Badge>
                )}
                {room.last_inspection_date && (
                  <p className="text-sm text-muted-foreground mt-3">
                    Last inspected: {room.last_inspection_date}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Maintenance History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Maintenance History</CardTitle>
                <CardDescription>{room.maintenance_history.length} past requests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {room.maintenance_history.map((req) => {
                    const pCfg = maintenancePriorityConfig[req.priority] ?? { label: req.priority, color: '' };
                    return (
                      <div key={req.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{req.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Reported: {req.reported_date}
                              {req.resolved_date && ` | Resolved: ${req.resolved_date}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <Badge variant="outline" className={`text-xs ${pCfg.color}`}>{pCfg.label}</Badge>
                          <Badge variant={req.status === 'completed' ? 'success' : 'default'} className="text-xs capitalize">
                            {req.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
