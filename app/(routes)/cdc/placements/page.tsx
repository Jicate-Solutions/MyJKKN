'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, ArrowRight, Briefcase } from 'lucide-react';
import { useCdcPlacements } from '@/hooks/cdc/use-cdc-placements';
import type { CdcPlacementStatus } from '@/types/cdc/placements';
import {
  CDC_PLACEMENT_STATUS_LABELS,
  CDC_PLACEMENT_STATUS_COLORS,
} from '@/types/cdc/placements';

const STATUS_FILTER_OPTIONS: Array<{ value: CdcPlacementStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'offered', label: 'Offered' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'rescinded', label: 'Rescinded' },
];

export default function CdcPlacementsListPage() {
  const [statusFilter, setStatusFilter] = useState<CdcPlacementStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useCdcPlacements({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search || undefined,
    page,
    pageSize: 50,
  });

  const placements = data?.data ?? [];
  const metadata = data?.metadata;

  return (
    <PermissionGuard module="cdc.placements" action="view">
    <ContentLayout title="Placements">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/cdc">CDC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Placements</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Placements</h1>
            {metadata && (
              <p className="text-sm text-muted-foreground mt-1">
                {metadata.total} placement{metadata.total !== 1 ? 's' : ''} total
              </p>
            )}
          </div>
          <PermissionGuard module="cdc.placements" action="create" fallback={null}>
            <Button asChild>
              <Link href="/cdc/placements/new">
                <Plus className="mr-2 h-4 w-4" />
                Record Placement
              </Link>
            </Button>
          </PermissionGuard>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by role or company..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Table / cards */}
        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading placements...</div>
        )}
        {error && (
          <div className="text-sm text-destructive py-8 text-center">
            Failed to load placements. Please refresh.
          </div>
        )}
        {!isLoading && !error && placements.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <Briefcase className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No placements found.</p>
              <PermissionGuard module="cdc.placements" action="create" fallback={null}>
                <Button asChild size="sm" variant="outline">
                  <Link href="/cdc/placements/new">Record first placement</Link>
                </Button>
              </PermissionGuard>
            </CardContent>
          </Card>
        )}
        {!isLoading && placements.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Page {metadata?.page} of {metadata?.totalPages}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {placements.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/40 transition-colors">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {p.recruiter_name ?? 'Unknown Company'}
                        </span>
                        {p.job_role && (
                          <span className="text-sm text-muted-foreground">— {p.job_role}</span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${CDC_PLACEMENT_STATUS_COLORS[p.status]}`}
                        >
                          {CDC_PLACEMENT_STATUS_LABELS[p.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {p.drive_title && <span>Drive: {p.drive_title}</span>}
                        {p.package_lpa && <span>{p.package_lpa} LPA</span>}
                        {p.job_location && <span>{p.job_location}</span>}
                        {p.offer_type_label && <span>{p.offer_type_label}</span>}
                        <span>Offered {new Date(p.offered_at).toLocaleDateString('en-IN')}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/cdc/placements/${p.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {metadata && metadata.totalPages > 1 && (
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="flex items-center text-sm text-muted-foreground px-2">
              {page} / {metadata.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= metadata.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
