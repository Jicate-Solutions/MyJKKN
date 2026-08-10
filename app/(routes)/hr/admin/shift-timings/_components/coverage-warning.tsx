'use client';

/**
 * Which employment categories in this institution have NO shift timing today.
 *
 * Exists because empty cells here are legitimate — JKKN Main Office is 114/114
 * non-teaching and both schools are 100% teaching — so "no rows" cannot be
 * treated as an error by itself. This strip distinguishes correctly-empty from
 * misconfigured, which is the failure mode this module keeps hitting elsewhere.
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useShiftTimingCoverage } from '@/hooks/hr/use-shift-timings';

interface CoverageWarningProps {
  institutionId: string;
}

export function CoverageWarning({ institutionId }: CoverageWarningProps) {
  const { data, isLoading } = useShiftTimingCoverage(institutionId);

  if (isLoading || !data) return null;

  const uncovered = data.filter((row) => !row.resolved_timing_id && row.staff_count > 0);
  const totalStaff = data.reduce((sum, row) => sum + row.staff_count, 0);

  if (uncovered.length === 0) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          All {totalStaff} staff in this institution resolve to a shift timing today.
        </AlertDescription>
      </Alert>
    );
  }

  const affected = uncovered.reduce((sum, row) => sum + row.staff_count, 0);

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p>
          {affected} staff across {uncovered.length}{' '}
          {uncovered.length === 1 ? 'category has' : 'categories have'} no shift timing
          today. Biometric punches for them cannot be evaluated.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {uncovered.map((row) => (
            <Badge key={row.employment_category_id} variant="outline">
              {row.category_name} ({row.staff_count})
            </Badge>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
