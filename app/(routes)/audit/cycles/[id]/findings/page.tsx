'use client';

// app/(routes)/audit/cycles/[id]/findings/page.tsx
// Cycle-scoped findings list, redesigned to the shared auditor visual language.
// Cycle is fixed by the route param — no cycle selector. Filters: severity,
// status, and owner ROLE (owner roles are read-enriched from the parameter
// catalog by parameter_code — the finding row itself carries no role). Row
// click → /service-requests/[id]. Data hooks / permissions / routing unchanged.

import { use, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuditCycle } from '@/hooks/audit/use-audit-cycles';
import { useFindingsByCycle } from '@/hooks/audit/use-audit-findings';
import { useSystemParameters } from '@/hooks/audit/use-audit-parameters';
import { LogFindingDialog } from '../../../_components/findings/log-finding-dialog';
import { CycleFindingsTable } from '../../../_components/cycles/cycle-findings-table';
import { CyclePhaseBadge } from '../../../_components/cycle-phase-badge';
import { SectionEyebrow, prettyRole } from '../../../_components/redesign/kit';
import { isOpenFinding } from '../../../_components/redesign/param-status';
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
  { value: 'red', label: 'High (red)' },
  { value: 'yellow', label: 'Medium (yellow)' },
  { value: 'green', label: 'Observation (green)' },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function CycleFindingsPage({ params }: PageProps) {
  const { id } = use(params);

  const [severity, setSeverity] = useState<FindingSeverity | 'all'>('all');
  const [status, setStatus] = useState<string>('all');
  const [ownerRole, setOwnerRole] = useState<string>('all');
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  const {
    data: cycle,
    isLoading: cycleLoading,
    error: cycleError,
    refetch,
  } = useAuditCycle(id);

  const {
    data: findings = [],
    isLoading: findingsLoading,
    error: findingsError,
  } = useFindingsByCycle(id, {
    severity: severity === 'all' ? undefined : severity,
    status: status === 'all' ? undefined : status,
  });

  // Catalog read-enrichment: parameter_code → { name, ownerRole }. Findings
  // carry a parameter_code but no owner role or plain-language name themselves.
  const { data: systemParams = [] } = useSystemParameters();
  const paramMeta = useMemo(() => {
    const m = new Map<string, { name: string; ownerRole: string }>();
    for (const p of systemParams) {
      if (!p.code || m.has(p.code)) continue;
      m.set(p.code, {
        name: p.name ?? p.code,
        ownerRole: p.default_owner_role ?? '',
      });
    }
    return m;
  }, [systemParams]);

  // Distinct owner roles actually present in this cycle's findings — the only
  // values worth offering in the owner filter.
  const ownerRoleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of findings) {
      const role = paramMeta.get(f.parameter_code)?.ownerRole;
      if (role) set.add(role);
    }
    return Array.from(set).sort();
  }, [findings, paramMeta]);

  const filteredFindings = useMemo(() => {
    if (ownerRole === 'all') return findings;
    return findings.filter(
      (f) => paramMeta.get(f.parameter_code)?.ownerRole === ownerRole,
    );
  }, [findings, ownerRole, paramMeta]);

  const openCount = useMemo(
    () => filteredFindings.filter(isOpenFinding).length,
    [filteredFindings],
  );

  const headline = findingsLoading
    ? 'Findings'
    : `${openCount} open finding${openCount === 1 ? '' : 's'}`;

  return (
    <PermissionGuard module="audit" action="finding.view">
      <ContentLayout
        title={cycle?.name ? `${cycle.name} — Findings` : 'Cycle Findings'}
      >
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Audit', href: '/audit' },
            { label: 'Cycles', href: '/audit/cycles' },
            { label: cycle?.name ?? 'Cycle', href: `/audit/cycles/${id}` },
            { label: 'Findings', isCurrent: true },
          ]}
        />

        <div className="space-y-5">
          {/* Header */}
          {cycleError ? (
            <Card>
              <CardContent className="space-y-3 py-8 text-center">
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
            <div className="flex flex-col gap-3">
              <Link
                href={`/audit/cycles/${id}`}
                className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to cycle
              </Link>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <SectionEyebrow>
                    Findings{cycle?.name ? ` · ${cycle.name}` : ''}
                  </SectionEyebrow>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {cycleLoading ? 'Loading cycle…' : headline}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  {cycle && <CyclePhaseBadge phase={cycle.phase} />}
                  <PermissionGuard
                    module="audit"
                    action="finding.log"
                    fallback={null}
                  >
                    <Button size="sm" onClick={() => setLogDialogOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Log finding
                    </Button>
                  </PermissionGuard>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                A finding is a ticket: a parameter, what fell short, an owner and
                a deadline. Clear every finding to seal the cycle. Click a row to
                open its detail.
              </p>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FilterField label="Severity">
                  <Select
                    value={severity}
                    onValueChange={(v) =>
                      setSeverity(v as FindingSeverity | 'all')
                    }
                  >
                    <SelectTrigger>
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
                </FilterField>
                <FilterField label="Status">
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
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
                </FilterField>
                <FilterField label="Owner">
                  <Select value={ownerRole} onValueChange={setOwnerRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Anyone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      {ownerRoleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {prettyRole(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              </div>
            </CardContent>
          </Card>

          {/* Findings table */}
          <Card>
            <CardContent className="p-0">
              {findingsError ? (
                <div className="m-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-xs">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
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
                  paramMeta={paramMeta}
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
