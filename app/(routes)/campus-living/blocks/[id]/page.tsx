'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlock } from '@/hooks/campus-living/use-hostel-blocks';
import {
  Building2,
  ArrowLeft,
  Edit,
  Users,
  BedDouble,
  DoorOpen,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  Wifi,
  Loader2,
  Wrench,
  ClipboardCheck,
  CalendarOff,
  Settings
} from 'lucide-react';

export default function BlockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: blockData, isLoading } = useHostelBlock(id);
  const block = blockData as any;

  if (isLoading || !block) {
    return (
      <ContentLayout title="Block Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const occupancyPercent = Math.round((block.current_occupancy / block.total_capacity) * 100);

  return (
    <ContentLayout title={block.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: block.name },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/blocks">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{block.name}</h1>
                <Badge variant="outline">{block.code}</Badge>
                <Badge variant={block.hostel_type === 'boys' ? 'default' : 'secondary'}>
                  {block.hostel_type}
                </Badge>
                <Badge variant="success">
                  {block.status === 'active' ? 'Active' : block.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3" /> {block.address}
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/campus-living/blocks/${id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Block
            </Link>
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{block.total_floors}</p>
              <p className="text-xs text-muted-foreground">Floors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{block.total_rooms}</p>
              <p className="text-xs text-muted-foreground">Rooms</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{block.total_capacity}</p>
              <p className="text-xs text-muted-foreground">Capacity</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{block.current_occupancy}</p>
              <p className="text-xs text-muted-foreground">Occupied</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{block.total_capacity - block.current_occupancy}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{occupancyPercent}%</p>
              <p className="text-xs text-muted-foreground">Occupancy</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="floors">Floors & Rooms</TabsTrigger>
            <TabsTrigger value="wardens">Wardens</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Warden Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Warden Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                    <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{block.warden.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{block.warden.designation.replace('_', ' ')}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {block.warden.phone}</p>
                      <Badge variant="outline" className="mt-1">{block.warden.shift}</Badge>
                    </div>
                  </div>
                  {block.deputy_warden && (
                    <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                      <ShieldCheck className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium">{block.deputy_warden.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{block.deputy_warden.designation.replace('_', ' ')}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {block.deputy_warden.phone}</p>
                        <Badge variant="outline" className="mt-1">{block.deputy_warden.shift}</Badge>
                      </div>
                    </div>
                  )}
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link href={`/campus-living/blocks/${id}/wardens`}>
                      Manage Wardens
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Timings & Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Timings & Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Curfew (Weekday)</p>
                      <p className="font-medium flex items-center gap-1 mt-1">
                        <Clock className="h-3.5 w-3.5" /> {block.curfew_time_weekday}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Curfew (Weekend)</p>
                      <p className="font-medium flex items-center gap-1 mt-1">
                        <Clock className="h-3.5 w-3.5" /> {block.curfew_time_weekend}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Visiting Hours</p>
                      <p className="font-medium mt-1">{block.visiting_hours_start} - {block.visiting_hours_end}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Emergency Phone</p>
                      <p className="font-medium flex items-center gap-1 mt-1">
                        <Phone className="h-3.5 w-3.5" /> {block.contact_phone}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(block.amenities).map(([amenity, available]) => (
                        <Badge
                          key={amenity}
                          variant={available ? 'default' : 'outline'}
                          className={`capitalize ${!available ? 'opacity-40 line-through' : ''}`}
                        >
                          {amenity.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Room Status Summary */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Room Status Summary</CardTitle>
                  <CardDescription>{block.total_rooms} total rooms</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/campus-living/blocks/${id}/rooms`}>
                    View All Rooms
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {[
                    { label: 'Available', count: block.rooms_summary.available, color: 'text-green-600 bg-green-50' },
                    { label: 'Partial', count: block.rooms_summary.partially_occupied, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Full', count: block.rooms_summary.full, color: 'text-purple-600 bg-purple-50' },
                    { label: 'Maintenance', count: block.rooms_summary.maintenance, color: 'text-orange-600 bg-orange-50' },
                    { label: 'Reserved', count: block.rooms_summary.reserved, color: 'text-amber-600 bg-amber-50' },
                  ].map((item) => (
                    <div key={item.label} className={`p-4 rounded-lg text-center ${item.color}`}>
                      <p className="text-2xl font-bold">{item.count}</p>
                      <p className="text-xs font-medium">{item.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Floors & Rooms Tab */}
          <TabsContent value="floors" className="space-y-4">
            {block.floor_summary.map((floor) => {
              const floorOccupancy = floor.capacity > 0 ? Math.round((floor.occupied / floor.capacity) * 100) : 0;
              return (
                <Card key={floor.floor}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{floor.label}</p>
                        <p className="text-sm text-muted-foreground">{floor.rooms} rooms, {floor.occupied} occupied of {floor.capacity} beds</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{floorOccupancy}%</span>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/campus-living/blocks/${id}/rooms?floor=${floor.floor}`}>
                            View Rooms
                          </Link>
                        </Button>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          floorOccupancy >= 95 ? 'bg-red-500' :
                          floorOccupancy >= 80 ? 'bg-green-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${floorOccupancy}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Wardens Tab */}
          <TabsContent value="wardens">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Warden Assignments</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/campus-living/blocks/${id}/wardens`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Manage
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {[block.warden, block.deputy_warden].filter(Boolean).map((w) => (
                  <div key={w!.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{w!.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{w!.designation.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p>{w!.phone}</p>
                      <div className="flex gap-1 mt-1 justify-end">
                        <Badge variant="outline" className="text-xs">{w!.shift}</Badge>
                        {w!.is_residential && <Badge variant="secondary" className="text-xs">Residential</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>Latest actions in this block</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {block.recent_activities.map((activity) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      allocation: <BedDouble className="h-4 w-4 text-green-600" />,
                      leave: <CalendarOff className="h-4 w-4 text-amber-600" />,
                      maintenance: <Wrench className="h-4 w-4 text-orange-600" />,
                      attendance: <ClipboardCheck className="h-4 w-4 text-blue-600" />,
                      transfer: <DoorOpen className="h-4 w-4 text-purple-600" />,
                    };

                    return (
                      <div key={activity.id} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
                        <div className="mt-0.5 shrink-0">{iconMap[activity.type] ?? <Building2 className="h-4 w-4" />}</div>
                        <div className="flex-1">
                          <p className="text-sm">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
