'use client';

// ============================================================================
// Premium Room Phase 2 — Override Allocations Table
// ============================================================================
// Lists current premium / premium_plus active allocations with filters.
// Override button opens OverrideAllocationDialog.
// ============================================================================

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useCurrentPremiumAllocations } from '@/hooks/campus-living/use-premium-audit';
import type { PremiumAllocationSummary } from '@/types/campus-living/premium-audit';

import { OverrideAllocationDialog } from './override-allocation-dialog';

type TierFilter = 'all' | 'premium' | 'premium_plus';

const PAGE_SIZE = 25;

export function OverrideAllocationsTable() {
  const [institutionId, setInstitutionId] = useState<string>('all');
  const [tier, setTier] = useState<TierFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [overrideTarget, setOverrideTarget] =
    useState<PremiumAllocationSummary | null>(null);

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const queryParams = useMemo(
    () => ({
      institutionId: institutionId === 'all' ? null : institutionId,
      tierKey: tier === 'all' ? null : (tier as 'premium' | 'premium_plus'),
      search: search.trim() || null,
      page,
      pageSize: PAGE_SIZE,
    }),
    [institutionId, tier, search, page],
  );

  const { data, isLoading, isError, error, refetch, isFetching } =
    useCurrentPremiumAllocations(queryParams);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              placeholder="Search learner / email / block / room"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search current premium allocations"
            />
          </div>

          <Select
            value={institutionId}
            onValueChange={(v) => {
              setInstitutionId(v);
              setPage(1);
            }}
            disabled={institutionsLoading}
          >
            <SelectTrigger className="w-[220px]" aria-label="Filter by college">
              <SelectValue placeholder="All colleges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All colleges</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={tier}
            onValueChange={(v) => {
              setTier(v as TierFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]" aria-label="Filter by tier">
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All premium tiers</SelectItem>
              <SelectItem value="premium">Premium only</SelectItem>
              <SelectItem value="premium_plus">Premium+ only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load allocations: {error?.message ?? 'unknown error'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">No premium allocations match these filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try clearing search / changing the college / tier filter. Standard
            tier allocations are intentionally excluded from this page.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last override</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.allocation_id}>
                    <TableCell>
                      <div className="font-medium">{row.learner_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.learner_email ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tierKey={row.tier_key} label={row.tier_display_name} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {row.block_name ?? '—'} / Room {row.room_number ?? '—'} / Bed{' '}
                        {row.bed_number ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} feeStatus={row.fee_status} />
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      {row.override_reason ? (
                        <span
                          className="line-clamp-2 text-xs text-muted-foreground"
                          title={row.override_reason}
                        >
                          {row.override_reason}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOverrideTarget(row)}
                      >
                        Override
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="tabular-nums">
                Page {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <OverrideAllocationDialog
        allocation={overrideTarget}
        open={!!overrideTarget}
        onOpenChange={(open) => {
          if (!open) setOverrideTarget(null);
        }}
        onApplied={() => {
          setOverrideTarget(null);
          refetch();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TierBadge({
  tierKey,
  label,
}: {
  tierKey: string | null;
  label: string | null;
}) {
  if (!tierKey) return <Badge variant="outline">unknown</Badge>;
  if (tierKey === 'premium_plus') return <Badge>{label ?? 'Premium+'}</Badge>;
  if (tierKey === 'premium') return <Badge variant="secondary">{label ?? 'Premium'}</Badge>;
  return <Badge variant="outline">{label ?? tierKey}</Badge>;
}

function StatusBadge({
  status,
  feeStatus,
}: {
  status: string;
  feeStatus: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={status === 'active' ? 'secondary' : 'outline'}>{status}</Badge>
      {feeStatus && (
        <span className="text-xs text-muted-foreground">fee: {feeStatus}</span>
      )}
    </div>
  );
}
