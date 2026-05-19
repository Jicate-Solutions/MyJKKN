'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sparkles,
  Plus,
  Search,
  Loader2,
  CalendarDays,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useCleaningSchedules,
  useCreateCleaningSchedule,
} from '@/hooks/campus-living/use-hostel-housekeeping';
import { BlockSelector } from '@/components/campus-living/block-selector';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

// Real prod schema enum values (verified via Supabase Management API):
// hostel_cleaning_schedules.cleaning_type → cleaning_type_enum
const CLEANING_TYPES = [
  { value: 'daily_sweep', label: 'Daily Sweep' },
  { value: 'daily_mop', label: 'Daily Mop' },
  { value: 'toilet_cleaning', label: 'Toilet Cleaning' },
  { value: 'common_area', label: 'Common Area' },
  { value: 'deep_cleaning', label: 'Deep Cleaning' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'water_tank', label: 'Water Tank' },
  { value: 'disinfection', label: 'Disinfection' },
  { value: 'other', label: 'Other' },
];

// hostel_cleaning_schedules.frequency → pm_frequency_enum
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function HousekeepingPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = {};
    if (blockFilter !== 'all') f.block_id = blockFilter;
    if (activeFilter === 'active') f.is_active = true;
    if (activeFilter === 'inactive') f.is_active = false;
    return Object.keys(f).length ? f : undefined;
  }, [blockFilter, activeFilter]);

  const { data, isLoading } = useCleaningSchedules(institutionId, filters);
  const schedules = data?.data ?? [];

  const filteredSchedules = schedules.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    // Match against real prod columns (cleaning_type / frequency / assigned_staff)
    // plus legacy aliases (area / cadence / assigned_to) so the search still works
    // in either schema state.
    return (
      String(s.cleaning_type ?? s.area ?? '').toLowerCase().includes(q) ||
      String(s.frequency ?? s.cadence ?? '').toLowerCase().includes(q) ||
      String(s.assigned_staff ?? s.assigned_to ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(
    () => ({
      total: schedules.length,
      active: schedules.filter((s) => s.is_active).length,
      inactive: schedules.filter((s) => !s.is_active).length,
    }),
    [schedules]
  );

  return (
    <ContentLayout title="Housekeeping">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Housekeeping Schedules
            </h1>
            <p className="text-muted-foreground">
              Recurring cleaning plans across blocks and common areas.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!institutionId}>
            <Plus className="mr-2 h-4 w-4" />
            New Schedule
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Schedules</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Inactive</p>
              <p className="text-2xl font-bold text-muted-foreground">{stats.inactive}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search schedules…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="py-16 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No cleaning schedules yet</h3>
                <p className="text-sm text-muted-foreground">
                  Create a schedule to set up recurring cleaning tasks.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Assigned Staff</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium capitalize">
                        {String(s.cleaning_type ?? s.area ?? '—').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="capitalize">
                        {String(s.frequency ?? s.cadence ?? '—').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        {s.next_due_at ? (
                          <span className="flex items-center gap-1 text-sm">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {new Date(s.next_due_at as string).toLocaleDateString()}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {String(s.assigned_staff ?? s.assigned_to ?? '—')}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="mr-1 h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutionId={institutionId}
      />
    </ContentLayout>
  );
}

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
}

function CreateScheduleDialog({ open, onOpenChange, institutionId }: CreateScheduleDialogProps) {
  const createMut = useCreateCleaningSchedule();
  const [blockId, setBlockId] = useState<string>('all');
  const [cleaningType, setCleaningType] = useState<string>('daily_sweep');
  const [frequency, setFrequency] = useState<string>('daily');
  const [assignedStaff, setAssignedStaff] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionId) return;
    // Payload uses real prod column names. Service DTO has index signature so
    // extra/unknown keys flow through to the insert untouched.
    const payload = {
      institution_id: institutionId,
      block_id: blockId !== 'all' ? blockId : null,
      cleaning_type: cleaningType,
      frequency,
      assigned_staff: assignedStaff || null,
      is_active: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    createMut.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        setBlockId('all');
        setCleaningType('daily_sweep');
        setFrequency('daily');
        setAssignedStaff('');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Cleaning Schedule</DialogTitle>
            <DialogDescription>
              Set up a recurring cleaning plan for a block or common area.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="block">Block (optional)</Label>
              <BlockSelector
                institutionId={institutionId}
                value={blockId}
                onValueChange={setBlockId}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaning-type">Cleaning type</Label>
              <Select value={cleaningType} onValueChange={setCleaningType}>
                <SelectTrigger id="cleaning-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLEANING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned-staff">Assigned staff (optional)</Label>
              <Input
                id="assigned-staff"
                placeholder="e.g. Rajesh K."
                value={assignedStaff}
                onChange={(e) => setAssignedStaff(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending || !institutionId}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
