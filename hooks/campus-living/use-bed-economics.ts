'use client';

import { useQuery } from '@tanstack/react-query';
import { BedEconomicsService } from '@/lib/services/campus-living/bed-economics-service';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Bed Economics React Query hooks (Bed Economics PR A, 2026-06-07).
 *
 * One hook per fn_bed_econ_* RPC, keyed on (institutionId, hostelYearId).
 * Conventions copied from hooks/campus-living/use-campus-living-analytics.ts.
 * All RPCs are super-admin-only server-side, so every hook is gated on
 * isSuperAdmin AND a non-empty hostelYearId. institutionId is optional
 * (undefined = network view).
 *
 * Spec: specs/bed-economics-dashboard-spec-2026-06-07.md §11.
 */

// Query key factory
export const bedEconomicsKeys = {
  all: ['bed-economics'] as const,
  readiness: (filters: Record<string, unknown>) =>
    ['bed-economics', 'readiness', filters] as const,
  summary: (filters: Record<string, unknown>) =>
    ['bed-economics', 'summary', filters] as const,
  blockGrid: (filters: Record<string, unknown>) =>
    ['bed-economics', 'block-grid', filters] as const,
  vacancyDetail: (filters: Record<string, unknown>) =>
    ['bed-economics', 'vacancy-detail', filters] as const,
  costGrid: (filters: Record<string, unknown>) =>
    ['bed-economics', 'cost-grid', filters] as const,
  trend: (filters: Record<string, unknown>) =>
    ['bed-economics', 'trend', filters] as const,
  consolidation: (filters: Record<string, unknown>) =>
    ['bed-economics', 'consolidation', filters] as const,
  premiumPotential: (filters: Record<string, unknown>) =>
    ['bed-economics', 'premium-potential', filters] as const,
};

// --- Query hooks ---

export function useBedEconReadiness(hostelYearId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.readiness({ hostelYearId }),
    queryFn: () => BedEconomicsService.getReadiness(hostelYearId as string),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconSummary(
  hostelYearId: string | undefined,
  institutionId?: string,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.summary({ hostelYearId, institutionId }),
    queryFn: () => BedEconomicsService.getSummary(hostelYearId as string, institutionId),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconBlockGrid(
  hostelYearId: string | undefined,
  institutionId?: string,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.blockGrid({ hostelYearId, institutionId }),
    queryFn: () => BedEconomicsService.getBlockGrid(hostelYearId as string, institutionId),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconVacancyDetail(
  hostelYearId: string | undefined,
  institutionId?: string,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.vacancyDetail({ hostelYearId, institutionId }),
    queryFn: () =>
      BedEconomicsService.getVacancyDetail(hostelYearId as string, institutionId),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconCostGrid(
  hostelYearId: string | undefined,
  institutionId?: string,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.costGrid({ hostelYearId, institutionId }),
    queryFn: () => BedEconomicsService.getCostGrid(hostelYearId as string, institutionId),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconTrend(
  hostelYearId: string | undefined,
  institutionId?: string,
  days = 365,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.trend({ hostelYearId, institutionId, days }),
    queryFn: () => BedEconomicsService.getTrend(hostelYearId as string, institutionId, days),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconConsolidation(
  hostelYearId: string | undefined,
  institutionId?: string,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.consolidation({ hostelYearId, institutionId }),
    queryFn: () =>
      BedEconomicsService.getConsolidation(hostelYearId as string, institutionId),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}

export function useBedEconPremiumPotential(
  hostelYearId: string | undefined,
  institutionId?: string,
  assumedBaseInr?: number,
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: bedEconomicsKeys.premiumPotential({ hostelYearId, institutionId, assumedBaseInr }),
    queryFn: () =>
      BedEconomicsService.getPremiumPotential(hostelYearId as string, institutionId, assumedBaseInr),
    enabled: isSuperAdmin && !!hostelYearId,
  });
}
