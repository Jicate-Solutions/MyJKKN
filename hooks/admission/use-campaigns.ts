import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CampaignService } from '@/lib/services/admission/campaign-service';
import type {
  CampaignFilters,
  AttributionMode,
  ChartGranularity,
  CreateCampaignInput,
  UpdateCampaignInput,
  CreateLinkInput,
  UpdateLinkInput,
} from '@/types/admission/campaign';

export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (f: CampaignFilters) => [...campaignKeys.lists(), f] as const,
  details: () => [...campaignKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  funnel: (
    id: string,
    m: AttributionMode,
    r?: { from: Date; to: Date },
  ) => [...campaignKeys.detail(id), 'funnel', m, r] as const,
  ts: (
    id: string,
    m: AttributionMode,
    g: ChartGranularity,
    r: { from: Date; to: Date },
  ) => [...campaignKeys.detail(id), 'ts', m, g, r] as const,
  links: (id: string) => [...campaignKeys.detail(id), 'links'] as const,
  compare: (
    ids: string[],
    m: AttributionMode,
    r?: { from: Date; to: Date },
  ) => [...campaignKeys.all, 'compare', ids, m, r] as const,
  overview: (r?: { from: Date; to: Date }) =>
    [...campaignKeys.all, 'overview', r] as const,
};

// ─── Queries ────────────────────────────────────────────────
export function useCampaigns(filters?: CampaignFilters) {
  return useQuery({
    queryKey: campaignKeys.list(filters ?? {}),
    queryFn: () => CampaignService.list(filters),
    staleTime: 30_000,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => CampaignService.get(id),
    staleTime: 30_000,
    enabled: !!id,
  });
}

export function useCampaignFunnel(
  id: string,
  mode: AttributionMode = 'first',
  range?: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: campaignKeys.funnel(id, mode, range),
    queryFn: () => CampaignService.getFunnel(id, mode, range),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled: !!id,
  });
}

export function useCampaignTimeSeries(
  id: string,
  mode: AttributionMode,
  granularity: ChartGranularity,
  range: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: campaignKeys.ts(id, mode, granularity, range),
    queryFn: () =>
      CampaignService.getTimeSeries(id, mode, granularity, range),
    staleTime: 5 * 60_000,
    enabled: !!id,
  });
}

export function useCampaignLinks(id: string) {
  return useQuery({
    queryKey: campaignKeys.links(id),
    queryFn: () => CampaignService.listLinks(id),
    staleTime: 10_000,
    enabled: !!id,
  });
}

export function useCampaignsCompare(
  ids: string[],
  mode: AttributionMode = 'first',
  range?: { from: Date; to: Date },
) {
  return useQuery({
    queryKey: campaignKeys.compare(ids, mode, range),
    queryFn: () => CampaignService.compare(ids, mode, range),
    staleTime: 60_000,
    enabled: ids.length >= 2 && ids.length <= 5,
  });
}

export function useCampaignsOverview(range?: { from: Date; to: Date }) {
  return useQuery({
    queryKey: campaignKeys.overview(range),
    queryFn: () => CampaignService.getOverviewStats(range),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────
export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => CampaignService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
    onError: (err: any) => {
      const raw = err?.message ?? '';
      if (raw.includes('row-level security') || raw.includes('violates row-level')) {
        toast.error(
          'You don\'t have permission to create this campaign. ' +
          'For Global scope you need multi-institution access; ' +
          'for Institution scope you need access to the chosen institution.',
        );
      } else if (raw.includes('duplicate key') || raw.includes('unique constraint')) {
        toast.error('A campaign with that slug already exists. Please rename and try again.');
      } else if (raw.includes('institution_id is required')) {
        toast.error('Pick an institution before submitting the wizard.');
      } else if (raw.includes('Global campaigns must not specify')) {
        toast.error('Inconsistent scope/institution selection — refresh the page and try again.');
      } else {
        toast.error(raw || 'Failed to create campaign');
      }
    },
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateCampaignInput) =>
      CampaignService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function usePauseCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.pause(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useResumeCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.resume(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useArchiveCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
}

export function useCreateCampaignLink(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLinkInput) =>
      CampaignService.createLink(campaignId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.links(campaignId) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}

export function useUpdateCampaignLink(campaignId: string, linkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateLinkInput) =>
      CampaignService.updateLink(linkId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.links(campaignId) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}

export function useDeactivateCampaignLink(
  campaignId: string,
  linkId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CampaignService.deactivateLink(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.links(campaignId) });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}
