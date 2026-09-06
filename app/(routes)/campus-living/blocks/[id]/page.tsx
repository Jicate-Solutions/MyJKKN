'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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

// One category's live occupancy (student rooms only) — block-wide or per-floor.
type CategoryOccupancyRow = {
  category: string;
  rooms: number; full: number; partial: number; empty: number;
  beds: number; occupied: number; free: number;
};

type FloorCategorySummary = {
  floor: number;
  label: string;
  categories: CategoryOccupancyRow[];
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

// Room-status palette, CVD/contrast-validated (dataviz six-checks) for light
// (#fcfcfb) and dark (#1a1a19) surfaces. Fixed assignment order — identity is
// also carried by the legend labels + counts, never color alone.
// "Empty" = fully vacant room (was mislabelled "Available", which admins read
// as available BEDS — free-bed figures live in the headline tiles instead).
const ROOM_STATUS_META = [
  { key: 'full', label: 'Full', swatch: 'bg-[#7c3aed] dark:bg-[#8b5cf6]' },
  { key: 'partially_occupied', label: 'Partial', swatch: 'bg-[#0284c7]' },
  { key: 'available', label: 'Empty', swatch: 'bg-[#15803d] dark:bg-[#16a34a]' },
  { key: 'maintenance', label: 'Maintenance', swatch: 'bg-[#c2410c] dark:bg-[#ea580c]' },
  { key: 'reserved', label: 'Reserved', swatch: 'bg-[#0891b2]' },
] as const;

type ActivityRow = {
  id: string;
  type: string;
  description: string;
  time: string;
};

const BLOCK_DETAIL_TABS = ['overview', 'floors', 'wardens', 'activity'] as const;

function BlockDetailPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useTabParam('overview', BLOCK_DETAIL_TABS);
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
  const categorySummary = (block.category_summary ?? []) as CategoryOccupancyRow[];
  const floorCategorySummary = (block.floor_category_summary ?? []) as FloorCategorySummary[];

  // Room-status composition in fixed assignment order (see ROOM_STATUS_META).
  const statusCounts = ROOM_STATUS_META.map((m) => ({
    ...m,
    count: Number(roomsSummary[m.key as keyof typeof roomsSummary] ?? 0),
  }));
  const statusTotal = statusCounts.reduce((n, s) => n + s.count, 0);
  const recentActivities = (block.recent_activities ?? []) as ActivityRow[];

  const formatDesignation = (value?: string | null) =>
    (value ?? '').replace(/_/g, ' ');

  // Category occupancy table — shared by the block-wide summary and each
  // floor section. "Full/Partial/Empty" are room counts by live derived
  // status; bed columns come from live allocations (not stored counters).
  const renderCategoryTable = (rows: CategoryOccupancyRow[], withTotals = false) => {
    const total = rows.reduce(
      (t, r) => ({
        rooms: t.rooms + r.rooms, full: t.full + r.full, partial: t.partial + r.partial,
        empty: t.empty + r.empty, beds: t.beds + r.beds,
        occupied: t.occupied + r.occupied, free: t.free + r.free,
      }),
      { rooms: 0, full: 0, partial: 0, empty: 0, beds: 0, occupied: 0, free: 0 },
    );
    return (
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Rooms</TableHead>
            <TableHead className="text-right text-purple-600">Full</TableHead>
            <TableHead className="text-right text-blue-600">Partial</TableHead>
            <TableHead className="text-right text-green-600">Empty</TableHead>
            <TableHead className="text-right">Beds</TableHead>
            <TableHead className="text-right">Occupied</TableHead>
            <TableHead className="text-right text-green-600">Free Beds</TableHead>
            <TableHead className="w-28">Occupancy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const pct = r.beds > 0 ? Math.round((r.occupied / r.beds) * 100) : 0;
            return (
              <TableRow key={r.category}>
                <TableCell className="font-medium">{r.category}</TableCell>
                <TableCell className="text-right tabular-nums">{r.rooms}</TableCell>
                <TableCell className="text-right tabular-nums">{r.full}</TableCell>
                <TableCell className="text-right tabular-nums">{r.partial}</TableCell>
                <TableCell className="text-right tabular-nums">{r.empty}</TableCell>
                <TableCell className="text-right tabular-nums">{r.beds}</TableCell>
                <TableCell className="text-right tabular-nums">{r.occupied}</TableCell>
                <TableCell className={`text-right tabular-nums font-semibold ${r.free > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {r.free}
                </TableCell>
                <TableCell>
                  <div
                    className="h-2 w-full min-w-16 rounded-full bg-muted overflow-hidden"
                    title={`${pct}% of beds occupied`}
                  >
                    <div
                      className="h-full rounded-full bg-[#0284c7]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {withTotals && rows.length > 1 && (
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{total.rooms}</TableCell>
              <TableCell className="text-right tabular-nums">{total.full}</TableCell>
              <TableCell className="text-right tabular-nums">{total.partial}</TableCell>
              <TableCell className="text-right tabular-nums">{total.empty}</TableCell>
              <TableCell className="text-right tabular-nums">{total.beds}</TableCell>
              <TableCell className="text-right tabular-nums">{total.occupied}</TableCell>
              <TableCell className={`text-right tabular-nums ${total.free > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {total.free}
              </TableCell>
              <TableCell>
                <div
                  className="h-2 w-full min-w-16 rounded-full bg-muted overflow-hidden"
                  title={`${total.beds > 0 ? Math.round((total.occupied / total.beds) * 100) : 0}% of beds occupied`}
                >
                  <div
                    className="h-full rounded-full bg-[#0284c7]"
                    style={{ width: `${total.beds > 0 ? Math.round((total.occupied / total.beds) * 100) : 0}%` }}
                  />
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  };

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
              <CardContent className="space-y-6">
                {/* Bed availability headline — the question this card answers is
                    "how much space is left?", and that answer is BEDS, not the
                    count of fully-empty rooms (which is 0 in a busy block even
                    when beds remain free inside partial rooms). */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg text-center bg-emerald-50 dark:bg-emerald-950/40">
                    <p className={`text-3xl font-bold tabular-nums ${
                      (blockBreakdown?.availableBeds ?? 0) > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }`}>
                      {blockBreakdown?.availableBeds ?? availableCapacity}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Free Beds</p>
                  </div>
                  <div className="p-4 rounded-lg text-center bg-muted/40">
                    <p className="text-3xl font-bold tabular-nums">{blockBreakdown?.occupiedBeds ?? currentOccupancy}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Occupied Beds</p>
                  </div>
                  <div className="p-4 rounded-lg text-center bg-muted/40">
                    <p className="text-3xl font-bold tabular-nums">{blockBreakdown?.totalBeds ?? totalCapacity}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Total Beds</p>
                  </div>
                  <div className="p-4 rounded-lg text-center bg-muted/40">
                    <p className="text-3xl font-bold tabular-nums">{occupancyPercent}%</p>
                    <p className="text-xs font-medium text-muted-foreground mt-1">Occupancy</p>
                  </div>
                </div>

                {/* Rooms by status — one proportion bar (composition) + legend
                    with counts, replacing five disconnected tiles. */}
                {statusTotal > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-semibold">Rooms by status</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{statusTotal} rooms</p>
                    </div>
                    <div className="flex h-6 w-full gap-[2px]">
                      {statusCounts.filter((s) => s.count > 0).map((s) => (
                        <div
                          key={s.key}
                          className={`h-full first:rounded-l-md last:rounded-r-md ${s.swatch}`}
                          style={{ width: `${(s.count / statusTotal) * 100}%` }}
                          title={`${s.label} — ${s.count} room${s.count !== 1 ? 's' : ''} (${Math.round((s.count / statusTotal) * 100)}%)`}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
                      {statusCounts.map((s) => (
                        <span
                          key={s.key}
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            s.count === 0 ? 'text-muted-foreground/60' : 'text-foreground'
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-sm ${s.swatch} ${s.count === 0 ? 'opacity-30' : ''}`} />
                          {s.label} <span className="font-semibold tabular-nums">{s.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category-wise summary — entire block (student rooms, live occupancy) */}
                {categorySummary.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">By Category — entire block</p>
                    {renderCategoryTable(categorySummary, true)}
                  </div>
                )}

                {/* Floor × category matrix */}
                {floorCategorySummary.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold">Floor-wise breakdown</p>
                    {floorCategorySummary.map((f) => {
                      const fRooms = f.categories.reduce((n, c) => n + c.rooms, 0);
                      const fFree = f.categories.reduce((n, c) => n + c.free, 0);
                      return (
                        <div key={f.floor} className="rounded-lg border border-border/60 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                            <p className="text-sm font-medium">{f.label}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {fRooms} room{fRooms !== 1 ? 's' : ''} · {fFree} bed{fFree !== 1 ? 's' : ''} free
                            </p>
                          </div>
                          {renderCategoryTable(f.categories)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Floors & Rooms Tab */}
          <TabsContent value="floors" className="space-y-3">

            {/* ── Block summary card ──────────────────────────────── */}
            {blockBreakdown && (
              <Card className="overflow-hidden border border-border/60 shadow-sm">
                <CardHeader className="px-5 py-3.5 border-b bg-muted/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold leading-none">Block Summary</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {totalRooms} rooms · {totalFloors} floor{totalFloors !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                      <Link href={`/campus-living/blocks/${id}/rooms`}>View All Rooms</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {/* KPI tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-muted/40 p-3.5">
                      <p className="text-2xl font-bold tabular-nums leading-none">{blockBreakdown.totalBeds}</p>
                      <p className="text-xs text-muted-foreground mt-1.5 font-medium">Total Beds</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3.5">
                      <p className="text-2xl font-bold tabular-nums leading-none text-blue-700">{blockBreakdown.occupiedBeds}</p>
                      <p className="text-xs text-blue-600/70 mt-1.5 font-medium">Occupied</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3.5">
                      <p className="text-2xl font-bold tabular-nums leading-none text-emerald-700">{blockBreakdown.availableBeds}</p>
                      <p className="text-xs text-emerald-600/70 mt-1.5 font-medium">Available Beds</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3.5">
                      <p className="text-2xl font-bold tabular-nums leading-none">{blockBreakdown.studentRooms}</p>
                      <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                        Student Rooms
                        {blockBreakdown.specialRooms > 0 && (
                          <span className="ml-1 text-amber-500">+{blockBreakdown.specialRooms} special</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Distribution chip rows */}
                  {(Object.keys(blockBreakdown.byType).length > 0 ||
                    Object.keys(blockBreakdown.byAC).length > 0 ||
                    Object.keys(blockBreakdown.byCategory).length > 0) && (
                    <div className="space-y-2.5 pt-3 border-t border-border/50">
                      {Object.keys(blockBreakdown.byType).length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 shrink-0">Type</span>
                          {Object.entries(blockBreakdown.byType).map(([type, count]) => (
                            <span key={type} className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">
                              {type}
                              <span className="tabular-nums font-bold text-blue-900">{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {Object.keys(blockBreakdown.byAC).length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 shrink-0">AC</span>
                          {Object.entries(blockBreakdown.byAC).map(([ac, count]) => (
                            <span key={ac} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                              ac === 'ac' ? 'bg-sky-50 border-sky-100 text-sky-700' :
                              ac === 'cooler' ? 'bg-cyan-50 border-cyan-100 text-cyan-700' :
                              'bg-muted/60 border-border/60 text-muted-foreground'
                            }`}>
                              {AC_LABELS[ac] ?? ac}
                              <span className="tabular-nums font-bold">{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {Object.keys(blockBreakdown.byCategory).length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 shrink-0">Category</span>
                          {Object.entries(blockBreakdown.byCategory).map(([cat, count]) => (
                            <span key={cat} className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                              {cat}
                              <span className="tabular-nums font-bold text-violet-900">{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Per-floor cards ──────────────────────────────────── */}
            {floorSummary.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No floor data available yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Add rooms to populate this view.</p>
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

                const barColor  = pct >= 95 ? 'bg-red-500'     : pct >= 80 ? 'bg-orange-500' : pct >= 50 ? 'bg-emerald-500' : 'bg-blue-400';
                const pctColor  = pct >= 95 ? 'text-red-600'   : pct >= 80 ? 'text-orange-600' : pct >= 50 ? 'text-emerald-600' : 'text-blue-600';
                const badgeBg   = pct >= 95 ? 'bg-red-50 text-red-700'    : pct >= 80 ? 'bg-orange-50 text-orange-700' : pct >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700';

                return (
                  <Card key={floor.floor} className="overflow-hidden border border-border/60 shadow-sm">
                    {/* Severity accent stripe */}
                    <div className={`h-1 w-full ${barColor}`} />

                    <CardContent className="p-5 space-y-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`mt-0.5 h-9 w-9 rounded-lg ${badgeBg} flex items-center justify-center shrink-0 font-bold text-sm tabular-nums`}>
                            {floor.floor === 0 ? 'G' : floor.floor}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm leading-none">{floor.label}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="tabular-nums">{floor.rooms}</span> room{floor.rooms !== 1 ? 's' : ''} ·{' '}
                              <span className="tabular-nums">{floor.occupied}</span>/<span className="tabular-nums">{floor.capacity}</span> beds occupied
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <p className={`text-2xl font-bold tabular-nums leading-none ${pctColor}`}>{pct}%</p>
                            <p className="text-xs text-muted-foreground mt-0.5">full</p>
                          </div>
                          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                            <Link href={`/campus-living/blocks/${id}/rooms?floor=${floor.floor}`}>
                              View Rooms
                            </Link>
                          </Button>
                        </div>
                      </div>

                      {/* Progress bar with endpoint labels */}
                      <div className="space-y-1.5">
                        <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                          <span>{floor.occupied} occupied</span>
                          <span>{freeBeds} free</span>
                        </div>
                      </div>

                      {/* Stat pills */}
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/40 px-2.5 py-1 text-xs font-medium text-foreground">
                          <BedDouble className="h-3 w-3 text-muted-foreground" />
                          <span className="tabular-nums">{freeBeds}</span> beds free
                        </span>
                        {(ext.studentRooms ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                            <Users className="h-3 w-3" />
                            <span className="tabular-nums">{ext.studentRooms}</span> student
                          </span>
                        )}
                        {(ext.specialRooms ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                            <DoorOpen className="h-3 w-3" />
                            <span className="tabular-nums">{ext.specialRooms}</span> special
                          </span>
                        )}
                        {(ext.attachedBathrooms ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            <span className="tabular-nums">{ext.attachedBathrooms}</span> attached bath
                          </span>
                        )}
                      </div>

                      {/* Breakdown grid — only when data exists */}
                      {hasBreakdown && (
                        <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {Object.keys(ext.byType ?? {}).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Room Type</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(ext.byType ?? {}).map(([type, count]) => (
                                  <span key={type} className="inline-flex items-center gap-1 rounded-md bg-white border border-blue-100 px-2 py-0.5 text-xs text-blue-800 capitalize shadow-sm">
                                    {type} <span className="font-bold tabular-nums">{count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {Object.keys(ext.byAC ?? {}).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AC Status</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(ext.byAC ?? {}).map(([ac, count]) => (
                                  <span key={ac} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs shadow-sm ${
                                    ac === 'ac'     ? 'bg-sky-50 border-sky-100 text-sky-800' :
                                    ac === 'cooler' ? 'bg-cyan-50 border-cyan-100 text-cyan-800' :
                                    'bg-white border-border/60 text-muted-foreground'
                                  }`}>
                                    {AC_LABELS[ac] ?? ac} <span className="font-bold tabular-nums">{count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {Object.keys(ext.byCategory ?? {}).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(ext.byCategory ?? {}).map(([cat, count]) => (
                                  <span key={cat} className="inline-flex items-center gap-1 rounded-md bg-white border border-violet-100 px-2 py-0.5 text-xs text-violet-800 shadow-sm">
                                    {cat} <span className="font-bold tabular-nums">{count}</span>
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

export default function BlockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <BlockDetailPageInner params={params} />
    </Suspense>
  );
}
