'use client';

/**
 * DrilldownPolicyTable
 *
 * Renders one row per drill-down metric (per spec §3.1 — total_leads,
 * applied, filled, rejected, total_seats, fill_rate, seat_balance,
 * chart_bar, comparison_row). Columns: Metric | Default destination |
 * Current destination | Override badges | Edit.
 *
 * Read pattern: server defaults from drilldown-defaults.ts merged with
 * platform_policies rows by drilldown-policy-service.ts. Rows that exist
 * in the DB show an "override" badge per field.
 *
 * Pure render — all mutations live in the editor sheet.
 */

import { format } from 'date-fns';
import { MousePointerClick } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import {
  METRIC_LABELS,
  type DrilldownMetric,
} from './drilldown-defaults';
import {
  type ResolvedDrilldownRow,
} from './drilldown-policy-service';
import { DrilldownRowActionCell } from './drilldown-row-action-cell';

interface DrilldownPolicyTableProps {
  rows: ResolvedDrilldownRow[];
  canEdit: boolean;
  onEdit: (metric: DrilldownMetric) => void;
}

export function DrilldownPolicyTable({
  rows,
  canEdit,
  onEdit,
}: DrilldownPolicyTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[260px]">Metric</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead className="w-[140px]">Status</TableHead>
          <TableHead className="w-[180px]">Overrides</TableHead>
          <TableHead className="w-[140px]">Last updated</TableHead>
          <TableHead className="w-[100px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.metric}>
            <TableCell>
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-sm font-medium">
                    {METRIC_LABELS[row.metric]}
                  </div>
                  <code className="text-xs text-muted-foreground font-mono">
                    {row.metric}
                  </code>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <code className="font-mono text-xs break-all">
                {row.policy.destination}
              </code>
            </TableCell>
            <TableCell>
              {row.policy.enabled ? (
                <Badge variant="secondary">Enabled</Badge>
              ) : (
                <Badge variant="destructive">Disabled</Badge>
              )}
            </TableCell>
            <TableCell>
              <OverrideSummary fields={row.overriddenFields} />
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.lastUpdated
                ? format(new Date(row.lastUpdated), 'MMM d, HH:mm')
                : '—'}
            </TableCell>
            <TableCell className="text-right">
              <DrilldownRowActionCell
                row={row}
                canEdit={canEdit}
                onEdit={onEdit}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OverrideSummary({ fields }: { fields: Set<string> }) {
  if (fields.size === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">
        all defaults
      </span>
    );
  }
  // Group action_buttons.<role> entries together for compact display
  const simple: string[] = [];
  const roles: string[] = [];
  for (const f of fields) {
    if (f.startsWith('action_buttons.')) {
      roles.push(f.slice('action_buttons.'.length));
    } else {
      simple.push(f);
    }
  }
  return (
    <div className="flex flex-wrap gap-1">
      {simple.map((f) => (
        <Badge key={f} variant="default" className="text-[10px]">
          {f}
        </Badge>
      ))}
      {roles.length > 0 && (
        <Badge variant="default" className="text-[10px]">
          actions: {roles.join(', ')}
        </Badge>
      )}
    </div>
  );
}
