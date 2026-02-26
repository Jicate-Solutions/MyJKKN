'use client';

import { useQuery } from '@tanstack/react-query';
import { ImsFinancialService } from '@/lib/services/ims/financial-service';
import type { ImsFinancialFilters } from '@/types/ims';

export function useImsFinancialTransactions(filters: ImsFinancialFilters) {
  return useQuery({
    queryKey: ['ims-financial-transactions', filters],
    queryFn: () => ImsFinancialService.getTransactions(filters),
    enabled: !!(filters.store_id || filters.institution_id),
    staleTime: 60 * 1000,
  });
}

export function useImsFinancialSummary(
  storeId: string,
  dateFrom?: string,
  dateTo?: string,
  institutionId?: string
) {
  return useQuery({
    queryKey: ['ims-financial-summary', storeId, dateFrom, dateTo],
    queryFn: () => ImsFinancialService.getFinancialSummary(institutionId ?? '', dateFrom, dateTo, storeId),
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });
}

export function useImsDepartmentCostSummary(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-department-costs', storeId],
    queryFn: () => ImsFinancialService.getDepartmentCostSummary(institutionId ?? '', storeId),
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });
}

export function useImsItemProfitSummary(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-item-profit', storeId],
    queryFn: () => ImsFinancialService.getItemProfitSummary(institutionId ?? '', storeId),
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });
}

export function useImsTodayMetrics(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-today-metrics', storeId],
    queryFn: () => ImsFinancialService.getTodayMetrics(institutionId ?? '', storeId),
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });
}
