// hooks/admission/use-communication-templates.ts
// React Query hooks for admission communication templates

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CommunicationTemplatesService,
  type CommunicationTemplate,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type TemplateFilters,
  type TemplateStats,
  type TemplateChannel,
} from '@/lib/services/admission/communication-templates-service';

// Query keys
export const communicationTemplatesKeys = {
  all: ['communication-templates'] as const,
  lists: () => [...communicationTemplatesKeys.all, 'list'] as const,
  list: (filters: TemplateFilters) => [...communicationTemplatesKeys.lists(), filters] as const,
  active: (institutionId: string, type?: TemplateChannel) =>
    [...communicationTemplatesKeys.all, 'active', institutionId, type] as const,
  details: () => [...communicationTemplatesKeys.all, 'detail'] as const,
  detail: (id: string) => [...communicationTemplatesKeys.details(), id] as const,
  stats: (institutionId: string) => [...communicationTemplatesKeys.all, 'stats', institutionId] as const,
};

/**
 * Hook to fetch communication templates with filters
 */
export function useCommunicationTemplates(filters: TemplateFilters) {
  const query = useQuery({
    queryKey: communicationTemplatesKeys.list(filters),
    queryFn: () => CommunicationTemplatesService.getTemplates(filters),
    enabled: !!filters.institutionId,
  });

  return {
    templates: query.data || [],
    total: query.data?.length || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch active templates (for use in workflows/campaigns)
 */
export function useActiveTemplates(institutionId?: string, type?: TemplateChannel) {
  const query = useQuery({
    queryKey: communicationTemplatesKeys.active(institutionId || '', type),
    queryFn: () => CommunicationTemplatesService.getActiveTemplates(institutionId!, type),
    enabled: !!institutionId,
  });

  return {
    templates: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single template by ID
 */
export function useCommunicationTemplate(id?: string) {
  const query = useQuery({
    queryKey: communicationTemplatesKeys.detail(id || ''),
    queryFn: () => CommunicationTemplatesService.getTemplate(id!),
    enabled: !!id,
  });

  return {
    template: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch template statistics
 */
export function useTemplateStats(institutionId?: string) {
  const query = useQuery({
    queryKey: communicationTemplatesKeys.stats(institutionId || ''),
    queryFn: () => CommunicationTemplatesService.getTemplateStats(institutionId!),
    enabled: !!institutionId,
    staleTime: 30000, // 30 seconds
  });

  return {
    stats: query.data || {
      totalTemplates: 0,
      activeTemplates: 0,
      byType: { sms: 0, email: 0, whatsapp: 0 },
    } as TemplateStats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook for template mutations (create, update, delete, toggle, duplicate)
 */
export function useTemplateMutations() {
  const queryClient = useQueryClient();

  const invalidateQueries = (institutionId?: string) => {
    queryClient.invalidateQueries({ queryKey: communicationTemplatesKeys.all });
    if (institutionId) {
      queryClient.invalidateQueries({ queryKey: communicationTemplatesKeys.stats(institutionId) });
    }
  };

  const createTemplate = useMutation({
    mutationFn: (input: CreateTemplateInput) => {
      const validation = CommunicationTemplatesService.validateTemplate(input);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }
      return CommunicationTemplatesService.createTemplate(input);
    },
    onSuccess: (data) => {
      toast.success('Template created successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create template');
    },
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTemplateInput }) =>
      CommunicationTemplatesService.updateTemplate(id, input),
    onSuccess: (data) => {
      toast.success('Template updated successfully');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: communicationTemplatesKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update template');
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: ({ id, institutionId }: { id: string; institutionId: string }) =>
      CommunicationTemplatesService.deleteTemplate(id),
    onSuccess: (_, { institutionId }) => {
      toast.success('Template deleted');
      invalidateQueries(institutionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete template');
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      CommunicationTemplatesService.toggleTemplateStatus(id, isActive),
    onSuccess: (data) => {
      toast.success(data.is_active ? 'Template activated' : 'Template deactivated');
      invalidateQueries(data.institution_id);
      queryClient.invalidateQueries({ queryKey: communicationTemplatesKeys.detail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle template status');
    },
  });

  const duplicateTemplate = useMutation({
    mutationFn: (id: string) => CommunicationTemplatesService.duplicateTemplate(id),
    onSuccess: (data) => {
      toast.success('Template duplicated successfully');
      invalidateQueries(data.institution_id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to duplicate template');
    },
  });

  const refreshQuality = useMutation({
    mutationFn: (institutionId: string) =>
      fetch('/api/admission/chat/templates/refresh-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution_id: institutionId }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to refresh quality ratings');
        }
        return r.json();
      }),
    onSuccess: (data) => {
      toast.success(`Quality ratings refreshed for ${data.updated} templates`);
      queryClient.invalidateQueries({ queryKey: communicationTemplatesKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to refresh quality ratings');
    },
  });

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    toggleStatus,
    duplicateTemplate,
    refreshQuality,
    isCreating: createTemplate.isPending,
    isUpdating: updateTemplate.isPending,
    isDeleting: deleteTemplate.isPending,
    isToggling: toggleStatus.isPending,
    isDuplicating: duplicateTemplate.isPending,
    isRefreshingQuality: refreshQuality.isPending,
  };
}

/**
 * Hook for template variable helpers
 */
export function useTemplateVariables() {
  return {
    extractVariables: CommunicationTemplatesService.extractVariables,
    replaceVariables: CommunicationTemplatesService.replaceVariables,
    leadVariables: CommunicationTemplatesService.getLeadVariables(),
  };
}
