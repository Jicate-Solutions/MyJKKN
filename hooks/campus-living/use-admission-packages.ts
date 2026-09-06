import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdmissionPackageService } from '@/lib/services/campus-living/admission-package-service';
import type {
  AdmissionPackageFilters,
  CreateAdmissionPackageDto,
  UpdateAdmissionPackageDto,
} from '@/types/admission-packages';

// Shared React Query key — every component calling useAdmissionPackages()
// subscribes to the SAME cache entry, so a mutation invalidates this key and
// the rendered data-table refetches without a page reload.
const ADMISSION_PACKAGES_KEY = ['campus-living', 'admission-packages'] as const;

export function useAdmissionPackages(
  initialFilters: AdmissionPackageFilters = {}
) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AdmissionPackageFilters>(initialFilters);

  const query = useQuery({
    queryKey: [...ADMISSION_PACKAGES_KEY, filters],
    queryFn: () => AdmissionPackageService.getPackages(filters),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ADMISSION_PACKAGES_KEY }),
    [queryClient]
  );

  const fetchPackages = useCallback(
    async (newFilters?: AdmissionPackageFilters) => {
      if (newFilters) setFilters(newFilters);
      await invalidate();
    },
    [invalidate]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<AdmissionPackageFilters>) => {
      setFilters((current) => ({ ...current, ...newFilters, page: 1 }));
    },
    []
  );

  const createPackage = useCallback(
    async (dto: CreateAdmissionPackageDto) => {
      const result = await AdmissionPackageService.createPackage(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updatePackage = useCallback(
    async (id: string, dto: UpdateAdmissionPackageDto) => {
      const result = await AdmissionPackageService.updatePackage(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deletePackage = useCallback(
    async (id: string) => {
      await AdmissionPackageService.deletePackage(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    packages: query.data?.data ?? [],
    metadata: query.data?.metadata,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    filters,
    updateFilters,
    fetchPackages,
    createPackage,
    updatePackage,
    deletePackage,
  };
}

// ── learner → package resolver (allocation pre-fill) ────────────────────────
// Read-only handoff: given a learner + hostel year, resolve their assigned
// package, the bundled room category, and their chosen mess override.
export function usePackageForLearner(
  learnerId: string | null,
  hostelYearId?: string | null
) {
  return useQuery({
    queryKey: [
      'campus-living',
      'package-for-learner',
      learnerId,
      hostelYearId ?? null,
    ],
    queryFn: () =>
      AdmissionPackageService.getPackageForLearner(
        learnerId!,
        hostelYearId ?? null
      ),
    enabled: !!learnerId,
  });
}
