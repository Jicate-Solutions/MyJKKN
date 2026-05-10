// app/(routes)/ai-pulse/evidence/naac/_components/naac-preview-table.tsx
// ============================================================================
// NAAC Evidence preview table — renders the rows that the CSV export will
// contain, in the same column order. Built on the shared Table primitive
// so styling matches the rest of the app.
// ============================================================================

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
import { ExternalLink } from 'lucide-react';
import type { NaacEvidenceRow } from '@/lib/services/ai-pulse/naac-evidence-service';

interface NaacPreviewTableProps {
  rows: NaacEvidenceRow[];
  isLoading?: boolean;
}

export function NaacPreviewTable({ rows, isLoading }: NaacPreviewTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 py-6 text-sm text-muted-foreground">
        Loading Gold Standard publications…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No Gold Standard publications match the selected filters. Adjust the
        date range or institution to see more cycles.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">AY</TableHead>
            <TableHead className="min-w-[140px]">Cycle Date</TableHead>
            <TableHead className="min-w-[160px]">Institution</TableHead>
            <TableHead className="min-w-[160px]">Department</TableHead>
            <TableHead className="min-w-[160px]">Team / Project</TableHead>
            <TableHead className="min-w-[200px]">Description</TableHead>
            <TableHead className="min-w-[120px]">GitHub</TableHead>
            <TableHead className="min-w-[120px]">Live App</TableHead>
            <TableHead className="min-w-[140px]">Featured Tool</TableHead>
            <TableHead className="min-w-[140px]">Champion</TableHead>
            <TableHead className="text-right">IG Reach</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={`${row.cycle_date}-${row.team_name}-${idx}`}>
              <TableCell>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {row.academic_year}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.cycle_date || '—'}
              </TableCell>
              <TableCell className="text-sm">{row.institution_name}</TableCell>
              <TableCell className="text-sm">{row.department_name}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{row.project_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.team_name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="max-w-[260px]">
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {row.description || '—'}
                </p>
              </TableCell>
              <TableCell>
                {row.github_url ? (
                  <a
                    href={row.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {row.live_app_url ? (
                  <a
                    href={row.live_app_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Live <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{row.featured_tool}</TableCell>
              <TableCell className="text-sm">{row.champion_at_time}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {row.ig_reach.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
