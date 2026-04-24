'use client';

// app/(routes)/audit/cycles/[id]/findings/page.tsx
// Cycle-scoped findings list. Cycle is fixed by the route param — no cycle
// selector; all other filters (severity, status, owner search) mirror the
// global /audit/findings page. Row click → /service-requests/[id].

import { use, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus, Search, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import { useFindingsByCycle } from '@/hooks/audit/use-audit-findings';
import { LogFindingDialog } from '../../../_components/findings/log-finding-dialog';
import { CycleFindingsTable } from '../../../_components/cycles/cycle-findings-table';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import type { FindingSeverity } from '@/lib/types/audit';

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In review' },
  { value: 'returned', label: 'Returned' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
];

const SEVERITY_OPTIONS: Array<{ value: FindingSeverity | 'all'; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'red', label: 'Red' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CycleFindingsPage({ params }: PageProps) {
  const { id } = use(params);

  const [severity, setSeverity] = useState<FindingSeverity | 'all'>('all');
  const [status, setStatus] = useState<string>('all');
  const [ownerSearch, setOwnerSearch] = useState<string>('');
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  const { data: cycle, isLoading: cycleLoading, error: cycleError, refetch } =
    useAuditCycle(id);

  const {
    data: findings = [],
    isLoading: findingsLoading,
    error: findingsError,
  } = useFindingsByCycle(id, {
    severity: severity === 'all' ? undefined : severity,
    status: status === 'all' ? undefined : status,
  });

  const filteredFindings = useMemo(() => {
    if (!ownerSearch.trim()) return findings;
    const q = ownerSearch.trim().toLowerCase();
    return findings.filter(
      (f) =>
        f.requester_id.toLowerCase().includes(q) ||
        (f.assigned_to ?? '').toLowerCase().includes(q),
    );
  }, [findings, ownerSearch]);

  return (
    <PermissionGuard module="audit" action="finding.view">
      <ContentLayout title={cycle?.name ? `${cycle.name} — Findings` : 'Cycle Findings'}>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            {
              label: cycle?.name ?? 'Cycle',
              href: `/audit/cycles/${id}`,
            },
            { label: 'Findings', isCurrent: true },
          ]}
        />

        <div className="space-y-6">
          {/* Cycle error */}
          {cycleError ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-destructive">Failed to load cycle</p>
                <p className="text-xs text-muted-foreground">
                  {(cycleError as Error)?.message ?? 'Unknown error'}
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <Link
                      href={`/audit/cycles/${id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to cycle
                    </Link>
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-xl font-semibold tracking-tight">
                        {cycleLoading
                          ? 'Loading cycle…'
                          : cycle?.name ?? 'Cycle findings'}
                      </h1>
                      {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All findings logged against this cycle. Click a row to open
                      the detail.
                    </p>
                  </div>
                  <Button onClick={() => setLogDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Log finding
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="filter-severity">Severity</Label>
                  <Select
                    value={severity}
                    onValueChange={(v) => setSeverity(v as FindingSeverity | 'all')}
                  >
                    <SelectTrigger id="filter-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filter-status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filter-owner">Owner (user-id search)</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="filter-owner"
                      value={ownerSearch}
                      onChange={(e) => setOwnerSearch(e.target.value)}
                      placeholder="requester or assignee id"
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Findings table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Findings
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredFindings.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {findingsError ? (
                <div className="flex items-start gap-2 p-4 text-xs border border-destructive/40 bg-destructive/5 rounded-md m-4">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  <div>
                    <p className="font-medium text-destructive">
                      Could not load findings
                    </p>
                    <p className="text-muted-foreground">
                      {(findingsError as Error)?.message}
                    </p>
                  </div>
                </div>
              ) : (
                <CycleFindingsTable
                  findings={filteredFindings}
                  loading={findingsLoading}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <LogFindingDialog
          open={logDialogOpen}
          onOpenChange={setLogDialogOpen}
          cycleId={id}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
