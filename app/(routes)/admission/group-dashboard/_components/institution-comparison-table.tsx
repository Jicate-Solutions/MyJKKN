'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { InstitutionAdmissionSummary } from '@/types/admission-workflow-config';

interface InstitutionComparisonTableProps {
  institutions: InstitutionAdmissionSummary[];
}

function getFillBadge(pct: number) {
  if (pct >= 90) return <Badge variant="default">{pct}%</Badge>;
  if (pct >= 70) return <Badge variant="secondary">{pct}%</Badge>;
  if (pct >= 50) return <Badge variant="outline">{pct}%</Badge>;
  return <Badge variant="destructive">{pct}%</Badge>;
}

export function InstitutionComparisonTable({
  institutions,
}: InstitutionComparisonTableProps) {
  if (institutions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No institution data available.
      </p>
    );
  }

  /* TODO: B.2 follow-up — wire row onClick to per-institution dashboard.
   * Blocked on: /admission/dashboard?institution_id=X param support OR new
   * /admission/institutions/[id] route. See spec §6.2 for the defer rationale.
   * Today rows render with cursor-help to signal "click coming soon" without
   * dead-clicking. Destinations live in policy
   * `dashboard.drilldown.comparison_row.destination`. */
  return (
    <div className="border rounded-md overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Institution</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Applied</TableHead>
            <TableHead className="text-right">Enrolled</TableHead>
            <TableHead className="text-right">Rejected</TableHead>
            <TableHead className="text-right">Seats</TableHead>
            <TableHead className="text-right">Fill %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {institutions.map((inst) => (
            <TableRow
              key={inst.institution_id}
              title="Per-institution drill-down coming soon."
              className="cursor-help"
            >
              <TableCell className="font-medium text-sm">
                {inst.institution_name}
              </TableCell>
              <TableCell className="text-right">{inst.total_leads}</TableCell>
              <TableCell className="text-right">{inst.applied}</TableCell>
              <TableCell className="text-right">{inst.enrolled}</TableCell>
              <TableCell className="text-right">{inst.rejected}</TableCell>
              <TableCell className="text-right">{inst.total_seats || '—'}</TableCell>
              <TableCell className="text-right">
                {inst.total_seats > 0 ? getFillBadge(inst.fill_percentage) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
