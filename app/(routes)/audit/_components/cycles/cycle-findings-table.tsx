'use client';

// Audit Workflow Sprint 01 — cycle-scoped findings table.
// Mirrors the columns of app/(routes)/audit/findings/page.tsx but without the
// cycle selector (cycle is fixed by route param). Shared by:
//   - /audit/cycles/[id]/findings page
// Kept here (not extracted into the global findings page) to avoid touching
// files owned by other parallel agents.

import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Inbox } from 'lucide-react';
import { SeverityBadge } from '../findings/severity-badge';
import { SlaChip } from '../findings/sla-chip';
import type { AuditFindingView } from '@/lib/types/audit';

function ageInDays(submittedAt: string | null): number | null {
  if (!submittedAt) return null;
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return null;
  return Math.floor((Date.now() - submitted) / (24 * 60 * 60 * 1000));
}

interface CycleFindingsTableProps {
  findings: AuditFindingView[];
  loading?: boolean;
}

export function CycleFindingsTable({ findings, loading }: CycleFindingsTableProps) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No findings match the current filters.
        </p>
      </div>
    );
  }

  return (
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
          {findings.map((f) => (
            <CycleFindingRow
              key={f.finding_id}
              finding={f}
              onClick={() => router.push(`/service-requests/${f.finding_id}`)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CycleFindingRow({
  finding,
  onClick,
}: {
  finding: AuditFindingView;
  onClick: () => void;
}) {
  const age = ageInDays(finding.submitted_at);
  // The cycle-filtered list projection doesn't return requester_context, so we
  // surface a best-effort SLA default from severity. Red=7, Yellow=30, Green=60.
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
          expectedResolutionDays={fallbackSla}
        />
      </TableCell>
      <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[220px]">
        {finding.assigned_to ?? finding.requester_id.slice(0, 8) + '…'}
      </TableCell>
    </TableRow>
  );
}
