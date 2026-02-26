'use client';

import { useQuery } from '@tanstack/react-query';
import { ImsReportsService } from '@/lib/services/ims/reports-service';

export function useImsDashboardStats(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-dashboard-stats', storeId],
    queryFn: () => ImsReportsService.getDashboardStats(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsStockLevels(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-stock-levels', storeId],
    queryFn: () => ImsReportsService.getStockLevels(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsExpiringItems(storeId: string, days: number = 60, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-expiring-items', storeId, days],
    queryFn: () => ImsReportsService.getExpiringItems(storeId, days, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsStockValuation(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-stock-valuation', storeId],
    queryFn: () => ImsReportsService.getStockValuation(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsIndentSummary(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-indent-summary', storeId],
    queryFn: () => ImsReportsService.getIndentSummary(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsIndentsByDepartment(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-indents-by-dept', storeId],
    queryFn: () => ImsReportsService.getIndentsByDepartment(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsDepartmentConsumption(
  storeId: string,
  dateFrom?: string,
  dateTo?: string,
  institutionId?: string
) {
  return useQuery({
    queryKey: ['ims-dept-consumption', storeId, dateFrom, dateTo],
    queryFn: () => ImsReportsService.getDepartmentConsumption(storeId, dateFrom, dateTo, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsItemConsumption(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-item-consumption', storeId],
    queryFn: () => ImsReportsService.getItemConsumption(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsRecentActivity(storeId: string, limit: number = 10, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-recent-activity', storeId, limit],
    queryFn: () => ImsReportsService.getRecentActivity(storeId, limit, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsUpiAuditReport(
  storeId: string,
  dateFrom: string,
  dateTo: string,
  institutionId?: string
) {
  return useQuery({
    queryKey: ['ims-upi-audit', storeId, dateFrom, dateTo],
    queryFn: () => ImsReportsService.getUpiAuditReport(storeId, dateFrom, dateTo, institutionId),
    enabled: !!storeId && !!dateFrom && !!dateTo,
    staleTime: 2 * 60 * 1000,
  });
}

export function useImsAlertSummary(storeId: string, institutionId?: string) {
  return useQuery({
    queryKey: ['ims-alert-summary', storeId],
    queryFn: () => ImsReportsService.getAlertSummary(storeId, institutionId),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });
}
