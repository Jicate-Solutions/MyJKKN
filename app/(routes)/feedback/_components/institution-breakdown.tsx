'use client';

/**
 * Super-Cockpit — per-institution (cross-college) breakdown.
 *
 * The management view: one row per college, sorted so the college with the most
 * GENUINE negatives (the real concern count, external troll-storms already
 * stripped out by the backend lane) sits on top. Self-fetches via
 * fetchInstitutionBreakdown so it can be dropped into the super-cockpit page
 * without the parent wiring a loader.
 */

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchInstitutionBreakdown,
  type SuperFilters,
  type InstitutionFeedbackRow,
} from '@/lib/services/feedback/super-cockpit-service';

interface InstitutionBreakdownProps {
  filters: SuperFilters;
}

/** Emphasise the genuine-concern count as it climbs. */
function concernClass(count: number): string {
  if (count > 20) return 'text-red-600 font-semibold';
  if (count > 8) return 'text-red-500';
  if (count > 0) return 'text-amber-600';
  return 'text-muted-foreground/40';
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function HeaderRow() {
  return (
    <tr className="border-b text-left text-xs text-muted-foreground">
      <th className="px-3 py-2 font-medium">College</th>
      <th className="px-3 py-2 font-medium text-right">Total</th>
      <th className="px-3 py-2 font-medium text-right">Positive</th>
      <th className="px-3 py-2 font-medium text-right">Negative</th>
      <th className="px-3 py-2 font-medium text-right">Genuine Concern</th>
      <th className="px-3 py-2 font-medium text-right">Needs Reply</th>
      <th className="px-3 py-2 font-medium">Top Theme</th>
    </tr>
  );
}

export function InstitutionBreakdown({ filters }: InstitutionBreakdownProps) {
  const { source, hideSpam, institutionId } = filters;
  const [rows, setRows] = useState<InstitutionFeedbackRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchInstitutionBreakdown({ source, hideSpam, institutionId })
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load the per-institution breakdown.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, hideSpam, institutionId]);

  // Genuine concern on top — the college needing attention leads.
  const sorted = [...rows].sort(
    (a, b) => b.genuine_negative - a.genuine_negative,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Per-College Breakdown</CardTitle>
        <CardDescription className="text-xs">
          One row per institution, sorted by genuine concern (external troll-storms
          excluded). The college needing attention is on top — use this to decide
          where to look first.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <HeaderRow />
              </thead>
              <tbody>
                <SkeletonRows />
              </tbody>
            </table>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            No institution feedback found for the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <HeaderRow />
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr
                    key={row.institution_id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-3 max-w-[240px]">
                      <span
                        className="font-medium truncate block"
                        title={row.institution_name}
                      >
                        {row.institution_name || '(unknown institution)'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">
                      {row.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs text-emerald-600">
                      {row.positive.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs text-muted-foreground">
                      {row.negative.toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums text-xs ${concernClass(row.genuine_negative)}`}
                    >
                      {row.genuine_negative.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">
                      {row.needs_reply > 0 ? (
                        <span className="text-amber-600 font-medium">
                          {row.needs_reply.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      {row.top_theme ? (
                        <span
                          className="text-xs text-muted-foreground truncate block"
                          title={row.top_theme}
                        >
                          {row.top_theme}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
