// hooks/admission/use-personal-wa-templates.ts
// React Query hooks for personal WhatsApp message templates

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type {
  PersonalMessageTemplate,
  CreatePersonalTemplateInput,
  UpdatePersonalTemplateInput,
  PersonalTemplateCategory,
} from '@/types/whatsapp-personal';

const QUERY_KEY = 'wa-personal-templates';

async function fetchTemplates(
  institutionId: string,
  category?: PersonalTemplateCategory
): Promise<PersonalMessageTemplate[]> {
  const params = new URLSearchParams({ institution_id: institutionId });
  if (category) params.set('category', category);

  const res = await fetch(`/api/whatsapp-personal/templates?${params}`);
  if (!res.ok) throw new Error('Failed to fetch templates');
  const data = await res.json();
  return data.templates || [];
}

export function usePersonalWATemplates(
  institutionId: string,
  category?: PersonalTemplateCategory
) {
  return useQuery({
    queryKey: [QUERY_KEY, institutionId, category],
    queryFn: () => fetchTemplates(institutionId, category),
    enabled: !!institutionId,
    staleTime: 30_000,
  });
}

export function usePersonalWATemplateMutations(institutionId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, institutionId] });

  const createTemplate = useMutation({
    mutationFn: async (input: CreatePersonalTemplateInput) => {
      const res = await fetch('/api/whatsapp-personal/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create template');
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success('Template created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...input }: UpdatePersonalTemplateInput & { id: string }) => {
      const res = await fetch(`/api/whatsapp-personal/templates?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update template');
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success('Template updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/whatsapp-personal/templates?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete template');
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success('Template removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}
