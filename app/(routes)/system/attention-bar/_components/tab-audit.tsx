'use client';

/**
 * Tab 6 — Audit Log
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 tab 6
 * Permission: attention_bar.audit.view
 *
 * Filterable, paginated table over quick_action_audit. Filters debounced
 * 250ms. CSV export of current filtered view.
 *
 * Filters supported (per existing /api/attention-bar/admin/audit):
 *   - Date range (default last 24h, max 30d enforced client-side to cap cost)
 *   - Page substring filter (debounced)
 *   - Fired-layer multi-select (0/1/2/3/4)
 *
 * NOT supported (intentional): user filter. The audit API does NOT select
 * user_id (server-side privacy decision in route.ts) so we cannot filter
 * by user without a server-side change. Documented in PR description.
 *
 * Q2 twin-check: closest filterable-table twin is permissions-audit
 * tab files, but those use bespoke shapes. The DataTable primitive
 * (components/ui/data-table) carries baggage we don't need; we use a
 * simpler Table since the column count is small and stable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSearch,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

interface AuditRow {
  id: string;
  page: string | null;
  role: string | null;
  fired_layer: number;
  rule_id: string | null;
  action_id: string | null;
  trace: unknown;
  rendered_at: string;
}

interface AuditResponse {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    from: string;
    to: string;
    pageFilter: string;
    layerFilter: string | null;
  };
}

const PAGE_SIZE = 50;
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ALL_LAYERS = [0, 1, 2, 3, 4] as const;

const LAYER_META: Record<
  number,
  { label: string; className: string }
> = {
  0: { label: 'L0 Urgent',   className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  1: { label: 'L1 Defaults', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  2: { label: 'L2 Rules',    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  3: { label: 'L3 Behavior', className: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  4: { label: 'L4 AI',       className: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' },
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

interface QueryParams {
  from: string;
  to: string;
  pageFilter: string;
  layers: number[];
  page: number;
}

function buildUrl(p: Omit<QueryParams, 'layers'> & { layer?: number | null }): string {
  const sp = new URLSearchParams();
  sp.set('from', p.from);
  sp.set('to', p.to);
  if (p.pageFilter) sp.set('page_filter', p.pageFilter);
  if (p.layer !== null && p.layer !== undefined) sp.set('fired_layer', String(p.layer));
  sp.set('page', String(p.page));
  sp.set('pageSize', String(PAGE_SIZE));
  return `/api/attention-bar/admin/audit?${sp.toString()}`;
}

/**
 * Fetcher that fans out to one request per selected layer when a multi-select
 * is in play, since the existing API only accepts a single fired_layer.
 * Results are merged + re-sorted desc by rendered_at and re-paginated client-side.
 *
 * For the common cases (no layer filter, or single-layer filter) only one
 * request is made. Total fan-out is bounded by ALL_LAYERS.length = 5.
 */
