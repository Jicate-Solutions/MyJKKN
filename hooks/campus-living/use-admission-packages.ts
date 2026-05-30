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

// ── learner → package resolver (allocation pre-fill) ──────────────────────
// Read-only handoff: given a learner + hostel year, resolve their assigned
// package, the bundled room category, and their chosen mess. The allocation
// flow consumes this to surface a hint card and pre-fill the mess select.
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

// ── per-program availability (package-restriction admin UI) ───────────────
const PKG_PROGRAM_ELIG_KEY = [
  'campus-living',
  'package-program-eligibility',
] as const;

export function usePackageProgramEligibility(packageId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...PKG_PROGRAM_ELIG_KEY, packageId],
    queryFn: () => AdmissionPackageService.getProgramEligibility(packageId!),
    enabled: !!packageId,
  });

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: [...PKG_PROGRAM_ELIG_KEY, packageId],
      }),
    [queryClient, packageId]
  );

  // program_id = null → "available to all programs"; a concrete id restricts.
  const addProgram = useCallback(
    async (programId: string | null) => {
      const result = await AdmissionPackageService.addProgramEligibility({
        package_id: packageId!,
        program_id: programId,
      });
      await invalidate();
      return result;
    },
    [packageId, invalidate]
  );

  const removeProgram = useCallback(
    async (id: string) => {
      await AdmissionPackageService.removeProgramEligibility(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    addProgram,
    removeProgram,
    refresh: invalidate,
  };
}
