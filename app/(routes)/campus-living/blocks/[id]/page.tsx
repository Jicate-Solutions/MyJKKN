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

// Shape that the page renders against. The service currently returns the raw
// `hostel_blocks` row plus `hostel_rooms` / `hostel_wardens` arrays — nested
// `warden` / `deputy_warden` objects, `rooms_summary`, `floor_summary`, and
// `recent_activities` are NOT computed server-side. Treating everything past
// the row columns as optional keeps the detail page from crashing the route's
// error boundary when a block has no warden assigned yet (BUG-003892 — the
// "Girls Hostel A" block on production has warden_id = NULL, which made the
// page throw "Cannot read properties of undefined (reading 'name')" and the
// (routes)/error.tsx boundary rendered "Something went wrong" / "error error").
type WardenLike = {
  id?: string;
  name?: string | null;
  designation?: string | null;
  phone?: string | null;
  shift?: string | null;
  is_residential?: boolean | null;
} | null | undefined;

type FloorSummaryRow = {
  floor: number;
  label: string;
  rooms: number;
  capacity: number;
  occupied: number;
};

type ActivityRow = {
  id: string;
  type: string;
  description: string;
  time: string;
};

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

  const totalCapacity = Number(block.total_capacity ?? 0);
  const currentOccupancy = Number(block.current_occupancy ?? 0);
  const totalRooms = Number(block.total_rooms ?? 0);
  const totalFloors = Number(block.total_floors ?? 0);
  const occupancyPercent =
    totalCapacity > 0 ? Math.round((currentOccupancy / totalCapacity) * 100) : 0;
  const availableCapacity = Math.max(totalCapacity - currentOccupancy, 0);

  const warden: WardenLike = block.warden ?? null;
  const deputyWarden: WardenLike = block.deputy_warden ?? null;
  const amenitiesEntries = Object.entries((block.amenities ?? {}) as Record<string, boolean>);
  const roomsSummary = (block.rooms_summary ?? {}) as Partial<{
    available: number;
    partially_occupied: number;
    full: number;
    maintenance: number;
    reserved: number;
  }>;
  const floorSummary = (block.floor_summary ?? []) as FloorSummaryRow[];
  const recentActivities = (block.recent_activities ?? []) as ActivityRow[];

  const formatDesignation = (value?: string | null) =>
    (value ?? '').replace(/_/g, ' ');

  const renderWardenCard = (w: WardenLike, fallbackKey: string) => {
    if (!w) return null;
    return (
      <div
        key={w.id ?? fallbackKey}
        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{w.name ?? 'Unnamed warden'}</p>
            <p className="text-sm text-muted-foreground capitalize">
              {formatDesignation(w.designation) || '—'}
            </p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p>{w.phone ?? '—'}</p>
          <div className="flex gap-1 mt-1 justify-end">
            {w.shift && <Badge variant="outline" className="text-xs">{w.shift}</Badge>}
            {w.is_residential && (
              <Badge variant="secondary" className="text-xs">Residential</Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <ContentLayout title={block.name ?? 'Block Details'}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks', href: '/campus-living/blocks' },
          { label: block.name ?? 'Block' },
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{block.name ?? 'Untitled Block'}</h1>
                {block.code && <Badge variant="outline">{block.code}</Badge>}
                {block.hostel_type && (
                  <Badge variant={block.hostel_type === 'boys' ? 'default' : 'secondary'}>
                    {block.hostel_type}
                  </Badge>
                )}
                {block.status && (
                  <Badge variant="success">
                    {block.status === 'active' ? 'Active' : block.status}
                  </Badge>
                )}
              </div>
              {block.address && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3" /> {block.address}
                </p>
              )}
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
              <p className="text-2xl font-bold">{totalFloors}</p>
              <p className="text-xs text-muted-foreground">Floors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{totalRooms}</p>
              <p className="text-xs text-muted-foreground">Rooms</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{totalCapacity}</p>
              <p className="text-xs text-muted-foreground">Capacity</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{currentOccupancy}</p>
              <p className="text-xs text-muted-foreground">Occupied</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{availableCapacity}</p>
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
                  {warden ? (
                    <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                      <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium">{warden.name ?? 'Unnamed warden'}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {formatDesignation(warden.designation) || '—'}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {warden.phone ?? '—'}
                        </p>
                        {warden.shift && (
                          <Badge variant="outline" className="mt-1">{warden.shift}</Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <ShieldCheck className="h-6 w-6 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        No warden assigned yet.
                      </p>
                    </div>
                  )}
                  {deputyWarden && (
                    <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                      <ShieldCheck className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium">{deputyWarden.name ?? 'Unnamed deputy'}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {formatDesignation(deputyWarden.designation) || '—'}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {deputyWarden.phone ?? '—'}
                        </p>
                        {deputyWarden.shift && (
                          <Badge variant="outline" className="mt-1">{deputyWarden.shift}</Badge>
                        )}
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
                        <Clock className="h-3.5 w-3.5" /> {block.curfew_time_weekday ?? '—'}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Curfew (Weekend)</p>
                      <p className="font-medium flex items-center gap-1 mt-1">
                        <Clock className="h-3.5 w-3.5" /> {block.curfew_time_weekend ?? '—'}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Visiting Hours</p>
                      <p className="font-medium mt-1">
                        {block.visiting_hours_start ?? '—'} - {block.visiting_hours_end ?? '—'}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Emergency Phone</p>
                      <p className="font-medium flex items-center gap-1 mt-1">
                        <Phone className="h-3.5 w-3.5" /> {block.contact_phone ?? '—'}
                      </p>
                    </div>
                  </div>

                  {amenitiesEntries.length > 0 && (
                    <div className="pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Amenities</p>
                      <div className="flex flex-wrap gap-2">
                        {amenitiesEntries.map(([amenity, available]) => (
                          <Badge
                            key={amenity}
                            variant={available ? 'default' : 'outline'}
                            className={`capitalize ${!available ? 'opacity-40 line-through' : ''}`}
                          >
                            {amenity.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Room Status Summary */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Room Status Summary</CardTitle>
                  <CardDescription>{totalRooms} total rooms</CardDescription>
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
                    { label: 'Available', count: roomsSummary.available ?? 0, color: 'text-green-600 bg-green-50' },
                    { label: 'Partial', count: roomsSummary.partially_occupied ?? 0, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Full', count: roomsSummary.full ?? 0, color: 'text-purple-600 bg-purple-50' },
                    { label: 'Maintenance', count: roomsSummary.maintenance ?? 0, color: 'text-orange-600 bg-orange-50' },
                    { label: 'Reserved', count: roomsSummary.reserved ?? 0, color: 'text-amber-600 bg-amber-50' },
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
            {floorSummary.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No floor data available yet. Add rooms to populate this view.
                </CardContent>
              </Card>
            ) : (
              floorSummary.map((floor) => {
                const floorOccupancy =
                  floor.capacity > 0 ? Math.round((floor.occupied / floor.capacity) * 100) : 0;
                return (
                  <Card key={floor.floor}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{floor.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {floor.rooms} rooms, {floor.occupied} occupied of {floor.capacity} beds
                          </p>
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
              })
            )}
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
                {[warden, deputyWarden].filter(Boolean).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No wardens assigned yet.
                  </p>
                ) : (
                  [warden, deputyWarden].map((w, idx) => renderWardenCard(w, `warden-${idx}`))
                )}
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
                {recentActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No recent activity to show.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recentActivities.map((activity) => {
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
