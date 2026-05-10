'use client';
// hooks/internships/useCertificates.ts
// React Query hooks for internship_certificates.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listCertificates,
  getCertificateById,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  issueCertificate,
} from '@/lib/services/internships/certificates-service';
import type {
  CreateCertificateInput,
  UpdateCertificateInput,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const certificatesKeys = {
  all: ['internship-certificates'] as const,
  lists: () => [...certificatesKeys.all, 'list'] as const,
  list: (learnerId?: string, assignmentId?: string) =>
    [...certificatesKeys.lists(), learnerId ?? 'all', assignmentId ?? 'all'] as const,
  details: () => [...certificatesKeys.all, 'detail'] as const,
  detail: (id: string) => [...certificatesKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCertificates(learnerId?: string, assignmentId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: certificatesKeys.list(learnerId, assignmentId),
    queryFn: async () => {
      const { data, error } = await listCertificates(supabase, learnerId, assignmentId);
      if (error) throw error;
      return data;
    },
  });
}

export function useCertificate(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: certificatesKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getCertificateById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateCertificate() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCertificateInput) =>
      createCertificate(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Certificate record created');
      queryClient.invalidateQueries({ queryKey: certificatesKeys.list(data.learner_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create certificate record');
    },
  });
}

export function useUpdateCertificate() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateCertificateInput }) =>
      updateCertificate(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Certificate updated');
      queryClient.invalidateQueries({ queryKey: certificatesKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: certificatesKeys.list(data.learner_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update certificate');
    },
  });
}

export function useDeleteCertificate() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCertificate(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Certificate record deleted');
      queryClient.invalidateQueries({ queryKey: certificatesKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete certificate record');
    },
  });
}

export function useIssueCertificate() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      issuedBy,
      certificateNumber,
      fileUrl,
    }: {
      id: string;
      issuedBy: string;
      certificateNumber: string;
      fileUrl?: string;
    }) =>
      issueCertificate(supabase, id, issuedBy, certificateNumber, fileUrl).then(
        ({ data, error }) => {
          if (error) throw error;
          return data!;
        }
      ),
    onSuccess: (data) => {
      toast.success('Certificate issued');
      queryClient.invalidateQueries({ queryKey: certificatesKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: certificatesKeys.list(data.learner_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to issue certificate');
    },
  });
}
