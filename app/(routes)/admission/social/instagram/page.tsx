'use client';

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useInstagramAccounts, IG_ACCOUNTS_QUERY_KEY } from '@/hooks/use-instagram-accounts';
import type { IgAccountStatus, IgAccountType } from '@/services/instagram-service';
import { HealthSummaryTiles } from './_components/health-summary-tiles';
import { AccountRow } from './_components/account-row';
import { DiscoverButton } from './_components/discover-button';
import { SubscribedAssetsPanel } from '@/components/admin/social/subscribed-assets-panel';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Instagram' },
];

export default function InstagramAdminPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<IgAccountStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<IgAccountType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading, error, refetch } = useInstagramAccounts({
    status: statusFilter,
    account_type: typeFilter,
  });

  const accounts = data?.accounts ?? [];

  // Client-side search filter (server already handles status/type)
  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.username.toLowerCase().includes(q) ||
        a.institution_name.toLowerCase().includes(q) ||
        (a.department_name ?? '').toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Summary tile values
  const summaryStats = useMemo(() => {
    const all = accounts;
    const active = all.filter((a) => a.status === 'active').length;
    const dormant = all.filter((a) => a.status === 'dormant').length;
    const disconnected = all.filter(
      (a) => a.status === 'disconnected' || a.status === 'error',
    ).length;
    const healthScores = all.map((a) => a.health_score);
    const avg =
      healthScores.length > 0
        ? Math.round(healthScores.reduce((s, v) => s + v, 0) / healthScores.length)
        : 0;
    return { total: all.length, active, dormant, disconnected, avg };
  }, [accounts]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [IG_ACCOUNTS_QUERY_KEY] });
    await refetch();
  };

  return (
    <PermissionGuard
      module="social.instagram"
      action="view"
      fallback={
        <ContentLayout title="Instagram Monitoring">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Instagram Monitoring">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Instagram Accounts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor all {summaryStats.total} institutional Instagram accounts
              across JKKN.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <DiscoverButton onComplete={handleRefresh} />
          </div>
        </div>

        {/* Summary tiles */}
        <HealthSummaryTiles
          total={summaryStats.total}
          active={summaryStats.active}
          dormant={summaryStats.dormant}
          disconnected={summaryStats.disconnected}
          avgHealthScore={summaryStats.avg}
          loading={isLoading}
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter chips */}
          <div className="flex items-center gap-1.5">
            {(['all', 'active', 'dormant', 'disconnected'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <Select
            value={typeFilter}
            onValueChange={(v) => { setTypeFilter(v as IgAccountType | 'all'); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Account Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="institution">Institution</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="club">Club</SelectItem>
              <SelectItem value="event">Event</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search username or institution..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {filtered.length !== accounts.length && (
            <Badge variant="secondary" className="text-xs">
              {filtered.length} of {accounts.length}
            </Badge>
          )}
        </div>

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message.includes('404')
                ? 'Instagram API routes are not yet deployed (Agent γ PR pending). The table will populate once that PR merges.'
                : `Failed to load accounts: ${error.message}`}
            </AlertDescription>
          </Alert>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[160px]">Username</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="w-[110px]">Type</TableHead>
                <TableHead className="text-right w-[90px]">Followers</TableHead>
                <TableHead className="w-[130px]">Last Post</TableHead>
                <TableHead className="w-[130px]">Last Polled</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[120px]">Health</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-muted-foreground text-sm">
                        {error
                          ? 'Account data unavailable — API routes pending (Agent γ).'
                          : accounts.length === 0
                          ? 'No accounts found. Use "Discover Accounts" to scan for institutional Instagram accounts.'
                          : 'No accounts match the current filters.'}
                      </p>
                      {!error && accounts.length === 0 && (
                        <DiscoverButton onComplete={handleRefresh} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Webhook subscription drift panel */}
        <SubscribedAssetsPanel filter="ig" />
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
