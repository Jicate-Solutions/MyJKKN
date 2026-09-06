import { BaseService } from '@/lib/services/base-service';
import {
  buildReportScope,
  buildReportPage,
  EXPORT_PAGE,
  REPORT_PAGE_SIZE,
} from './report-filter-params';
import type {
  BillingReportFilters,
  OutstandingReport,
  CollectionReport,
  DiscountReport,
  RefundReport,
  InvoiceReport,
  BillingDashboardMetrics,
  ReportExportOptions,
} from '@/types/billing-schedule';

/** A page of report rows plus the unpaginated total, for "showing X–Y of N". */
export interface ReportPage<T> {
  rows: T[];
  totalCount: number;
}

/**
 * Thin wrapper over the six /billing/reports RPCs (migration 20260725103000).
 * Filtering, aggregation, the permission gate and institution scope all live in
 * Postgres — see docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md.
 */
export class BillingReportService extends BaseService {
  private static page<T extends { total_count?: number | string }>(
    rows: T[] | null
  ): ReportPage<Omit<T, 'total_count'>> {
    const list = rows ?? [];
    // total_count is bigint — PostgREST serialises it as a string.
    const totalCount = list.length > 0 ? Number(list[0].total_count ?? 0) : 0;
    return {
      rows: list.map(({ total_count: _drop, ...rest }) => rest) as Omit<T, 'total_count'>[],
      totalCount,
    };
  }

  static async getDashboardMetrics(
    filters: BillingReportFilters = {}
  ): Promise<BillingDashboardMetrics> {
    return this.executeDashboardRPC<BillingDashboardMetrics>(
      'get_billing_reports_dashboard',
      buildReportScope(filters)
    );
  }

  static async getOutstandingReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<OutstandingReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_outstanding',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<OutstandingReport>;
  }

  static async getCollectionReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<CollectionReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_collection',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<CollectionReport>;
  }

  /**
   * The FULL filtered collection set in one call (p_limit null), not one page.
   *
   * Backs the Collection tab's payment-mode totals, mode filter and search —
   * none of which can be derived from a single 50-row page, and none of which
   * the RPC accepts as parameters. Capped at the RPC's own 10,000 LIMIT;
   * billing_receipts holds 2,821 rows today, so the whole set arrives.
   * `truncated` says whether that cap was actually reached, so the UI can warn
   * instead of quietly reporting partial money totals.
   */
  static async getCollectionFullSet(
    filters: BillingReportFilters = {}
  ): Promise<{ rows: CollectionReport[]; truncated: boolean }> {
    const raw = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_collection',
      { ...buildReportScope(filters), ...EXPORT_PAGE }
    );
    const list = raw ?? [];
    return {
      rows: list.map(({ total_count: _drop, ...rest }) => rest) as CollectionReport[],
      truncated: list.length >= 10000,
    };
  }

  static async getInvoiceReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<InvoiceReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_invoices',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<InvoiceReport>;
  }

  static async getDiscountReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<DiscountReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_discounts',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<DiscountReport>;
  }

  static async getRefundReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<RefundReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_refunds',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<RefundReport>;
  }

  private static readonly EXPORT_RPC: Record<string, string> = {
    outstanding: 'get_billing_reports_outstanding',
    collection: 'get_billing_reports_collection',
    invoice: 'get_billing_reports_invoices',
    discount: 'get_billing_reports_discounts',
    refund: 'get_billing_reports_refunds',
  };

  /** Exports the FULL filtered set (p_limit null), not the visible page. */
  static async exportReport(
    reportType: string,
    filters: BillingReportFilters,
    options: ReportExportOptions
  ): Promise<void> {
    const fn = this.EXPORT_RPC[reportType];
    if (!fn) throw new Error(`Unknown report type: ${reportType}`);

    const rows = await this.executeDashboardRPC<any[]>(fn, {
      ...buildReportScope(filters),
      ...EXPORT_PAGE,
    });

    const data = (rows ?? []).map(({ total_count: _drop, ...rest }) => rest);
    if (data.length === 0) throw new Error('No data matches the current filters');

    this.downloadCsv(data, `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`);
    void options;
  }

  private static downloadCsv(rows: Record<string, unknown>[], filename: string): void {
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
