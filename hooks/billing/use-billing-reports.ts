'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { BillingReportService } from '@/lib/services/billing/reports/billing-report-service';
import type {
  BillingReportFilters,
  BillingDashboardMetrics,
  TransactionSummary,
  OutstandingReport,
  CollectionReport,
  DiscountReport,
  RefundReport,
  InvoiceReport,
  ReportExportOptions
} from '@/types/billing-schedule';

// Hook for dashboard metrics
export function useBillingDashboardMetrics(
  institutionId?: string,
  dateFrom?: string,
  dateTo?: string
) {
  const [metrics, setMetrics] = useState<BillingDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getDashboardMetrics(
        institutionId,
        dateFrom,
        dateTo
      );
      setMetrics(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch dashboard metrics';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [institutionId, dateFrom, dateTo]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
}

// Hook for transaction summary
export function useTransactionSummary(filters: BillingReportFilters = {}) {
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getTransactionSummary(filters);
      setSummary(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch transaction summary';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refetch: fetchSummary };
}

// Hook for outstanding report
export function useOutstandingReport(filters: BillingReportFilters = {}) {
  const [report, setReport] = useState<OutstandingReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getOutstandingReport(filters);
      setReport(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch outstanding report';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { report, loading, error, refetch: fetchReport };
}

// Hook for collection report
export function useCollectionReport(filters: BillingReportFilters = {}) {
  const [report, setReport] = useState<CollectionReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getCollectionReport(filters);
      setReport(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch collection report';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { report, loading, error, refetch: fetchReport };
}

// Hook for discount report
export function useDiscountReport(filters: BillingReportFilters = {}) {
  const [report, setReport] = useState<DiscountReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getDiscountReport(filters);
      setReport(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch discount report';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { report, loading, error, refetch: fetchReport };
}

// Hook for refund report
export function useRefundReport(filters: BillingReportFilters = {}) {
  const [report, setReport] = useState<RefundReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getRefundReport(filters);
      setReport(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch refund report';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { report, loading, error, refetch: fetchReport };
}

// Hook for invoice report
export function useInvoiceReport(filters: BillingReportFilters = {}) {
  const [report, setReport] = useState<InvoiceReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await BillingReportService.getInvoiceReport(filters);
      setReport(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch invoice report';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { report, loading, error, refetch: fetchReport };
}

// Hook for report export
export function useReportExport() {
  const [loading, setLoading] = useState(false);

  const exportReport = useCallback(
    async (
      reportType: string,
      filters: BillingReportFilters,
      options: ReportExportOptions
    ) => {
      try {
        setLoading(true);
        await BillingReportService.exportReport(reportType, filters, options);
        toast.success('Report exported successfully');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to export report';
        toast.error(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { exportReport, loading };
}