async function fetchAudit(params: QueryParams): Promise<AuditResponse> {
  const { layers, ...rest } = params;
  if (layers.length === 0 || layers.length === ALL_LAYERS.length) {
    const res = await fetch(buildUrl({ ...rest, layer: null }));
    if (!res.ok) throw new Error(`Audit fetch failed (${res.status})`);
    return res.json();
  }
  if (layers.length === 1) {
    const res = await fetch(buildUrl({ ...rest, layer: layers[0] }));
    if (!res.ok) throw new Error(`Audit fetch failed (${res.status})`);
    return res.json();
  }
  // Multi-layer: fan out, merge, re-paginate. Pull a generous slice from
  // each layer (page=1, pageSize 200 max) for client-side merging.
  const responses = await Promise.all(
    layers.map(async layer => {
      const sp = new URLSearchParams();
      sp.set('from', rest.from);
      sp.set('to', rest.to);
      if (rest.pageFilter) sp.set('page_filter', rest.pageFilter);
      sp.set('fired_layer', String(layer));
      sp.set('page', '1');
      sp.set('pageSize', '200');
      const res = await fetch(`/api/attention-bar/admin/audit?${sp.toString()}`);
      if (!res.ok) throw new Error(`Audit fetch failed for layer ${layer} (${res.status})`);
      return res.json() as Promise<AuditResponse>;
    })
  );
  const merged = responses.flatMap(r => r.rows);
  merged.sort(
    (a, b) =>
      new Date(b.rendered_at).getTime() - new Date(a.rendered_at).getTime()
  );
  const total = responses.reduce((acc, r) => acc + r.total, 0);
  const start = (rest.page - 1) * PAGE_SIZE;
  return {
    rows: merged.slice(start, start + PAGE_SIZE),
    total,
    page: rest.page,
    pageSize: PAGE_SIZE,
    filters: {
      from: rest.from,
      to: rest.to,
      pageFilter: rest.pageFilter,
      layerFilter: layers.join(','),
    },
  };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: AuditRow[]): string {
  const headers = [
    'rendered_at',
    'page',
    'role',
    'fired_layer',
    'rule_id',
    'action_id',
    'trace',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.rendered_at),
        csvEscape(r.page),
        csvEscape(r.role),
        csvEscape(r.fired_layer),
        csvEscape(r.rule_id),
        csvEscape(r.action_id),
        csvEscape(r.trace),
      ].join(',')
    );
  }
  return lines.join('\n');
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TabAudit() {
  const now = useMemo(() => new Date(), []);
  const dayAgo = useMemo(() => new Date(now.getTime() - 24 * 60 * 60 * 1000), [now]);

  const [range, setRange] = useState<DateRange | undefined>({
    from: dayAgo,
    to: now,
  });
  const [pageFilterRaw, setPageFilterRaw] = useState('');
  const [selectedLayers, setSelectedLayers] = useState<Set<number>>(new Set());
  const [pageNum, setPageNum] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Debounce page filter
  const pageFilter = useDebounced(pageFilterRaw, 250);

  // Derived range with clamps
  const { from, to, rangeError } = useMemo(() => {
    const f = range?.from ?? dayAgo;
    const t = range?.to ?? now;
    const span = t.getTime() - f.getTime();
    if (span > MAX_RANGE_MS) {
      return {
        from: f.toISOString(),
        to: t.toISOString(),
        rangeError:
          'Date range exceeds 30 days — narrow the window to load results.',
      };
    }
    if (span < 0) {
      return {
        from: f.toISOString(),
        to: t.toISOString(),
        rangeError: 'End date must be after start date.',
      };
    }
    return { from: f.toISOString(), to: t.toISOString(), rangeError: null };
  }, [range, dayAgo, now]);

  // Reset to page 1 when filters change (debounced inputs)
  useEffect(() => {
    setPageNum(1);
  }, [from, to, pageFilter, selectedLayers]);

  const layersArr = useMemo(
    () => Array.from(selectedLayers).sort(),
    [selectedLayers]
  );

  const queryParams: QueryParams = {
    from,
    to,
    pageFilter,
    layers: layersArr,
    page: pageNum,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['attention-bar-audit', queryParams],
    queryFn: () => fetchAudit(queryParams),
    enabled: !rangeError,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function toggleLayer(layer: number): void {
    setSelectedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  async function handleExportCsv(): Promise<void> {
    if (rangeError) return;
    setExporting(true);
    try {
      // Pull up to 5 pages worth (250 rows) of the current filtered view
      // to cap memory + cost while still being useful for ad-hoc audit.
      const PAGES_TO_EXPORT = 5;
      const allRows: AuditRow[] = [];
      for (let p = 1; p <= PAGES_TO_EXPORT; p++) {
        const result = await fetchAudit({ ...queryParams, page: p });
        allRows.push(...result.rows);
        if (result.rows.length < PAGE_SIZE) break;
      }
      const csv = rowsToCsv(allRows);
      const stamp = format(new Date(), 'yyyyMMdd-HHmmss');
      downloadBlob(`attention-bar-audit-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
    } catch (err) {
      console.error('[tab-audit] CSV export failed:', err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className='space-y-6 py-4'>
      {/* Header */}
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <h3 className='text-lg font-semibold flex items-center gap-2'>
          <FileSearch className='h-5 w-5 text-indigo-500' />
          Audit Log
        </h3>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleExportCsv}
            disabled={exporting || !!rangeError || !data || data.rows.length === 0}
          >
            <Download className='h-4 w-4 mr-1.5' />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button variant='ghost' size='sm' onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Filter className='h-4 w-4 text-muted-foreground' />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Date range */}
            <div className='space-y-1.5'>
              <label className='text-xs font-medium text-muted-foreground'>
                Date range (max 30 days)
              </label>
              <DatePickerWithRange
                value={range}
                onChange={setRange}
                placeholder='Last 24 hours'
              />
            </div>

            {/* Page substring */}
            <div className='space-y-1.5'>
              <label className='text-xs font-medium text-muted-foreground'>
                Page filter (substring; debounced)
              </label>
              <Input
                value={pageFilterRaw}
                onChange={e => setPageFilterRaw(e.target.value)}
                placeholder='e.g. /admission, /academic/attendance'
              />
            </div>
          </div>

          {/* Fired layer multi-select */}
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground block'>
              Fired layer (multi-select)
            </label>
            <div className='flex flex-wrap gap-2'>
              {ALL_LAYERS.map(layer => {
                const selected = selectedLayers.has(layer);
                const meta = LAYER_META[layer];
                return (
                  <Button
                    key={layer}
                    type='button'
                    variant={selected ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => toggleLayer(layer)}
                    className='h-8'
                  >
                    {meta.label}
                  </Button>
                );
              })}
              {selectedLayers.size > 0 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => setSelectedLayers(new Set())}
                  className='h-8'
                >
                  Clear
                </Button>
              )}
            </div>
            {selectedLayers.size === 0 && (
              <p className='text-xs text-muted-foreground italic'>
                No layer filter — showing all fired layers.
              </p>
            )}
          </div>

          {rangeError && (
            <p className='text-sm text-destructive'>{rangeError}</p>
          )}

          <p className='text-xs text-muted-foreground italic'>
            Note: user filter is intentionally not exposed — the audit API
            omits user_id from its response (privacy decision). To
            investigate a specific user, use the dedicated user-resolver
            tooling under /users/permissions-audit.
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className='pb-3 flex-row items-center justify-between'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Activity className='h-4 w-4 text-muted-foreground' />
            Results
            {data && (
              <Badge variant='secondary' className='ml-2'>
                {data.total.toLocaleString()} total
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className='text-sm text-destructive py-4'>
              Failed to load audit log. Check server logs.
            </p>
          )}

          {isLoading && (
            <div className='space-y-2 py-2'>
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className='h-10 bg-muted animate-pulse rounded'
                />
              ))}
            </div>
          )}

          {data && !isLoading && (
            <>
              <div className='border rounded-md overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='whitespace-nowrap'>Rendered At</TableHead>
                      <TableHead>Page</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Layer</TableHead>
                      <TableHead className='whitespace-nowrap'>Rule ID</TableHead>
                      <TableHead className='whitespace-nowrap'>Action ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className='text-center text-muted-foreground py-8'
                        >
                          No audit rows match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                    {data.rows.map(row => {
                      const meta = LAYER_META[row.fired_layer];
                      return (
                        <TableRow key={row.id}>
                          <TableCell className='whitespace-nowrap font-mono text-xs'>
                            {format(new Date(row.rendered_at), 'yyyy-MM-dd HH:mm:ss')}
                          </TableCell>
                          <TableCell
                            className='font-mono text-xs max-w-[260px] truncate'
                            title={row.page ?? ''}
                          >
                            {row.page ?? '—'}
                          </TableCell>
                          <TableCell className='text-xs'>
                            {row.role ?? '—'}
                          </TableCell>
                          <TableCell>
                            {meta ? (
                              <Badge
                                variant='secondary'
                                className={meta.className}
                              >
                                {meta.label}
                              </Badge>
                            ) : (
                              <Badge variant='outline'>
                                L{row.fired_layer}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className='font-mono text-xs max-w-[160px] truncate'
                            title={row.rule_id ?? ''}
                          >
                            {row.rule_id ?? '—'}
                          </TableCell>
                          <TableCell
                            className='font-mono text-xs max-w-[200px] truncate'
                            title={row.action_id ?? ''}
                          >
                            {row.action_id ?? '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data.total > PAGE_SIZE && (
                <div className='flex items-center justify-between mt-4 text-sm'>
                  <span className='text-muted-foreground'>
                    Page {pageNum} of {totalPages}
                  </span>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setPageNum(p => Math.max(1, p - 1))}
                      disabled={pageNum <= 1}
                    >
                      <ChevronLeft className='h-4 w-4 mr-1' /> Prev
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        setPageNum(p => Math.min(totalPages, p + 1))
                      }
                      disabled={pageNum >= totalPages}
                    >
                      Next <ChevronRight className='h-4 w-4 ml-1' />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
