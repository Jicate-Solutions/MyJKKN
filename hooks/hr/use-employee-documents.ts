'use client';

/**
 * HR Employee Documents — React Query hooks (T1.5b Phase 2a)
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2a)
 * Pattern: hooks call into EmployeeDocumentsService directly (mirrors
 * useCreateVacateDocument from hooks/campus-living/use-hostel-vacate.ts).
 *
 * Phase 2a hooks (THIS PR):
 *   useStaffForCurrentUser   — resolves auth.uid() → staff record
 *   useMyDocuments           — list live uploads for a staff_id
 *   useDocumentChecklist     — required-docs joined with latest live upload
 *   useUploadDocument        — mutation that uploads + invalidates the lists
 *   useGetSignedDownloadUrl  — convenience mutation for one-shot signed URLs
 *
 * Phase 2b additions (NOT in this PR):
 *   useVerifyDocument        — HR officer verification mutation
 *   useExpiringDocuments     — expiry queue for cron + dashboard widget
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  EmployeeDocumentsService,
  type UploadDocumentArgs,
} from '@/lib/services/hr/employee-documents-service';
import type {
  HRDocumentChecklistItem,
  HREmployeeDocument,
} from '@/types/hr';

// =====================================================================================
// Query keys
// =====================================================================================

export const employeeDocumentKeys = {
  all: ['hr-employee-documents'] as const,
  staff: () => ['hr-employee-documents', 'staff-context'] as const,
  myList: (staffId: string) =>
    ['hr-employee-documents', 'mine', staffId] as const,
  checklist: (staffId: string) =>
    ['hr-employee-documents', 'checklist', staffId] as const,
};

// =====================================================================================
// Queries
// =====================================================================================

/**
 * Resolve the staff record for the current authenticated user. Returns
 * `{ id, institution_id }` or `null` (signed-out, no staff link, etc).
 */
export function useStaffForCurrentUser() {
  return useQuery({
    queryKey: employeeDocumentKeys.staff(),
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      return EmployeeDocumentsService.getStaffForCurrentUser(supabase);
    },
    // Staff context rarely changes; cache aggressively.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * List the current employee's live uploads. Pass undefined to skip the query.
 */
export function useMyDocuments(staffId: string | undefined) {
  return useQuery({
    queryKey: employeeDocumentKeys.myList(staffId ?? ''),
    queryFn: async (): Promise<HREmployeeDocument[]> => {
      if (!staffId) return [];
      const supabase = createClientSupabaseClient();
      return EmployeeDocumentsService.listMyDocuments(supabase, staffId);
    },
    enabled: !!staffId,
  });
}

/**
 * The merged required-docs + uploads checklist for the "My Documents" page.
 */
export function useDocumentChecklist(staffId: string | undefined) {
  return useQuery({
    queryKey: employeeDocumentKeys.checklist(staffId ?? ''),
    queryFn: async (): Promise<HRDocumentChecklistItem[]> => {
      if (!staffId) return [];
      const supabase = createClientSupabaseClient();
      return EmployeeDocumentsService.getRequiredChecklistForStaff(supabase, staffId);
    },
    enabled: !!staffId,
  });
}

// =====================================================================================
// Mutations
// =====================================================================================

/**
 * Upload a document. On success, invalidates the per-staff list + checklist.
 * Caller is responsible for re-running form validation; the service does its
 * own client-side guards (size + MIME) but the UI should pre-flight too so
 * the user sees errors before clicking Upload.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: UploadDocumentArgs) => {
      const supabase = createClientSupabaseClient();
      return EmployeeDocumentsService.uploadDocument(supabase, args);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: employeeDocumentKeys.myList(data.staff_id),
      });
      queryClient.invalidateQueries({
        queryKey: employeeDocumentKeys.checklist(data.staff_id),
      });
      toast.success(`Uploaded "${data.document_name}"`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Upload failed.');
    },
  });
}

/**
 * Mutation wrapper around getSignedDownloadUrl. The reason this is a mutation
 * (not a query) is that signed URLs expire — we don't want to cache them.
 * Each click of "View" / "Download" produces a fresh URL.
 */
export function useGetSignedDownloadUrl() {
  return useMutation({
    mutationFn: async (documentId: string): Promise<string> => {
      const supabase = createClientSupabaseClient();
      return EmployeeDocumentsService.getSignedDownloadUrl(supabase, documentId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Could not open document.');
    },
  });
}
