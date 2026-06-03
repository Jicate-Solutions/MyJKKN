'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlock } from '@/hooks/campus-living/use-hostel-blocks';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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

// `getBlock` returns the raw `hostel_blocks` row plus `hostel_rooms` /
// `hostel_wardens` arrays + derived `rooms_summary` / `floor_summary`. The
// assigned wardens live in the `hostel_wardens` array — there is NO pre-computed
// singular `warden` / `deputy_warden` object (an earlier version read those and
// always showed "No warden assigned" even when wardens existed). So this page
// derives the active-warden list from that array and resolves each name from
// `staff` (hostel_wardens stores staff_id, not a name). `recent_activities` is
// still not computed server-side and stays optional.
type BlockWarden = {
  id: string;
  staff_id: string;
  designation?: string | null;
  phone?: string | null;
  shift?: string | null;
  is_residential?: boolean | null;
  is_active?: boolean | null;
};

type FloorSummaryRow = {
  floor: number;
  label: string;
  rooms: number;
  capacity: number;
  occupied: number;
};

type ExtendedFloorRow = FloorSummaryRow & {
  available?: number;
  studentRooms?: number;
  specialRooms?: number;
  attachedBathrooms?: number;
  byType?: Record<string, number>;
  byAC?: Record<string, number>;
  byCategory?: Record<string, number>;
};

type BlockBreakdown = {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  studentRooms: number;
  specialRooms: number;
  byType: Record<string, number>;
  byAC: Record<string, number>;
  byCategory: Record<string, number>;
};

