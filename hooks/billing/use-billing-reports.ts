'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  BillingReportService,
  type ReportPage,
} from '@/lib/services/billing/reports/billing-report-service';
import { REPORT_PAGE_SIZE } from '@/lib/services/billing/reports/report-filter-params';
import type {
  BillingReportFilters,
  BillingDashboardMetrics,
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

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMetrics(await BillingReportService.getDashboardMetrics(JSON.parse(key)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard metrics';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
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

  // A filter change invalidates the current page number — page 7 of the old
  // result set is meaningless against the new one.
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      setPage(1);
    }
  }, [key]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetcher(JSON.parse(key), page);
      setReport(res.rows);
      setTotalCount(res.totalCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to fetch ${label}`;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
    // `fetcher` is a module-level static method; stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, label]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

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
