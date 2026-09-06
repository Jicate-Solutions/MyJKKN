'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  BillingReportService,
  type ReportPage,
} from '@/lib/services/billing/reports/billing-report-service';
import { REPORT_PAGE_SIZE } from '@/lib/services/billing/reports/report-filter-params';
import { StudentYearBreakdownService } from '@/lib/services/billing/reports/student-year-breakdown-service';
import type {
  BillingReportFilters,
  BillingDashboardMetrics,
  StudentYearBreakdown,
  OutstandingReport,
  CollectionReport,
  DiscountReport,
  RefundReport,
  InvoiceReport,
  ReportExportOptions,
} from '@/types/billing-schedule';

export function useBillingDashboardMetrics(filters: BillingReportFilters = {}) {
  const [metrics, setMetrics] = useState<BillingDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serialised so a caller passing a fresh object literal each render does not
  // re-trigger the effect forever.
  const key = JSON.stringify(filters);

  // Guards against out-of-order responses: e.g. pick an institution then
  // clear it fires two requests, and if the first (with-institution) one
  // resolves last it would overwrite the correct cleared-filter result.
  const reqId = useRef(0);

  const fetchMetrics = useCallback(async () => {
    const myReq = ++reqId.current;
    try {
      setLoading(true);
      setError(null);
      const res = await BillingReportService.getDashboardMetrics(JSON.parse(key));
      if (myReq !== reqId.current) return; // superseded by a newer request
      setMetrics(res);
    } catch (err) {
      if (myReq !== reqId.current) return; // don't surface a stale error either
      const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard metrics';
      setError(msg);
      toast.error(msg);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
}

/**
 * Year-wise student counts and amounts for the dashboard cards.
 *
 * Its own hook rather than folded into useBillingDashboardMetrics so a failure
 * here hides only the year cards instead of blanking the whole dashboard.
 */
export function useStudentYearBreakdown(filters: BillingReportFilters = {}) {
  const [breakdown, setBreakdown] = useState<StudentYearBreakdown[]>([]);

  const key = JSON.stringify(filters);
  // Guards against out-of-order responses, as useBillingDashboardMetrics does:
  // change a filter twice quickly and the slower first reply must not win.
  const reqId = useRef(0);

  useEffect(() => {
    const myReq = ++reqId.current;
    StudentYearBreakdownService.getBreakdown(JSON.parse(key))
      .then((rows) => {
        if (myReq === reqId.current) setBreakdown(rows);
      })
      .catch((err) => {
        // Fields are spelled out because a PostgrestError carries message/code
        // on the prototype, so logging the object alone prints a bare `{}` and
        // tells you nothing about what actually failed.
        console.warn(
          `[useStudentYearBreakdown] ${err?.code ?? 'ERR'}: ${
            err?.message ?? String(err)
          }${err?.details ? ` — ${err.details}` : ''}${
            err?.hint ? ` (hint: ${err.hint})` : ''
          }`
        );
        // warn, not error: the cards are supplementary and the totals above
        // them come from a different query, so this hides one section rather
        // than interrupting the page. console.error would also be promoted by
        // the Next.js dev overlay into a blocking Console Error card.
        if (myReq === reqId.current) setBreakdown([]);
      });
  }, [key]);

  return { breakdown };
}

/**
 * The whole filtered collection set, for the Collection tab.
 *
 * Unlike useCollectionReport (one server-paginated page) this pulls every
 * matching receipt so payment-mode totals, the mode filter and the name /
 * receipt-number search can all be computed over the FULL set rather than over
 * whichever 50 rows happen to be on screen. Paging then happens client-side,
 * which also makes search feel instant.
 */
export function useCollectionFullSet(filters: BillingReportFilters = {}) {
  const [rows, setRows] = useState<CollectionReport[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(filters);
  const reqId = useRef(0);

  const fetchRows = useCallback(async () => {
    const myReq = ++reqId.current;
    try {
      setLoading(true);
      setError(null);
      const res = await BillingReportService.getCollectionFullSet(JSON.parse(key));
      if (myReq !== reqId.current) return; // superseded by a newer request
      setRows(res.rows);
      setTruncated(res.truncated);
    } catch (err) {
      if (myReq !== reqId.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to fetch collection report';
      setError(msg);
      toast.error(msg);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return { rows, truncated, loading, error, refetch: fetchRows };
}

/** Shared engine for the five paginated list tabs. */
function useReportList<T>(
  filters: BillingReportFilters,
  fetcher: (f: BillingReportFilters, page: number) => Promise<ReportPage<T>>,
  label: string
) {
  const [report, setReport] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(filters);
  const prevKey = useRef(key);

  // Guards against two failure modes:
  //  1. Out-of-order responses — a later request resolving before an
  //     earlier one must not have its result overwritten.
  //  2. Stale-page fetches — see the fetch effect below.
  const reqId = useRef(0);

  const fetchReport = useCallback(async () => {
    // On the render where `filters` just changed, `page` here may still be
    // the OLD page for the NEW key (e.g. page 7, offset 300) because the
    // page-reset effect below hasn't run yet this commit. `prevKey.current`
    // hasn't been updated by that effect yet either — effects run in
    // declaration order within a commit, and this effect (declared first)
    // fires before it — so `prevKey.current !== key` reliably detects that
    // transitional render. Skip ONLY when that page is actually stale
    // (page !== 1): if we were already on page 1, there is nothing to
    // reset and no further render will happen to retry the fetch, since
    // the reset effect's `setPage(1)` below would be a same-value no-op.
    if (prevKey.current !== key && page !== 1) return;

    const myReq = ++reqId.current;
    try {
      setLoading(true);
      setError(null);
      const res = await fetcher(JSON.parse(key), page);
      if (myReq !== reqId.current) return; // superseded by a newer request
      setReport(res.rows);
      setTotalCount(res.totalCount);
    } catch (err) {
      if (myReq !== reqId.current) return; // don't surface a stale error either
      const msg = err instanceof Error ? err.message : `Failed to fetch ${label}`;
      setError(msg);
      toast.error(msg);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
    // `fetcher` is a module-level static method; stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, label]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // A filter change invalidates the current page number — page 7 of the old
  // result set is meaningless against the new one. Declared AFTER the fetch
  // effect above so it runs second within the same commit (see the comment
  // inside fetchReport for why the ordering matters).
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      setPage(1);
    }
  }, [key]);

  return { report, totalCount, page, setPage, loading, error, refetch: fetchReport, pageSize: REPORT_PAGE_SIZE };
}

export const useOutstandingReport = (f: BillingReportFilters = {}) =>
  useReportList<OutstandingReport>(f, (ff, p) => BillingReportService.getOutstandingReport(ff, p), 'outstanding report');

export const useCollectionReport = (f: BillingReportFilters = {}) =>
  useReportList<CollectionReport>(f, (ff, p) => BillingReportService.getCollectionReport(ff, p), 'collection report');

export const useInvoiceReport = (f: BillingReportFilters = {}) =>
  useReportList<InvoiceReport>(f, (ff, p) => BillingReportService.getInvoiceReport(ff, p), 'invoice report');

export const useDiscountReport = (f: BillingReportFilters = {}) =>
  useReportList<DiscountReport>(f, (ff, p) => BillingReportService.getDiscountReport(ff, p), 'discount report');

export const useRefundReport = (f: BillingReportFilters = {}) =>
  useReportList<RefundReport>(f, (ff, p) => BillingReportService.getRefundReport(ff, p), 'refund report');

export function useReportExport() {
  const [loading, setLoading] = useState(false);

  const exportReport = useCallback(
    async (reportType: string, filters: BillingReportFilters, options: ReportExportOptions) => {
      try {
        setLoading(true);
        await BillingReportService.exportReport(reportType, filters, options);
        toast.success('Report exported successfully');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to export report');
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { exportReport, loading };
}
