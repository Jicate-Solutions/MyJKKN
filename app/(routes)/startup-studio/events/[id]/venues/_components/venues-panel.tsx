'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Filter,
  Hash,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useEventVenues,
  useAddVenue,
  useUpdateVenue,
  useRemoveVenue,
  useAssignStaff,
  useRemoveStaff,
  useAutoAllocateTeams,
  useManualAllocate,
  useRemoveAllocation,
  useStaffList,
} from '@/hooks/startup-studio/use-event-venues';
import { useEventRegistrations } from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import type { DayType, StaffRole, EventVenueAssignment } from '@/types/startup-studio';

const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'mentor', label: 'Mentor' },
  { value: 'lead_mentor', label: 'Lead Mentor' },
  { value: 'judge', label: 'Judge' },
  { value: 'panel_chair', label: 'Panel Chair' },
  { value: 'evaluator', label: 'Evaluator' },
];

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

// ── Sortable column header ───────────────────────────────────────────────────
function SortableHeader({ column, label }: { column: any; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none group"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      {sorted === 'asc' ? (
        <ChevronUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-60" />
      )}
    </button>
  );
}

// ── Root panel ───────────────────────────────────────────────────────────────
export function VenuesPanel({ eventId }: { eventId: string }) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true;
  const [dayType, setDayType] = useState<DayType>('build_day');

  return (
    <Tabs value={dayType} onValueChange={(v) => setDayType(v as DayType)} className="space-y-5">
      <TabsList className="grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="build_day">Build Day</TabsTrigger>
        <TabsTrigger value="demo_day">Demo Day</TabsTrigger>
      </TabsList>
      <TabsContent value="build_day">
        <VenuesDayPanel eventId={eventId} dayType="build_day" isSuperAdmin={isSuperAdmin} />
      </TabsContent>
      <TabsContent value="demo_day">
        <VenuesDayPanel eventId={eventId} dayType="demo_day" isSuperAdmin={isSuperAdmin} />
      </TabsContent>
    </Tabs>
  );
}

// ── Day panel ────────────────────────────────────────────────────────────────
function VenuesDayPanel({ eventId, dayType, isSuperAdmin }: {
  eventId: string; dayType: DayType; isSuperAdmin: boolean;
}) {
  const { data: venues = [], isLoading } = useEventVenues(eventId, dayType);
  const { data: registrations = [] } = useEventRegistrations({ event_id: eventId });
  const autoAllocate = useAutoAllocateTeams();

  // Allocation stats derived from live venue data
  const allocatedRegIds = useMemo(() =>
    new Set(venues.flatMap((v) => (v.team_allocations || []).map((a: any) => a.registration_id))),
    [venues]
  );
  const totalTeams = registrations.length;
  const allocatedTeamsCount = allocatedRegIds.size;
  const unallocatedTeamsCount = totalTeams - allocatedTeamsCount;
  const totalCapacity = venues.reduce((s, v) => s + (v.capacity_override || 0), 0);
  const venuesWithSpace = venues.filter((v) => {
    const cap = v.capacity_override || 0;
    return cap === 0 || cap > (v.team_allocations?.length || 0);
  }).length;
  const totalStaff = venues.reduce((s, v) => s + (v.staff_assignments?.length || 0), 0);

  return (
    <div className="space-y-5">
      {/* Stats — two rows: venues metrics + team allocation metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStat
          icon={<Building2 className="h-4 w-4" />}
          label="Venues"
          value={venues.length}
        />
        <MiniStat
          icon={<Hash className="h-4 w-4" />}
          label="Total Capacity"
          value={totalCapacity || '∞'}
        />
        <MiniStat
          icon={<Building2 className="h-4 w-4" />}
          label="Available Venues"
          value={venuesWithSpace}
          color={venuesWithSpace === 0 ? 'text-amber-600' : 'text-green-600'}
          hint={venuesWithSpace === 0 ? 'All venues full' : `${venuesWithSpace} with space`}
        />
        <MiniStat
          icon={<Users className="h-4 w-4" />}
          label="Total Teams"
          value={totalTeams}
        />
        <MiniStat
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Allocated"
          value={allocatedTeamsCount}
          color="text-green-600"
          hint={totalTeams > 0 ? `${Math.round((allocatedTeamsCount / totalTeams) * 100)}% placed` : undefined}
        />
        <MiniStat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Unallocated"
          value={unallocatedTeamsCount}
          color={unallocatedTeamsCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}
          hint={unallocatedTeamsCount === 0 ? 'All placed!' : `${unallocatedTeamsCount} need venues`}
        />
      </div>

      {/* Auto-allocate */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => autoAllocate.mutate({ eventId, dayType })}
          disabled={autoAllocate.isPending}
          className="gap-1.5"
        >
          {autoAllocate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {autoAllocate.isPending ? 'Allocating...' : 'Auto-Allocate Teams'}
        </Button>
      </div>

      {/* Add venue form */}
      <AddVenueForm eventId={eventId} dayType={dayType} />

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : venues.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No venues configured yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Use the form above to add a venue.</p>
        </div>
      ) : (
        <VenuesDataTable
          venues={venues}
          eventId={eventId}
          dayType={dayType}
          isSuperAdmin={isSuperAdmin}
          unallocatedTeamsCount={unallocatedTeamsCount}
        />
      )}
    </div>
  );
}

