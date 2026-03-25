// hooks/admission/use-data-quality.ts
// React Query hooks for phone validation, data profiling, and deduplication

'use client';

import { useQuery } from '@tanstack/react-query';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { DataQualityService } from '@/lib/services/admission/data-quality-service';
import { SourceTrackingService } from '@/lib/services/admission/source-tracking-service';
import { ConsultantService } from '@/lib/services/admission/consultant-service';

function useInstitutionId() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  return selectedInstitutionId;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHONE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export function usePhoneValidationStats() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'phone-validation', 'stats', institutionId],
    queryFn: () => DataQualityService.getPhoneValidationStats(institutionId!),
    enabled: !!institutionId,
  });
}

export function useInvalidPhones(options?: { search?: string; issueFilter?: string }) {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'phone-validation', 'invalid', institutionId, options],
    queryFn: () => DataQualityService.getInvalidPhones(institutionId!, options),
    enabled: !!institutionId,
  });
}

export function usePhoneIssueBreakdown() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'phone-validation', 'breakdown', institutionId],
    queryFn: () => DataQualityService.getPhoneIssueBreakdown(institutionId!),
    enabled: !!institutionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA PROFILING
// ═══════════════════════════════════════════════════════════════════════════

export function useDataProfilingMetrics() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'data-profiling', 'metrics', institutionId],
    queryFn: () => DataQualityService.getDataProfilingMetrics(institutionId!),
    enabled: !!institutionId,
  });
}

export function useFieldAnalysis() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'data-profiling', 'fields', institutionId],
    queryFn: () => DataQualityService.getFieldAnalysis(institutionId!),
    enabled: !!institutionId,
  });
}

export function useDataIssues() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'data-profiling', 'issues', institutionId],
    queryFn: () => DataQualityService.getDataIssues(institutionId!),
    enabled: !!institutionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════

export function useDeduplicationStats() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'deduplication', 'stats', institutionId],
    queryFn: () => DataQualityService.getDeduplicationStats(institutionId!),
    enabled: !!institutionId,
  });
}

export function useDuplicateGroups() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'deduplication', 'groups', institutionId],
    queryFn: () => DataQualityService.findDuplicates(institutionId!),
    enabled: !!institutionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES
// ═══════════════════════════════════════════════════════════════════════════

export function useSourceBreakdown() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'sources', 'breakdown', institutionId],
    queryFn: () => SourceTrackingService.getSourceBreakdown(institutionId!),
    enabled: !!institutionId,
  });
}

export function useSourceStats() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'sources', 'stats', institutionId],
    queryFn: () => SourceTrackingService.getSourceStats(institutionId!),
    enabled: !!institutionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISHERS (education_consultants with consultant_type = 'publisher')
// ═══════════════════════════════════════════════════════════════════════════

export function usePublishers() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'publishers', institutionId],
    queryFn: async () => {
      const result = await ConsultantService.getConsultants({
        institution_id: institutionId!,
        consultant_type: 'publisher' as any,
        page: 1,
        limit: 100,
      });
      return result.data || [];
    },
    enabled: !!institutionId,
  });
}

