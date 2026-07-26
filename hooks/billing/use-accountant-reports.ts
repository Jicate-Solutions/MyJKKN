import { useQuery } from '@tanstack/react-query';
import { BillingAccountantReportService } from '@/lib/services/billing/reports/accountant-report-service';
import type {
  AccountantReportFilters,
  CollectionsGroupBy,
} from '@/types/billing-accountant-reports';

export const accountantReportKeys = {
  all: ['accountant-reports'] as const,
  kpis: (f: AccountantReportFilters) => [...accountantReportKeys.all, 'kpis', f] as const,
  collections: (f: AccountantReportFilters, g: CollectionsGroupBy) =>
    [...accountantReportKeys.all, 'collections', g, f] as const,
  outstanding: (f: AccountantReportFilters) =>
    [...accountantReportKeys.all, 'outstanding', f] as const,
  schemes: (f: AccountantReportFilters) => [...accountantReportKeys.all, 'schemes', f] as const,
  years: (institutionId?: string) =>
    [...accountantReportKeys.all, 'years', institutionId ?? null] as const,
};

const STALE = 2 * 60 * 1000;

export function useReportKpis(filters: AccountantReportFilters) {
  return useQuery({
    queryKey: accountantReportKeys.kpis(filters),
    queryFn: () => BillingAccountantReportService.getKpis(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportCollections(
  filters: AccountantReportFilters,
  groupBy: CollectionsGroupBy
) {
  return useQuery({
    queryKey: accountantReportKeys.collections(filters, groupBy),
    queryFn: () => BillingAccountantReportService.getCollections(filters, groupBy),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportOutstanding(filters: AccountantReportFilters) {
  return useQuery({
    queryKey: accountantReportKeys.outstanding(filters),
    queryFn: () => BillingAccountantReportService.getOutstandingByYear(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportSchemes(filters: AccountantReportFilters) {
  return useQuery({
    queryKey: accountantReportKeys.schemes(filters),
    queryFn: () => BillingAccountantReportService.getSchemes(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportAcademicYears(institutionId?: string) {
  return useQuery({
    queryKey: accountantReportKeys.years(institutionId),
    queryFn: () => BillingAccountantReportService.getAcademicYears(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}
