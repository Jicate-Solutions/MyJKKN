'use client';

import { useState, useEffect } from 'react';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import type { JkknInstitution } from '@/types/jkkn-api/institutions';
import { format } from 'date-fns';
import {
  Search,
  RefreshCw,
  Building2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts snake_case / SCREAMING_CASE enum values into readable labels. */
function formatLabel(value: string | null): string {
  if (!value) return '—';
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function InstitutionRow({ institution }: { institution: JkknInstitution }) {
  return (
    <TableRow className="hover:bg-muted/40 transition-colors">
      <TableCell
        className="font-medium max-w-[260px] truncate"
        title={institution.name}
      >
        {institution.name}
      </TableCell>

      <TableCell className="font-mono text-sm text-muted-foreground">
        {institution.counselling_code ?? '—'}
      </TableCell>

      <TableCell>
        {institution.category ? (
          <Badge variant="outline">{formatLabel(institution.category)}</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      <TableCell>
        {institution.institution_type ? (
          <Badge variant="secondary">
            {formatLabel(institution.institution_type)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      <TableCell>
        {institution.is_active ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Inactive
          </span>
        )}
      </TableCell>

      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(institution.created_at), 'dd MMM yyyy')}
      </TableCell>
    </TableRow>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({
  total,
  activeCount,
  page,
  totalPages,
}: {
  total: number;
  activeCount: number;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardDescription>Total Institutions</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{total}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardDescription>Active on this page</CardDescription>
          <CardTitle className="text-3xl tabular-nums text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card className="hidden sm:block">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardDescription>Page</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {page}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              / {totalPages}
            </span>
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function InstitutionsTable() {
  const [page, setPage] = useState(1);
  // Keep the raw input value separate so keystrokes feel instant
  const [searchInput, setSearchInput] = useState('');
  // Debounced value — this is what actually goes into the query key
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1); // Reset pagination whenever the search term changes
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useJkknInstitutions({ page, limit: PAGE_SIZE, search });

  const institutions = data?.data ?? [];
  const total = data?.metadata?.total ?? 0;
  const totalPages = data?.metadata?.totalPages ?? 1;
  const activeCount = institutions.filter((i) => i.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      {!isLoading && !isError && (
        <StatsStrip
          total={total}
          activeCount={activeCount}
          page={page}
          totalPages={totalPages}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search institutions…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Search institutions"
          />
        </div>

        {isFetching && !isLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Updating…
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto"
          aria-label="Refresh institutions list"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load institutions</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 mt-1">
            <span>
              {(error as Error)?.message ??
                'An unexpected error occurred. Please check your API key configuration.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      {!isError && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[260px]">Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableSkeleton />
                  ) : institutions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-48 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Building2 className="h-8 w-8 opacity-30" />
                          {search
                            ? `No institutions found matching "${search}".`
                            : 'No institutions returned from the API.'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    institutions.map((institution) => (
                      <InstitutionRow
                        key={institution.id}
                        institution={institution}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isError && !isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Showing page {page} of {totalPages} &mdash;{' '}
            <span className="font-medium">{total}</span> total institutions
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              aria-label="Go to previous page"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetching}
              aria-label="Go to next page"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
