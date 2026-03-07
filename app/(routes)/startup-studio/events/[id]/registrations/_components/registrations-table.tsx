'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useEventRegistrations,
  useEventRegistrationsPaginated,
  useToggleCheckIn,
  useToggleLovableVerified,
  useUpdateRegistrationStatus,
  useDeleteRegistration,
} from '@/hooks/startup-studio/use-event-registrations';
import { useEventStats } from '@/hooks/startup-studio/use-events';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Laptop, Search, Users, Loader2, CheckCircle2,
  MoreHorizontal, ShieldX, ShieldCheck, Trash2,
  SlidersHorizontal, X, Building2, UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RegistrationStatus } from '@/types/startup-studio';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'registered', label: 'Registered' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'disqualified', label: 'Disqualified' },
];

const MEMBER_COUNT_OPTIONS = [
  { value: 'all', label: 'Any Size' },
  { value: '1', label: '1 Member' },
  { value: '2', label: '2 Members' },
  { value: '3', label: '3 Members' },
  { value: '4', label: '4 Members' },
  { value: '5', label: '5+ Members' },
];

const LAPTOP_OPTIONS = [
  { value: 'all', label: 'All Teams' },
  { value: 'has_laptop', label: 'Has Laptop' },
  { value: 'no_laptop', label: 'No Laptop' },
];