// ── TanStack data table ───────────────────────────────────────────────────────
function VenuesDataTable({ venues, eventId, dayType, isSuperAdmin, unallocatedTeamsCount }: {
  venues: EventVenueAssignment[];
  eventId: string;
  dayType: DayType;
  isSuperAdmin: boolean;
  unallocatedTeamsCount: number;
}) {
  const removeVenue = useRemoveVenue();
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [detailVenue, setDetailVenue] = useState<EventVenueAssignment | null>(null);
  const [editVenue, setEditVenue] = useState<EventVenueAssignment | null>(null);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // Pre-filter data before TanStack sees it — "available" = has remaining capacity
  const tableData = useMemo(() =>
    showAvailableOnly
      ? venues.filter((v) => {
          const cap = v.capacity_override || 0;
          return cap === 0 || cap > (v.team_allocations?.length || 0);
        })
      : venues,
    [venues, showAvailableOnly]
  );

  const columns = useMemo<ColumnDef<EventVenueAssignment>[]>(() => [
    {
      id: 'venue',
      accessorFn: (row) => [row.manual_name, row.resource?.name, row.manual_building, row.manual_room].filter(Boolean).join(' '),
      header: ({ column }) => <SortableHeader column={column} label="Venue" />,
      cell: ({ row }) => {
        const v = row.original;
        return (
          <div className="py-0.5">
            <p className="font-medium text-sm leading-tight">
              {v.manual_name || v.resource?.name || 'Unnamed'}
            </p>
            {(v.manual_building || v.manual_room) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                {[v.manual_building, v.manual_room ? `Room ${v.manual_room}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: 'institution',
      accessorFn: (row) => row.institution?.name || '',
      header: ({ column }) => <SortableHeader column={column} label="Institution" />,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap">
          {row.original.institution?.name || 'Unknown'}
        </Badge>
      ),
    },
    {
      id: 'capacity',
      accessorFn: (row) => row.capacity_override || 0,
      header: ({ column }) => <SortableHeader column={column} label="Capacity" />,
      cell: ({ row }) => {
        const v = row.original;
        const allocated = v.team_allocations?.length || 0;
        const cap = v.capacity_override || 0;
        const pct = cap > 0 ? Math.round((allocated / cap) * 100) : 0;
        return (
          <div className="min-w-[100px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground tabular-nums">{allocated} / {cap || '∞'}</span>
              {cap > 0 && (
                <span className={cn('text-xs font-medium tabular-nums',
                  pct >= 100 ? 'text-green-600' : pct >= 75 ? 'text-amber-600' : 'text-muted-foreground'
                )}>
                  {pct}%
                </span>
              )}
            </div>
            {cap > 0 && (
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={cn('h-1.5 rounded-full transition-all duration-300',
                    pct >= 100 ? 'bg-green-500' : pct >= 75 ? 'bg-amber-500' : 'bg-primary'
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'teams',
      accessorFn: (row) => row.team_allocations?.length || 0,
      header: ({ column }) => <SortableHeader column={column} label="Teams" />,
      cell: ({ row }) => {
        const count = row.original.team_allocations?.length || 0;
        return (
          <Badge variant={count > 0 ? 'default' : 'outline'} className="text-xs tabular-nums">
            {count}
          </Badge>
        );
      },
    },
    {
      id: 'staff',
      accessorFn: (row) => row.staff_assignments?.length || 0,
      header: ({ column }) => <SortableHeader column={column} label="Staff" />,
      cell: ({ row }) => {
        const count = row.original.staff_assignments?.length || 0;
        return (
          <Badge variant={count > 0 ? 'secondary' : 'outline'} className="text-xs tabular-nums">
            {count}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const venue = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 data-[state=open]:bg-muted">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onSelect={() => setDetailVenue(venue)}
                >
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  View Details
                </DropdownMenuItem>
                {isSuperAdmin && (
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onSelect={() => setEditVenue(venue)}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    Edit Venue
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => removeVenue.mutate(venue.id)}
                  disabled={removeVenue.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Venue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [isSuperAdmin, removeVenue]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Venues
                <Badge variant="outline" className="text-xs font-normal ml-1">
                  {table.getFilteredRowModel().rows.length} / {venues.length}
                </Badge>
              </CardTitle>
              {/* Available-only filter toggle */}
              <Button
                variant={showAvailableOnly ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowAvailableOnly((p) => !p)}
              >
                <Filter className="h-3 w-3" />
                Available only
                {showAvailableOnly && (
                  <Badge className="ml-0.5 h-4 px-1 text-[10px] bg-white/20 hover:bg-white/20">
                    {tableData.length}
                  </Badge>
                )}
              </Button>
              {/* Unallocated teams alert */}
              {unallocatedTeamsCount > 0 && (
                <Badge variant="outline" className="h-7 px-2.5 gap-1.5 text-xs border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30">
                  <AlertTriangle className="h-3 w-3" />
                  {unallocatedTeamsCount} team{unallocatedTeamsCount !== 1 ? 's' : ''} unallocated
                </Badge>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search venues..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="h-8 pl-8 w-full sm:w-[180px] text-sm"
              />
            </div>
          </div>
        </CardHeader>

        <div className="border-t">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                    {hg.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="px-4 py-3 h-auto text-xs font-medium"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                      No venues match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="group hover:bg-muted/30 border-b last:border-0"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {table.getFilteredRowModel().rows.length} of {venues.length} venue{venues.length !== 1 ? 's' : ''}
            {showAvailableOnly ? ' with available capacity' : ''}
            {globalFilter ? ` matching "${globalFilter}"` : ''}
          </span>
          <div className="flex items-center gap-1">
            {showAvailableOnly && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowAvailableOnly(false)}>
                <X className="h-3 w-3 mr-1" /> Show all
              </Button>
            )}
            {globalFilter && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setGlobalFilter('')}>
                <X className="h-3 w-3 mr-1" /> Clear search
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Details sheet */}
      <VenueDetailsSheet
        venue={detailVenue}
        eventId={eventId}
        dayType={dayType}
        venues={venues}
        onClose={() => setDetailVenue(null)}
      />

      {/* Edit dialog — controlled, not trigger-based (avoids Radix focus trap conflicts with dropdown) */}
      {editVenue && (
        <EditVenueDialog
          venue={editVenue}
          open={!!editVenue}
          onOpenChange={(open) => { if (!open) setEditVenue(null); }}
        />
      )}
    </>
  );
}

// ── Venue details sheet ───────────────────────────────────────────────────────
function VenueDetailsSheet({ venue, eventId, dayType, venues, onClose }: {
  venue: EventVenueAssignment | null;
  eventId: string;
  dayType: DayType;
  venues: EventVenueAssignment[];
  onClose: () => void;
}) {
  const removeStaff = useRemoveStaff();
  const removeAllocation = useRemoveAllocation();

  // Always reflect latest cache data
  const liveVenue = venue ? (venues.find((v) => v.id === venue.id) ?? venue) : null;
  if (!liveVenue) return null;

  const allocated = liveVenue.team_allocations?.length || 0;
  const capacity = liveVenue.capacity_override || 0;
  const fillPercent = capacity > 0 ? Math.round((allocated / capacity) * 100) : 0;

  return (
    <Sheet open={!!venue} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {liveVenue.manual_name || liveVenue.resource?.name || 'Unnamed Venue'}
          </SheetTitle>
          <SheetDescription>
            {liveVenue.institution?.name || 'Unknown institution'} · {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}
          </SheetDescription>
        </SheetHeader>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <InfoItem label="Building" value={liveVenue.manual_building || '—'} />
          <InfoItem label="Room" value={liveVenue.manual_room ? `Room ${liveVenue.manual_room}` : '—'} />
          <InfoItem
            label="Capacity"
            value={capacity > 0
              ? `${allocated} / ${capacity} (${fillPercent}%)`
              : allocated > 0 ? `${allocated} (unlimited)` : 'Unlimited'}
          />
          <InfoItem label="Institution" value={liveVenue.institution?.name || 'Unknown'} />
        </div>

        {/* Capacity bar */}
        {capacity > 0 && (
          <div className="mb-6">
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn('h-2 rounded-full transition-all duration-300',
                  fillPercent >= 100 ? 'bg-green-500' : fillPercent >= 75 ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${Math.min(fillPercent, 100)}%` }}
              />
            </div>
          </div>
        )}

        <Separator className="mb-6" />

        {/* Staff */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Staff Assignments
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {liveVenue.staff_assignments?.length || 0}
              </Badge>
            </h3>
            <AddStaffDialog eventId={eventId} venueId={liveVenue.id} dayType={dayType} />
          </div>

          {(liveVenue.staff_assignments?.length || 0) === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border rounded-md bg-muted/20">
              No staff assigned yet.
            </p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4 py-2.5 text-xs">Name</TableHead>
                    <TableHead className="px-4 py-2.5 text-xs hidden sm:table-cell">Email</TableHead>
                    <TableHead className="px-4 py-2.5 text-xs">Role</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(liveVenue.staff_assignments || []).map((sa: any) => {
                    const staffName = sa.staff ? `${sa.staff.first_name} ${sa.staff.last_name}` : 'Unknown';
                    const roleLabel = STAFF_ROLES.find((r) => r.value === sa.role)?.label || sa.role;
                    return (
                      <TableRow key={sa.id} className="border-b last:border-0">
                        <TableCell className="px-4 py-2.5 text-xs font-medium">{staffName}</TableCell>
                        <TableCell className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                          {sa.staff?.email || '—'}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <Badge variant="secondary" className="text-[10px]">{roleLabel}</Badge>
                        </TableCell>
                        <TableCell className="px-2 py-2.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeStaff.mutate(sa.id)}
                            disabled={removeStaff.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <Separator className="mb-6" />

        {/* Teams */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team Allocations
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {allocated}
              </Badge>
            </h3>
            <AssignTeamDialog eventId={eventId} venueId={liveVenue.id} dayType={dayType} />
          </div>

          {allocated === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border rounded-md bg-muted/20">
              No teams allocated yet.
            </p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4 py-2.5 text-xs">#</TableHead>
                    <TableHead className="px-4 py-2.5 text-xs">Team Name</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(liveVenue.team_allocations || []).map((alloc: any, idx: number) => (
                    <TableRow key={alloc.id} className="border-b last:border-0">
                      <TableCell className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-xs font-medium">
                        {alloc.registration?.team_name || 'Unknown'}
                      </TableCell>
                      <TableCell className="px-2 py-2.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeAllocation.mutate(alloc.id)}
                          disabled={removeAllocation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function MiniStat({ icon, label, value, color, hint }: {
  icon: React.ReactNode; label: string; value: number | string; color?: string; hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={cn('text-2xl font-bold', color)}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ── Add venue form ─────────────────────────────────────────────────────────────
function AddVenueForm({ eventId, dayType }: { eventId: string; dayType: DayType }) {
  const { data: institutions = [] } = useInstitutions();
  const addVenue = useAddVenue();
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [capacity, setCapacity] = useState('');
  const [institutionId, setInstitutionId] = useState('');

  const handleSubmit = () => {
    if (!name || !institutionId) return;
    addVenue.mutate({
      event_id: eventId,
      day_type: dayType,
      institution_id: institutionId,
      manual_name: name,
      manual_building: building || undefined,
      manual_room: room || undefined,
      capacity_override: capacity ? parseInt(capacity) : undefined,
    }, {
      onSuccess: () => {
        setName('');
        setBuilding('');
        setRoom('');
        setCapacity('');
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Venue
        </CardTitle>
        <CardDescription>
          Add a new venue for {dayType === 'build_day' ? 'build day' : 'demo day'} activities.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="venue-name" className="text-sm font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Venue Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="venue-name"
              placeholder="e.g., Main Auditorium"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution" className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Institution <span className="text-red-500">*</span>
            </Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="institution">
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="building" className="text-sm font-medium">Building</Label>
            <Input id="building" placeholder="e.g., Block A" value={building} onChange={(e) => setBuilding(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room" className="text-sm font-medium">Room</Label>
            <Input id="room" placeholder="e.g., 101" value={room} onChange={(e) => setRoom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity" className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Capacity
            </Label>
            <Input
              id="capacity"
              type="number"
              placeholder="e.g., 30"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              min={1}
            />
          </div>
        </div>
        <Separator />
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!name || !institutionId || addVenue.isPending} className="gap-1.5">
            {addVenue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {addVenue.isPending ? 'Adding...' : 'Add Venue'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Edit venue dialog (controlled — no DialogTrigger) ─────────────────────────
function EditVenueDialog({ venue, open, onOpenChange }: {
  venue: EventVenueAssignment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: institutions = [] } = useInstitutions();
  const updateVenue = useUpdateVenue();
  const [name, setName] = useState(venue.manual_name || '');
  const [building, setBuilding] = useState(venue.manual_building || '');
  const [room, setRoom] = useState(venue.manual_room || '');
  const [capacity, setCapacity] = useState(venue.capacity_override ? String(venue.capacity_override) : '');
  const [institutionId, setInstitutionId] = useState((venue.institution as any)?.id || '');

  const handleSave = () => {
    if (!name || !institutionId) return;
    updateVenue.mutate(
      {
        venueId: venue.id,
        dto: {
          institution_id: institutionId,
          manual_name: name,
          manual_building: building || undefined,
          manual_room: room || undefined,
          capacity_override: capacity ? parseInt(capacity) : null,
        },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Venue</DialogTitle>
          <DialogDescription>Update venue details. Only super admins can edit venues.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Venue Name <span className="text-red-500">*</span>
            </Label>
            <Input placeholder="e.g., Main Auditorium" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Institution <span className="text-red-500">*</span>
            </Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select institution..." />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Building</Label>
              <Input placeholder="e.g., Block A" value={building} onChange={(e) => setBuilding(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Room</Label>
              <Input placeholder="e.g., 101" value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Capacity
            </Label>
            <Input
              type="number"
              placeholder="e.g., 30 (leave blank for unlimited)"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              min={1}
            />
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name || !institutionId || updateVenue.isPending} className="gap-1.5">
              {updateVenue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {updateVenue.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign team dialog ────────────────────────────────────────────────────────
function AssignTeamDialog({ eventId, venueId, dayType }: { eventId: string; venueId: string; dayType: DayType }) {
  const { data: registrations = [] } = useEventRegistrations({ event_id: eventId });
  const { data: venues = [] } = useEventVenues(eventId, dayType);
  const manualAllocate = useManualAllocate();
  const [open, setOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('');

  const allocatedRegIds = new Set(
    venues.flatMap((v) => (v.team_allocations || []).map((a: any) => a.registration_id))
  );
  const unallocatedTeams = registrations.filter((r) => !allocatedRegIds.has(r.id));

  const handleAssign = () => {
    if (!selectedTeam) return;
    manualAllocate.mutate(
      { eventId, registrationId: selectedTeam, venueAssignmentId: venueId, dayType },
      { onSuccess: () => { setOpen(false); setSelectedTeam(''); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Assign Team
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Team to Venue</DialogTitle>
          <DialogDescription>
            Select a team for {dayType === 'build_day' ? 'Build Day' : 'Demo Day'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="team-select" className="text-sm font-medium">
              Team <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger id="team-select">
                <SelectValue placeholder="Select a team..." />
              </SelectTrigger>
              <SelectContent>
                {unallocatedTeams.length === 0 ? (
                  <SelectItem value="_none" disabled>All teams are already allocated</SelectItem>
                ) : (
                  unallocatedTeams.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.team_name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {unallocatedTeams.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {unallocatedTeams.length} unallocated team{unallocatedTeams.length !== 1 ? 's' : ''} available
              </p>
            )}
          </div>
          <Button
            onClick={handleAssign}
            disabled={!selectedTeam || manualAllocate.isPending}
            className="w-full gap-1.5"
          >
            {manualAllocate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {manualAllocate.isPending ? 'Assigning...' : 'Assign Team'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add staff dialog ──────────────────────────────────────────────────────────
function AddStaffDialog({ eventId, venueId, dayType }: { eventId: string; venueId: string; dayType: DayType }) {
  const { data: staffList = [] } = useStaffList();
  const assignStaff = useAssignStaff();
  const [open, setOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedRole, setSelectedRole] = useState<StaffRole>('mentor');

  const handleAssign = () => {
    if (!selectedStaff) return;
    assignStaff.mutate(
      { eventId, venueAssignmentId: venueId, staffId: selectedStaff, role: selectedRole, dayType },
      { onSuccess: () => { setOpen(false); setSelectedStaff(''); setSelectedRole('mentor'); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <UserPlus className="h-3 w-3" /> Add Staff
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Staff</DialogTitle>
          <DialogDescription>Select a staff member and their role for this venue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="staff-member" className="text-sm font-medium">
              Staff Member <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger id="staff-member">
                <SelectValue placeholder="Select staff member..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.length === 0 ? (
                  <SelectItem value="_none" disabled>No staff available</SelectItem>
                ) : (
                  staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-role" className="text-sm font-medium">
              Role <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as StaffRole)}>
              <SelectTrigger id="staff-role">
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAssign}
            disabled={!selectedStaff || assignStaff.isPending}
            className="w-full gap-1.5"
          >
            {assignStaff.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {assignStaff.isPending ? 'Assigning...' : 'Assign Staff'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
