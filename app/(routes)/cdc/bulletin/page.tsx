'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCdcOpportunities } from '@/hooks/cdc/use-cdc-bulletin';
import { usePermissions } from '@/hooks/use-permissions';
import { Plus, Search, Megaphone, Calendar, ExternalLink } from 'lucide-react';
import { BULLETIN_CATEGORIES } from '@/types/cdc/bulletin';
import type { BulletinStatus, OpportunityFilters } from '@/types/cdc/bulletin';

const STATUS_COLORS: Record<BulletinStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-700',
};

function formatDeadline(date: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `Expired ${Math.abs(diff)}d ago`;
  if (diff === 0) return 'Closes today';
  if (diff === 1) return 'Closes tomorrow';
  return `Closes in ${diff}d`;
}

export default function CdcBulletinPage() {
  const { canAccess, isSuperAdmin } = usePermissions([], { waitForLoad: true });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const filters: OpportunityFilters = useMemo(() => ({
    search: search || undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    status: statusFilter !== 'all' ? (statusFilter as OpportunityFilters['status']) : undefined,
  }), [search, categoryFilter, statusFilter]);

  const { data: opportunities, isLoading, isError, error, refetch } = useCdcOpportunities(filters);

  // 'archived' status is a manage-only filter option; gate it on edit perms.
  const canSeeArchived = isSuperAdmin || canAccess('cdc.bulletin', 'edit');

  return (
    <PermissionGuard module="cdc.bulletin" action="view">
    <ContentLayout title="CDC — Opportunities Bulletin">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Opportunities Bulletin' },
      ]} />

      <div className="space-y-4 mt-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Opportunities Bulletin</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hackathons, conferences, scholarships, and external opportunities
            </p>
          </div>
          <PermissionGuard module="cdc.bulletin" action="create" fallback={null}>
            <Button asChild>
              <Link href="/cdc/bulletin/new">
                <Plus className="w-4 h-4 mr-2" />
                Post Opportunity
              </Link>
            </Button>
          </PermissionGuard>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search opportunities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {BULLETIN_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              {canSeeArchived && <SelectItem value="archived">Archived</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Megaphone className="w-12 h-12 text-destructive/40" />
              <p className="text-lg font-medium text-destructive">Failed to load opportunities</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (opportunities ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Megaphone className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No opportunities found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check back soon, or post one if you have access.
            </p>
            <PermissionGuard module="cdc.bulletin" action="create" fallback={null}>
              <Button asChild className="mt-4">
                <Link href="/cdc/bulletin/new">
                  <Plus className="w-4 h-4 mr-2" /> Post Opportunity
                </Link>
              </Button>
            </PermissionGuard>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(opportunities ?? []).map((opp) => (
              <Link key={opp.id} href={`/cdc/bulletin/${opp.id}`} className="block group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-2">{opp.title}</CardTitle>
                      <Badge className={`shrink-0 text-xs ${STATUS_COLORS[opp.status ?? 'published']}`}>
                        {opp.status ?? 'published'}
                      </Badge>
                    </div>
                    {opp.source_organisation && (
                      <CardDescription className="text-xs">{opp.source_organisation}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    {opp.category && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary capitalize">
                        {opp.category}
                      </span>
                    )}
                    {opp.deadline_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDeadline(opp.deadline_date)}</span>
                      </div>
                    )}
                    {opp.stipend_text && (
                      <p className="text-xs">{opp.stipend_text}</p>
                    )}
                    {opp.apply_url && (
                      <div className="flex items-center gap-1 text-primary text-xs">
                        <ExternalLink className="w-3 h-3" />
                        <span>Apply link available</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