const LOVABLE_OPTIONS = [
  { value: 'all', label: 'All Teams' },
  { value: 'verified', label: 'Lovable Verified' },
  { value: 'not_verified', label: 'Not Verified' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase.from('institutions').select('id, name').order('name');
      return (data || []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

// Stat card used inside the table
function StatCard({
  icon, label, value, color, loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border p-3 flex flex-col items-center text-center gap-1', color)}>
      {icon}
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <span className="text-xl font-bold">{value}</span>
      )}
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

export function RegistrationsTable({ eventId, isSuperAdmin }: { eventId: string; isSuperAdmin: boolean }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [lovableFilter, setLovableFilter] = useState('all');
  const [laptopFilter, setLaptopFilter] = useState('all');
  const [membersFilter, setMembersFilter] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: institutions = [] } = useInstitutions();

  // Determine if any filter is active — drives stats source
  const serverFilters = {
    status: statusFilter !== 'all' ? statusFilter as RegistrationStatus : undefined,
    institution_id: institutionFilter !== 'all' ? institutionFilter : undefined,
    lovable_verified: lovableFilter === 'verified' ? true : lovableFilter === 'not_verified' ? false : undefined,
    search: debouncedSearch || undefined,
  };
  const isFiltered =
    statusFilter !== 'all' ||
    institutionFilter !== 'all' ||
    lovableFilter !== 'all' ||
    laptopFilter !== 'all' ||
    membersFilter !== 'all' ||
    debouncedSearch !== '';

  const activeAdvancedCount = [
    institutionFilter !== 'all',
    lovableFilter !== 'all',
    laptopFilter !== 'all',
    membersFilter !== 'all',
  ].filter(Boolean).length;

  // Global stats (no filter active)
  const { data: globalStats, isLoading: statsLoading } = useEventStats(isFiltered ? undefined : eventId);

  // Non-paginated filtered registrations (only fires when filters are active)
  const { data: filteredAll = [], isLoading: filteredLoading } = useEventRegistrations({
    event_id: eventId,
    ...serverFilters,
    // enabled guard is inside the hook; we pass a sentinel to disable when not filtered
    ...(isFiltered ? {} : { event_id: '' }),
  });

  // Paginated results for the table
  const { data: result, isLoading: tableLoading } = useEventRegistrationsPaginated({
    event_id: eventId,
    ...serverFilters,
    page,
    limit: pageSize,
  });

  const toggleCheckIn = useToggleCheckIn();
  const toggleLovable = useToggleLovableVerified();
  const updateStatus = useUpdateRegistrationStatus();
  const deleteRegistration = useDeleteRegistration();

  // Client-side filter applied to paginated page results (for table display)
  const allTeams = result?.data || [];
  const teams = allTeams.filter((reg) => applyClientFilters(reg, laptopFilter, membersFilter));

  // Client-side filter applied to full non-paginated results (for stats)
  const filteredForStats = useMemo(
    () => filteredAll.filter((reg) => applyClientFilters(reg, laptopFilter, membersFilter)),
    [filteredAll, laptopFilter, membersFilter]
  );

  // Compute filtered stats
  const filteredStats = useMemo(() => {
    if (!isFiltered) return null;
    const teams = filteredForStats;
    const allMembers = teams.flatMap((r: any) => (r.team_members || []).filter((m: any) => m.status === 'accepted'));
    return {
      total_teams: teams.length,
      total_members: allMembers.length,
      members_with_laptops: allMembers.filter((m: any) => m.has_laptop).length,
      lovable_verified_teams: teams.filter((r: any) => r.lovable_verified).length,
      checked_in_teams: teams.filter((r: any) => r.checked_in).length,
    };
  }, [filteredForStats, isFiltered]);

  const statsData = isFiltered ? filteredStats : globalStats;
  const statsIsLoading = isFiltered ? filteredLoading : statsLoading;

  const pagination = result?.pagination || { page: 1, limit: 10, total_items: 0, total_pages: 0 };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setPage(1);
    }, 400);
    setSearchTimer(timer);
  };

  const handleStatusChange = (value: string) => { setStatusFilter(value); setPage(1); };
  const handleInstitutionChange = (value: string) => { setInstitutionFilter(value); setPage(1); };
  const handleLovableChange = (value: string) => { setLovableFilter(value); setPage(1); };
  const handlePageSizeChange = (value: string) => { setPageSize(Number(value)); setPage(1); };

  const clearAdvancedFilters = () => {
    setInstitutionFilter('all');
    setLovableFilter('all');
    setLaptopFilter('all');
    setMembersFilter('all');
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Teams</CardTitle>
          {isFiltered && (
            <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
              <SlidersHorizontal className="h-3 w-3" />
              Filtered stats
            </Badge>
          )}
        </div>

        {/* Stats row — updates with filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          <StatCard
            icon={<Users className="h-4 w-4 text-blue-500" />}
            label="Total Teams"
            value={statsData?.total_teams ?? 0}
            color="bg-blue-50 dark:bg-blue-950/20"
            loading={statsIsLoading}
          />
          <StatCard
            icon={<UserCheck className="h-4 w-4 text-emerald-500" />}
            label="Total Members"
            value={statsData?.total_members ?? 0}
            color="bg-emerald-50 dark:bg-emerald-950/20"
            loading={statsIsLoading}
          />
          <StatCard
            icon={<Laptop className="h-4 w-4 text-amber-500" />}
            label="Laptops Confirmed"
            value={statsData?.members_with_laptops ?? 0}
            color="bg-amber-50 dark:bg-amber-950/20"
            loading={statsIsLoading}
          />
          <StatCard
            icon={<ShieldCheck className="h-4 w-4 text-purple-500" />}
            label="Lovable Verified"
            value={statsData?.lovable_verified_teams ?? 0}
            color="bg-purple-50 dark:bg-purple-950/20"
            loading={statsIsLoading}
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
            label="Checked In"
            value={statsData?.checked_in_teams ?? 0}
            color="bg-green-50 dark:bg-green-950/20"
            loading={statsIsLoading}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Toolbar Row 1: Search + Status + Advanced Toggle */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams or problem idea..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showAdvanced ? 'default' : 'outline'}
            size="default"
            className="gap-2 shrink-0"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeAdvancedCount > 0 && (
              <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px] ml-0.5">
                {activeAdvancedCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvanced && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Advanced Filters</span>
              {activeAdvancedCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearAdvancedFilters}>
                  <X className="h-3 w-3" /> Clear all
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Institution */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Institution
                </label>
                <Select value={institutionFilter} onValueChange={handleInstitutionChange}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All Institutions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Institutions</SelectItem>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lovable */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" /> Lovable
                </label>
                <Select value={lovableFilter} onValueChange={handleLovableChange}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOVABLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Laptops */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Laptop className="h-3 w-3" /> Laptops
                </label>
                <Select value={laptopFilter} onValueChange={setLaptopFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent>
                    {LAPTOP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Members Count */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Team Size
                </label>
                <Select value={membersFilter} onValueChange={setMembersFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Any Size" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active filter pills */}
            {activeAdvancedCount > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-1.5">
                  {institutionFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 text-xs pr-1">
                      {institutions.find((i) => i.id === institutionFilter)?.name || 'Institution'}
                      <button onClick={() => setInstitutionFilter('all')} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {lovableFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 text-xs pr-1">
                      {LOVABLE_OPTIONS.find((o) => o.value === lovableFilter)?.label}
                      <button onClick={() => setLovableFilter('all')} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {laptopFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 text-xs pr-1">
                      {LAPTOP_OPTIONS.find((o) => o.value === laptopFilter)?.label}
                      <button onClick={() => setLaptopFilter('all')} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {membersFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1 text-xs pr-1">
                      {MEMBER_COUNT_OPTIONS.find((o) => o.value === membersFilter)?.label}
                      <button onClick={() => setMembersFilter('all')} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Table */}
        {tableLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox aria-label="Select all" disabled />
                  </TableHead>
                  <TableHead className="min-w-[160px]">Team Name</TableHead>
                  <TableHead className="min-w-[80px]">Members</TableHead>
                  <TableHead className="min-w-[140px]">Institution</TableHead>
                  <TableHead className="min-w-[200px]">Problem Idea</TableHead>
                  <TableHead className="text-center min-w-[80px]">Laptops</TableHead>
                  <TableHead className="text-center min-w-[80px]">Lovable</TableHead>
                  <TableHead className="text-center min-w-[100px]">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      No registrations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  teams.map((reg) => {
                    const memberCount = reg.team_members?.length || 0;
                    const laptopCount = reg.team_members?.filter((m: any) => m.has_laptop).length || 0;

                    return (
                      <TableRow key={reg.id} className="group">
                        <TableCell>
                          <Checkbox aria-label={`Select ${reg.team_name}`} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{reg.team_name}</p>
                            <p className="text-xs text-muted-foreground">{reg.owner?.full_name || reg.owner?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{memberCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{reg.institution?.name || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground line-clamp-2 max-w-[250px]">
                            {reg.problem_idea || <span className="italic">No idea submitted</span>}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 text-sm">
                            <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{laptopCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={reg.lovable_verified}
                            onCheckedChange={(checked) => {
                              toggleLovable.mutate({ registrationId: reg.id, verified: !!checked });
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge
                            status={reg.status}
                            checkedIn={reg.checked_in}
                            onToggleCheckIn={() => {
                              toggleCheckIn.mutate({ registrationId: reg.id, checked_in: !reg.checked_in });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {reg.status === 'disqualified' ? (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => updateStatus.mutate({ registrationId: reg.id, status: 'registered' })}
                                >
                                  <ShieldCheck className="h-4 w-4 text-green-600" />
                                  Reinstate Team
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="gap-2 text-amber-600 focus:text-amber-600"
                                  onClick={() => updateStatus.mutate({ registrationId: reg.id, status: 'disqualified' })}
                                >
                                  <ShieldX className="h-4 w-4" />
                                  Disqualify Team
                                </DropdownMenuItem>
                              )}
                              {isSuperAdmin && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="gap-2 text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget({ id: reg.id, name: reg.team_name })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Team
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-2">
              {pagination.total_items > 0
                ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, pagination.total_items)} of ${pagination.total_items}`
                : '0 results'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page <= 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3 text-muted-foreground">
              Page {page} of {pagination.total_pages || 1}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={page >= pagination.total_pages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(pagination.total_pages)} disabled={page >= pagination.total_pages}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Delete confirmation — super admin only */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.name}</strong>? This will remove all team members and submissions and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteRegistration.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Shared client-side filter predicate used for both table rows and stats computation
function applyClientFilters(reg: any, laptopFilter: string, membersFilter: string): boolean {
  const members = (reg.team_members || []).filter((m: any) => m.status === 'accepted');
  const memberCount = members.length;
  const hasLaptop = members.some((m: any) => m.has_laptop);

  if (laptopFilter === 'has_laptop' && !hasLaptop) return false;
  if (laptopFilter === 'no_laptop' && hasLaptop) return false;

  if (membersFilter !== 'all') {
    if (membersFilter === '5') {
      if (memberCount < 5) return false;
    } else {
      if (memberCount !== parseInt(membersFilter)) return false;
    }
  }

  return true;
}

function StatusBadge({ status, checkedIn, onToggleCheckIn }: {
  status: RegistrationStatus; checkedIn: boolean; onToggleCheckIn: () => void;
}) {
  if (checkedIn) {
    return (
      <Badge
        variant="default"
        className="gap-1 cursor-pointer bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
        onClick={onToggleCheckIn}
      >
        <CheckCircle2 className="h-3 w-3" /> Checked In
      </Badge>
    );
  }

  if (status === 'disqualified') {
    return <Badge variant="destructive">Disqualified</Badge>;
  }

  return (
    <Badge variant="secondary" className="cursor-pointer hover:bg-primary/10" onClick={onToggleCheckIn}>
      {status === 'registered' ? 'Registered' : status}
    </Badge>
  );
}
