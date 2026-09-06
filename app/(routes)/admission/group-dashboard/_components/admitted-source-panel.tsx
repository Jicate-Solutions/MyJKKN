'use client';

// ════════════════════════════════════════════════════════════════════════════
// Admitted by Source — the drill-down behind the "Admitted" KPI.
//
// Answers: "these N learners got admitted — which source did each come from?"
//
// Rendered as a section of the Source Analytics tab. It sits below the tab's
// own lead-anchored charts and deliberately answers a different question:
//
//   The charts above    LEAD-anchored. "What did the leads pipeline produce?"
//                       551 admitted for AY 2026.
//   This panel          PROFILE-anchored. "Who got admitted, and where from?"
//                       1,515 for AY 2026 — equal to the KPI, by construction.
//
// The gap between them is the point. Learners with no lead row are not dropped;
// they are bucketed under DIRECT_SOURCE_KEY and filterable like any source.
// For AY 2026 that bucket is 964 of 1,515 (64%); for AY 2025 and earlier it is
// 100%, because the leads pipeline only began feeding admissions in 2026.
//
// URL state (`source`, `apage`) is namespaced so it cannot collide with the
// dashboard's own `ay` / `tab` / `from` / `to` params.
//
// Spec: docs/superpowers/specs/2026-08-13-admitted-source-drilldown-design.md
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight, Download, Info, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { useAdmittedSourceCounts, useAdmittedSourceList } from '@/hooks/admission/use-group-dashboard';
import { GroupDashboardService } from '@/lib/services/admission/group-dashboard-service';
import { downloadCsv, type CsvColumn } from '@/lib/utils/csv-export';
import { DIRECT_SOURCE_KEY, type AdmittedSourceRow } from '@/types/admission-workflow-config';
import {
  sourceLabel, sourceColor, orderSourceCounts, DIRECT_SOURCE_LABEL,
} from './source-display';

interface AdmittedSourcePanelProps {
  /** Institution scope; undefined => super-admin all-access. */
  institutionIds?: string[];
  /** Selected admission year (cohort). Null disables the queries. */
  admissionYear: number | null;
}

