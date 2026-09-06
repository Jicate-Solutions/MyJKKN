'use client';

/**
 * Schools Network — admin list page.
 *
 * Mirrors `app/(routes)/admission/consultants/page.tsx` pattern (per Agent C
 * UI-PATTERN TWIN CHECK): filter card → header → table → pagination. Role-aware
 * visibility comes from the API layer's RLS (the page itself just renders what
 * the server returns).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Search,
  Filter,
  X,
  RefreshCw,
  MoreHorizontal,
  Eye,
  Plus,
  School as SchoolIcon,
  Calendar as CalendarIcon,
  Handshake,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { listSchools } from './_lib/api';
import { FeederDiscovery } from './_components/feeder-discovery';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  OWNERSHIP_COLOR,
  OWNERSHIP_LABEL,
  formatInr,
  type SchoolListRow,
  type SchoolOwnership,
  type SchoolStatus,
  type SchoolsListFilters,
} from './_lib/types';

const STATUSES: SchoolStatus[] = ['active', 'sustaining', 'dormant', 'inactive'];
const OWNERSHIPS: SchoolOwnership[] = ['external', 'internal'];

const PAGE_SIZE = 25;

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 7 }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SchoolsNetworkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const filters = useMemo<SchoolsListFilters>(
    () => ({
      search: searchParams.get('search') || undefined,
      ownership: (searchParams.get('ownership') as SchoolOwnership) || undefined,
      status: (searchParams.get('status') as SchoolStatus) || undefined,
      state: searchParams.get('state') || undefined,
      district: searchParams.get('district') || undefined,
      programPartnerId: searchParams.get('programPartnerId') || undefined,
      jkknUserId: searchParams.get('jkknUserId') || undefined,
      hasActiveOwner: searchParams.get('hasActiveOwner') === 'true' ? true : undefined,
      limit: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    }),
    [searchParams, currentPage]
  );

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['schools-network', 'list', filters],
    queryFn: () => listSchools(filters),
    placeholderData: (prev) => prev,
  });

  const updateFilters = useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === 'all') params.delete(k);
        else params.set(k, v);
      }
      // Reset to first page unless caller is paging
      if (!('page' in patch)) params.delete('page');
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearch = useCallback(() => {
    updateFilters({ search: searchTerm.trim() || undefined });
  }, [searchTerm, updateFilters]);

  const handleClear = useCallback(() => {
    setSearchTerm('');
    router.push('/admission/schools-network');
  }, [router]);

  const handleRefresh = useCallback(() => {
    queryClient.refetchQueries({ queryKey: ['schools-network'] }).catch(() => {
      /* noop */
    });
  }, [queryClient]);

  const rows: SchoolListRow[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters =
    !!searchParams.get('search') ||
    !!searchParams.get('ownership') ||
    !!searchParams.get('status') ||
    !!searchParams.get('state') ||
    !!searchParams.get('district');

  if (error && rows.length === 0 && !isLoading) {
    toast.error((error as Error).message || 'Failed to load schools');
  }

  return (
    <div className="space-y-6">
      {/* Summary band */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schools in Network</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">
              Matching the current filters
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Program Partners</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <Link
                href="/admission/schools-network/partners"
                className="text-sm font-medium text-primary hover:underline"
              >
                Open partners
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              CSR / grant / corporate funding chains
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Schools</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3"
              onClick={() => updateFilters({ jkknUserId: 'me' })}
            >
              Show schools I own →
            </Button>
            <p className="text-xs text-muted-foreground">
              Outreach coordinators see their assigned schools
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, district, state…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>

            <Select
              value={searchParams.get('ownership') || 'all'}
              onValueChange={(v) => updateFilters({ ownership: v })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ownership</SelectItem>
                {OWNERSHIPS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OWNERSHIP_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={searchParams.get('status') || 'all'}
              onValueChange={(v) => updateFilters({ status: v })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleSearch}>
              <Filter className="h-4 w-4 mr-2" /> Apply
            </Button>

            {hasFilters && (
              <Button variant="ghost" onClick={handleClear}>
                <X className="h-4 w-4 mr-2" /> Clear
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              disabled={isFetching}
              onClick={handleRefresh}
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <SchoolIcon className="h-5 w-5" /> Schools Network
          </CardTitle>
          <div className="flex gap-2 shrink-0">
            <Link href="/admission/schools-network/partners">
              <Button variant="outline" size="sm">
                <Handshake className="h-4 w-4 mr-2" />
                Partners
              </Button>
            </Link>
            <Link href="/admission/schools-network/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add School
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <SchoolIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Schools Yet</h3>
              <p className="text-muted-foreground mb-4">
                {hasFilters
                  ? 'No schools match the current filters. Try clearing them.'
                  : 'Add the first school you partner with to start tracking sessions and contributions.'}
              </p>
              {!hasFilters && (
                <Link href="/admission/schools-network/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add the first school
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>School</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Ownership</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Contrib.</TableHead>
                      <TableHead>Last contact</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Link
                            href={`/admission/schools-network/${row.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.name}
                          </Link>
                          {row.intakeYear && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Joined {row.intakeYear}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {[row.district, row.state].filter(Boolean).join(', ') || '—'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={OWNERSHIP_COLOR[row.ownership]}>
                            {OWNERSHIP_LABEL[row.ownership]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLOR[row.status]}>
                            {STATUS_LABEL[row.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.primaryOwnerName ?? (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.programPartnerName ? (
                            <Link
                              href={`/admission/schools-network/partners/${row.programPartnerId}`}
                              className="text-primary hover:underline"
                            >
                              {row.programPartnerName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{row.sessionCount}</TableCell>
                        <TableCell className="text-right">
                          {formatInr(row.totalContributionInr)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.lastSessionAt
                            ? new Date(row.lastSessionAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/admission/schools-network/${row.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/admission/schools-network/${row.id}/sessions/log`}
                                >
                                  <CalendarIcon className="h-4 w-4 mr-2" />
                                  Log Session
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                    {Math.min(currentPage * PAGE_SIZE, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateFilters({ page: String(currentPage - 1) })}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateFilters({ page: String(currentPage + 1) })}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <FeederDiscovery />
    </div>
  );
}

export default function SchoolsNetworkPage() {
  return (
    <PermissionGuard module="schools_network" action="schools.view">
      <ContentLayout title="Schools Network">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Schools Network</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <SchoolsNetworkContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
