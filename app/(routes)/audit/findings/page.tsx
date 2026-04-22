'use client';

// Audit Workflow Sprint 01 — all audit findings list (cross-cycle).
// Findings are service_requests of type=audit_finding. Row click navigates
// to the canonical /service-requests/[id] view (decision #1).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Inbox, Search } from 'lucide-react';
import { useAuditCycles } from '@/hooks/audit/use-audit-cycles';
import { useFindingsByCycle } from '@/hooks/audit/use-audit-findings';
import { SeverityBadge } from '../_components/findings/severity-badge';
import { SlaChip } from '../_components/findings/sla-chip';
import { LogFindingDialog } from '../_components/findings/log-finding-dialog';
import type { FindingSeverity, AuditFindingView } from '@/lib/types/audit';

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

function ageInDays(submittedAt: string | null): number | null {
  if (!submittedAt) return null;
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return null;
  return Math.floor((Date.now() - submitted) / (24 * 60 * 60 * 1000));
}

export default function AuditFindingsPage() {
  const router = useRouter();
  const { data: cycles = [], isLoading: cyclesLoading } = useAuditCycles({
    includeClosed: true,
  });

  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [severity, setSeverity] = useState<FindingSeverity | 'all'>('all');
  const [status, setStatus] = useState<string>('all');
  const [ownerSearch, setOwnerSearch] = useState<string>('');
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  // Default cycle: first non-closed cycle, or first cycle overall
  const effectiveCycleId = useMemo(() => {
    if (selectedCycleId) return selectedCycleId;
    const active = cycles.find((c) => c.phase !== 'closed');
    return active?.id ?? cycles[0]?.id ?? '';
  }, [cycles, selectedCycleId]);

  const { data: findings = [], isLoading: findingsLoading } = useFindingsByCycle(
    effectiveCycleId || undefined,
    {
      severity: severity === 'all' ? undefined : severity,
      status: status === 'all' ? undefined : status,
    }
  );

  const filteredFindings = useMemo(() => {
    if (!ownerSearch.trim()) return findings;
    const q = ownerSearch.trim().toLowerCase();
    return findings.filter(
      (f) =>
        f.requester_id.toLowerCase().includes(q) ||
        (f.assigned_to ?? '').toLowerCase().includes(q)
    );
  }, [findings, ownerSearch]);

  const activeCycle = cycles.find((c) => c.id === effectiveCycleId);

  return (
    <ContentLayout title="Audit Findings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/audit">Audit</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Findings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">Audit Findings</h1>
            <p className="text-muted-foreground text-sm">
              All findings across audit cycles. Click a row to open the detail.
            </p>
          </div>
          <Button onClick={() => setLogDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Log finding
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="filter-cycle">Cycle</Label>
                <Select
                  value={effectiveCycleId}
                  onValueChange={setSelectedCycleId}
                  disabled={cyclesLoading}
                >
                  <SelectTrigger id="filter-cycle">
                    <SelectValue
                      placeholder={cyclesLoading ? 'Loading…' : 'Select a cycle'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {cycles.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.phase}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

        {/* Findings Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {activeCycle ? `${activeCycle.name}` : 'Findings'}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredFindings.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {findingsLoading ? (
              <div className="flex justify-center items-center min-h-[200px]">
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : !effectiveCycleId ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Create an audit cycle first to start logging findings.
                </p>
              </div>
            ) : filteredFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  No findings match the current filters.
                </p>
                <Button variant="outline" onClick={() => setLogDialogOpen(true)}>
                  Log your first finding
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Request #</TableHead>
                      <TableHead>Parameter</TableHead>
                      <TableHead className="w-[90px]">Severity</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead className="w-[90px]">Age</TableHead>
                      <TableHead className="w-[130px]">SLA</TableHead>
                      <TableHead>Owner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFindings.map((f) => (
                      <FindingRow
                        key={f.finding_id}
                        finding={f}
                        onClick={() => router.push(`/service-requests/${f.finding_id}`)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <LogFindingDialog
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        cycleId={effectiveCycleId || undefined}
      />
    </ContentLayout>
  );
}

function FindingRow({
  finding,
  onClick,
}: {
  finding: AuditFindingView;
  onClick: () => void;
}) {
  const age = ageInDays(finding.submitted_at);
  // SLA window from server-set requester_context (we derive severity → p1/p2 mapping
  // from the service's logged context; we fall back to null so the chip is n/a).
  const expected = finding.form_data?.evidence_required ? undefined : undefined;
  // Note: the cycle-filtered list projection doesn't return requester_context; we
  // only surface a best-effort default based on severity. Red=7, Yellow=30, Green=60.
  // The canonical SLA lives on service_requests.requester_context; /service-requests/[id]
  // shows the accurate deadline.
  const fallbackSla =
    finding.severity === 'red' ? 7 : finding.severity === 'yellow' ? 30 : 60;

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <TableCell className="font-mono text-xs">
        {finding.request_number ?? finding.finding_id.slice(0, 8)}
      </TableCell>
      <TableCell className="font-mono text-xs">{finding.parameter_code}</TableCell>
      <TableCell>
        <SeverityBadge severity={finding.severity} />
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs capitalize">
          {finding.status.replace(/_/g, ' ')}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {age !== null ? `${age}d` : '—'}
      </TableCell>
      <TableCell>
        <SlaChip
          submittedAt={finding.submitted_at}
          expectedResolutionDays={expected ?? fallbackSla}
        />
      </TableCell>
      <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[220px]">
        {finding.assigned_to ?? finding.requester_id.slice(0, 8) + '…'}
      </TableCell>
    </TableRow>
  );
}