const PAGE_SIZE = 25;
/** Safety ceiling on one export so a mis-click can't pull an unbounded set. */
const EXPORT_MAX_ROWS = 5000;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function AdmittedSourcePanel({
  institutionIds,
  admissionYear,
}: AdmittedSourcePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);

  const activeSource = searchParams.get('source'); // null => all sources
  const page = useMemo(() => {
    const n = Number(searchParams.get('apage') ?? '1');
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }, [searchParams]);

  // Writes only this panel's params, preserving everything the dashboard owns.
  const setParams = useCallback(
    (next: { source?: string | null; page?: number }) => {
      const sp = new URLSearchParams(searchParams.toString());
      if ('source' in next) {
        if (next.source) sp.set('source', next.source);
        else sp.delete('source');
        sp.delete('apage'); // changing the filter resets to page 1
      }
      if (next.page !== undefined) {
        if (next.page > 1) sp.set('apage', String(next.page));
        else sp.delete('apage');
      }
      const qs = sp.toString();
      router.replace(`/admission/group-dashboard${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  const { data: counts = [], isLoading: countsLoading } =
    useAdmittedSourceCounts(institutionIds, admissionYear);

  const offset = (page - 1) * PAGE_SIZE;
  const { data: pageData, isLoading: listLoading, isError, isPlaceholderData } =
    useAdmittedSourceList(institutionIds, admissionYear, activeSource, PAGE_SIZE, offset);

  const rows = pageData?.rows ?? [];
  const filteredTotal = pageData?.totalCount ?? 0;

  // counts covers every bucket including direct, so this sum IS the KPI total.
  const grandTotal = useMemo(() => counts.reduce((s, c) => s + c.admits, 0), [counts]);
  const directCount = useMemo(
    () => counts.find((c) => c.source === DIRECT_SOURCE_KEY)?.admits ?? 0,
    [counts]
  );
  const attributedCount = grandTotal - directCount;
  const attributedPct = grandTotal > 0 ? Math.round((attributedCount / grandTotal) * 100) : 0;

  const orderedCounts = useMemo(() => orderSourceCounts(counts), [counts]);
  const pieData = useMemo(
    () => orderedCounts.map((c) => ({
      key: c.source,
      name: sourceLabel(c.source),
      value: c.admits,
    })),
    [orderedCounts]
  );

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  // Exports the whole current filter, not just the visible page. Columns are
  // {header, accessor-fn} pairs — the accessor is a function, so an export can
  // never silently emit zero columns from a header/key mismatch.
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const { rows: allRows } = await GroupDashboardService.getAdmittedSourceBreakdown(
        institutionIds,
        admissionYear,
        activeSource,
        Math.min(filteredTotal || PAGE_SIZE, EXPORT_MAX_ROWS),
        0
      );
      const columns: CsvColumn<AdmittedSourceRow>[] = [
        { header: 'Name',           accessor: (r) => r.full_name ?? '' },
        { header: 'Application No', accessor: (r) => r.application_id ?? '' },
        { header: 'Roll No',        accessor: (r) => r.roll_number ?? '' },
        // Contact numbers. Kept as three separate columns rather than one
        // joined cell so the file can be used directly for a call list or a
        // WhatsApp upload without splitting a field first.
        { header: 'Mobile',         accessor: (r) => r.student_mobile ?? '' },
        { header: 'Father Mobile',  accessor: (r) => r.father_mobile ?? '' },
        { header: 'Mother Mobile',  accessor: (r) => r.mother_mobile ?? '' },
        { header: 'Institution',    accessor: (r) => r.institution_name },
        { header: 'Program',        accessor: (r) => r.program_name ?? '' },
        { header: 'Source',         accessor: (r) => sourceLabel(r.source) },
        { header: 'Referral Type',  accessor: (r) => r.referral_type ?? '' },
        { header: 'Referred By',    accessor: (r) => r.referred_by_name ?? '' },
        { header: 'Admitted On',    accessor: (r) => (r.admitted_at ? formatDate(r.admitted_at) : '') },
      ];
      const scope = activeSource ? `-${activeSource}` : '';
      downloadCsv(allRows, columns, `admitted-by-source${scope}-${admissionYear ?? 'all'}`);
      if (filteredTotal > EXPORT_MAX_ROWS) {
        console.warn(
          `[admitted-sources] Export truncated to ${EXPORT_MAX_ROWS} of ${filteredTotal} rows.`
        );
      }
    } finally {
      setIsExporting(false);
    }
  }, [institutionIds, admissionYear, activeSource, filteredTotal]);

  if (countsLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (grandTotal === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No admitted learners in this admission year.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="admitted-by-source" className="scroll-mt-4">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Admitted by Source</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every admitted learner ({grandTotal.toLocaleString()}), including direct
              admissions with no lead record. Matches the Admitted KPI.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || filteredTotal === 0}
          >
            {isExporting
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              : <Download className="mr-1 h-4 w-4" />}
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Attribution coverage — the headline finding, not a footnote. */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/20">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {attributedCount.toLocaleString()} of {grandTotal.toLocaleString()} admitted
              learners ({attributedPct}%)
            </span>{' '}
            came through the leads pipeline and have a source.{' '}
            <span className="font-medium text-foreground">{directCount.toLocaleString()}</span>{' '}
            were direct admissions with no lead record, so no source exists for them.
          </p>
        </div>

        {/* Source filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setParams({ source: null })}
            aria-pressed={activeSource === null}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeSource === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            All sources · {grandTotal.toLocaleString()}
          </button>
          {orderedCounts.map((c) => {
            const isDirect = c.source === DIRECT_SOURCE_KEY;
            const isActive = activeSource === c.source;
            return (
              <button
                key={c.source}
                type="button"
                onClick={() => setParams({ source: c.source })}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                } ${isDirect && !isActive ? 'border-dashed text-muted-foreground' : ''}`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sourceColor(c.source) }}
                  aria-hidden
                />
                {sourceLabel(c.source)} · {c.admits.toLocaleString()}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Donut */}
          <div className="lg:col-span-1">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={1}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={sourceColor(entry.key)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Admitted']} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Learner table */}
          <div className="lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium">
                {activeSource ? sourceLabel(activeSource) : 'All admitted learners'}
              </p>
              <Badge variant="secondary" className="text-xs">
                {filteredTotal.toLocaleString()}{' '}
                {filteredTotal === 1 ? 'learner' : 'learners'}
              </Badge>
            </div>

            {isError ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Failed to load admitted learners.
              </p>
            ) : listLoading && !isPlaceholderData ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {activeSource === DIRECT_SOURCE_KEY
                  ? 'No direct admissions in this cohort.'
                  : activeSource
                    ? `No admitted learners came from ${sourceLabel(activeSource)}.`
                    : 'No admitted learners in this admission year.'}
              </p>
            ) : (
              <div className={`max-h-[420px] overflow-auto rounded-md border ${
                isPlaceholderData ? 'opacity-60' : ''
              }`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Application No</TableHead>
                      <TableHead className="text-xs">Institution</TableHead>
                      <TableHead className="text-xs">Program</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Admitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.learner_id}>
                        <TableCell className="text-xs font-medium">
                          <Link
                            href={`/learners/enquiries/${r.learner_id}`}
                            className="hover:underline"
                          >
                            {r.full_name ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.application_id ?? r.roll_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">{r.institution_name}</TableCell>
                        <TableCell className="text-xs">{r.program_name ?? '—'}</TableCell>
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: sourceColor(r.source) }}
                              aria-hidden
                            />
                            <span className={r.source ? '' : 'italic text-muted-foreground'}>
                              {r.source ? sourceLabel(r.source) : DIRECT_SOURCE_LABEL}
                            </span>
                          </span>
                        </TableCell>
                        {/* Blank when neither a status-history 'admitted' event nor
                            activated_at was ever recorded — see spec §5. Deliberately
                            not backfilled from the profile creation date. */}
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(r.admitted_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {filteredTotal > PAGE_SIZE && (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {(offset + 1).toLocaleString()}–
                  {Math.min(offset + PAGE_SIZE, filteredTotal).toLocaleString()} of{' '}
                  {filteredTotal.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setParams({ page: page - 1 })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setParams({ page: page + 1 })}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