const AC_LABELS: Record<string, string> = { ac: 'AC', non_ac: 'Non-AC', cooler: 'Cooler' };

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

  // Active wardens come from the embedded hostel_wardens array (not a singular
  // block.warden field, which the service never computes).
  const activeWardens = ((block?.hostel_wardens ?? []) as BlockWarden[]).filter(
    (w) => w.is_active !== false
  );
  const staffKey = activeWardens.map((w) => w.staff_id).join(',');

  // hostel_wardens stores staff_id, not a name — resolve names from the staff table.
  const [wardenNames, setWardenNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const ids = Array.from(new Set(activeWardens.map((w) => w.staff_id))).filter(Boolean);
    if (ids.length === 0) {
      setWardenNames(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase
        .from('staff')
        .select('id, first_name, last_name')
        .in('id', ids);
      if (cancelled) return;
      const next = new Map<string, string>();
      ((data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).forEach((s) => {
        const full = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
        if (full) next.set(s.id, full);
      });
      setWardenNames(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey]);

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

  const amenityTags = (block.amenity_tags ?? []) as Array<{ id: string; name: string }>;
  const roomsSummary = (block.rooms_summary ?? {}) as Partial<{
    available: number;
    partially_occupied: number;
    full: number;
    maintenance: number;
    reserved: number;
  }>;
  const floorSummary = (block.floor_summary ?? []) as FloorSummaryRow[];
  const blockBreakdown = (block.block_breakdown ?? null) as BlockBreakdown | null;
  const recentActivities = (block.recent_activities ?? []) as ActivityRow[];

  const formatDesignation = (value?: string | null) =>
    (value ?? '').replace(/_/g, ' ');

  const renderWardenCard = (w: BlockWarden) => {
    const name = wardenNames.get(w.staff_id) ?? 'Unnamed warden';
    return (
      <div
        key={w.id}
        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{name}</p>
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
                  {activeWardens.length === 0 ? (
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <ShieldCheck className="h-6 w-6 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        No warden assigned yet.
                      </p>
                    </div>
                  ) : (
                    activeWardens.map((w) => (
                      <div key={w.id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                        <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium">
                            {wardenNames.get(w.staff_id) ?? 'Unnamed warden'}
                          </p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {formatDesignation(w.designation) || '—'}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {w.phone ?? '—'}
                          </p>
                          {w.shift && (
                            <Badge variant="outline" className="mt-1">{w.shift}</Badge>
                          )}
                        </div>
                      </div>
                    ))
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

                  {amenityTags.length > 0 && (
                    <div className="pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Amenities</p>
                      <div className="flex flex-wrap gap-2">
                        {amenityTags.map((a) => (
                          <Badge key={a.id} variant="default">
                            {a.name}
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
            {/* Block-level summary strip */}
            {blockBreakdown && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Block Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold">{blockBreakdown.totalBeds}</p>
                      <p className="text-xs text-muted-foreground">Total Beds</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold">{blockBreakdown.occupiedBeds}</p>
                      <p className="text-xs text-muted-foreground">Occupied</p>
                    </div>
                    <div className="p-3 bg-green-50 text-green-700 rounded-lg text-center">
                      <p className="text-xl font-bold">{blockBreakdown.availableBeds}</p>
                      <p className="text-xs font-medium">Available Beds</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-xl font-bold">{blockBreakdown.studentRooms}</p>
                      <p className="text-xs text-muted-foreground">
                        Student Rooms
                        {blockBreakdown.specialRooms > 0 && (
                          <span className="ml-1 text-amber-600">· {blockBreakdown.specialRooms} special</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Distribution rows */}
                  <div className="space-y-2 pt-1 border-t">
                    {Object.keys(blockBreakdown.byType).length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">By Type</span>
                        {Object.entries(blockBreakdown.byType).map(([type, count]) => (
                          <span key={type} className="inline-flex items-center gap-1 text-xs">
                            <span className="capitalize">{type}</span>
                            <Badge variant="secondary" className="h-4 px-1.5 text-xs font-semibold">{count}</Badge>
                          </span>
                        ))}
                      </div>
                    )}
                    {Object.keys(blockBreakdown.byAC).length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">By AC</span>
                        {Object.entries(blockBreakdown.byAC).map(([ac, count]) => (
                          <span key={ac} className="inline-flex items-center gap-1 text-xs">
                            <span>{AC_LABELS[ac] ?? ac}</span>
                            <Badge variant="secondary" className="h-4 px-1.5 text-xs font-semibold">{count}</Badge>
                          </span>
                        ))}
                      </div>
                    )}
                    {Object.keys(blockBreakdown.byCategory).length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">By Category</span>
                        {Object.entries(blockBreakdown.byCategory).map(([cat, count]) => (
                          <span key={cat} className="inline-flex items-center gap-1 text-xs">
                            <span>{cat}</span>
                            <Badge variant="secondary" className="h-4 px-1.5 text-xs font-semibold">{count}</Badge>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Per-floor cards */}
            {floorSummary.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No floor data available yet. Add rooms to populate this view.
                </CardContent>
              </Card>
            ) : (
              floorSummary.map((floor) => {
                const pct = floor.capacity > 0 ? Math.round((floor.occupied / floor.capacity) * 100) : 0;
                const ext = floor as ExtendedFloorRow;
                const freeBeds = ext.available ?? Math.max(floor.capacity - floor.occupied, 0);
                const hasBreakdown =
                  Object.keys(ext.byType ?? {}).length > 0 ||
                  Object.keys(ext.byAC ?? {}).length > 0 ||
                  Object.keys(ext.byCategory ?? {}).length > 0;

                return (
                  <Card key={floor.floor}>
                    <CardContent className="p-4 space-y-3">
                      {/* Floor header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{floor.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {floor.rooms} rooms · {floor.occupied}/{floor.capacity} beds occupied
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${
                            pct >= 95 ? 'text-red-600' :
                            pct >= 80 ? 'text-orange-600' :
                            pct >= 50 ? 'text-green-600' :
                            'text-blue-600'
                          }`}>{pct}%</span>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/campus-living/blocks/${id}/rooms?floor=${floor.floor}`}>
                              View Rooms
                            </Link>
                          </Button>
                        </div>
                      </div>

                      {/* Occupancy bar */}
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 95 ? 'bg-red-500' :
                            pct >= 80 ? 'bg-orange-500' :
                            pct >= 50 ? 'bg-green-500' :
                            'bg-blue-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* Stat pills */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-xs">
                          <BedDouble className="h-3 w-3 text-muted-foreground" />
                          {freeBeds} free
                        </span>
                        {(ext.studentRooms ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            <Users className="h-3 w-3" />
                            {ext.studentRooms} student
                          </span>
                        )}
                        {(ext.specialRooms ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            <DoorOpen className="h-3 w-3" />
                            {ext.specialRooms} special
                          </span>
                        )}
                        {(ext.attachedBathrooms ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                            {ext.attachedBathrooms} attached bath
                          </span>
                        )}
                      </div>

                      {/* Category / type / AC breakdown grid */}
                      {hasBreakdown && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
                          {Object.keys(ext.byType ?? {}).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">By Type</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(ext.byType ?? {}).map(([type, count]) => (
                                  <span key={type} className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-xs capitalize">
                                    {type} <span className="font-semibold">{count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {Object.keys(ext.byAC ?? {}).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">By AC</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(ext.byAC ?? {}).map(([ac, count]) => (
                                  <span key={ac} className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-xs">
                                    {AC_LABELS[ac] ?? ac} <span className="font-semibold">{count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {Object.keys(ext.byCategory ?? {}).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">By Category</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(ext.byCategory ?? {}).map(([cat, count]) => (
                                  <span key={cat} className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-xs">
                                    {cat} <span className="font-semibold">{count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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
                {activeWardens.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No wardens assigned yet.
                  </p>
                ) : (
                  activeWardens.map((w) => renderWardenCard(w))
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
