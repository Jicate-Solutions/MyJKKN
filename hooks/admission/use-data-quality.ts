// hooks/admission/use-data-quality.ts
// React Query hooks for phone validation, data profiling, and deduplication

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { DataQualityService } from '@/lib/services/admission/data-quality-service';
import { ScholarshipService } from '@/lib/services/admission/scholarship-service';
import { HostelService } from '@/lib/services/admission/hostel-service';
import { SourceTrackingService } from '@/lib/services/admission/source-tracking-service';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { DocumentService } from '@/lib/services/admission/document-service';

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
// SCHOLARSHIPS
// ═══════════════════════════════════════════════════════════════════════════

export function useScholarships() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'scholarships', institutionId],
    queryFn: () => ScholarshipService.getScholarships(institutionId!),
    enabled: !!institutionId,
  });
}

export function useScholarshipApplications() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'scholarship-applications', institutionId],
    queryFn: () => ScholarshipService.getScholarshipApplications(institutionId!),
    enabled: !!institutionId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOSTELS
// ═══════════════════════════════════════════════════════════════════════════

export function useHostels() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'hostels', institutionId],
    queryFn: () => HostelService.getHostels(institutionId!),
    enabled: !!institutionId,
  });
}

export function useHostelAllocations() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'hostel-allocations', institutionId],
    queryFn: () => HostelService.getAllocations(institutionId!),
    enabled: !!institutionId,
  });
}

export function useHostelWaitlist() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'hostel-waitlist', institutionId],
    queryFn: () => HostelService.getWaitlist(institutionId!),
    enabled: !!institutionId,
  });
}

export function useAllocateHostelRoom() {
  const queryClient = useQueryClient();
  const institutionId = useInstitutionId();
  return useMutation({
    mutationFn: (params: {
      student_id: string;
      hostel_id: string;
      room_id?: string;
      bed_id?: string;
      academic_year?: string;
      semester?: string;
    }) => {
      if (!institutionId) throw new Error('No institution selected');
      return HostelService.allocateRoom({ ...params, institution_id: institutionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admission', 'hostel-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['admission', 'hostels'] });
    },
  });
}

export function useUpdateWaitlistStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; status: string }) =>
      HostelService.updateWaitlistStatus(params.id, params.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admission', 'hostel-waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['admission', 'hostel-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['admission', 'hostels'] });
    },
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

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

export function useDocumentTypes() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'document-types', institutionId],
    queryFn: () => DocumentService.getDocumentTypes(institutionId!),
    enabled: !!institutionId,
  });
}

export function useDocumentStats() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'document-stats', institutionId],
    queryFn: () => DocumentService.getDocumentStats(institutionId!),
    enabled: !!institutionId,
  });
}

export function usePendingDocuments() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'pending-documents', institutionId],
    queryFn: () => DocumentService.getPendingDocuments(institutionId!),
    enabled: !!institutionId,
  });
}

export function useRecentVerifications() {
  const institutionId = useInstitutionId();
  return useQuery({
    queryKey: ['admission', 'recent-verifications', institutionId],
    queryFn: () => DocumentService.getRecentVerifications(institutionId!),
    enabled: !!institutionId,
  });
}

export function useUpdateDocumentVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { docId: string; status: 'verified' | 'rejected' | 'pending'; rejectionReason?: string }) =>
      DocumentService.updateVerificationStatus(params.docId, params.status, params.rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admission', 'pending-documents'] });
      queryClient.invalidateQueries({ queryKey: ['admission', 'recent-verifications'] });
      queryClient.invalidateQueries({ queryKey: ['admission', 'document-stats'] });
    },
  });
}
