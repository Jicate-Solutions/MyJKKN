// hooks/admission/use-wa-segments.ts
// React Query hooks for WhatsApp audience segmentation (Gap 6)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  Segment,
  SegmentCriterion,
  SegmentPreviewResult,
  CreateSegmentParams,
  UpdateSegmentParams,
  ResolvedLead,
} from '@/lib/services/whatsapp/whatsapp-segment-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const waSegmentKeys = {
  all: ['wa-segments'] as const,
  list: (institutionId: string) => [...waSegmentKeys.all, 'list', institutionId] as const,
  detail: (segmentId: string) => [...waSegmentKeys.all, 'detail', segmentId] as const,
  preview: () => [...waSegmentKeys.all, 'preview'] as const,
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchSegments(institutionId: string, isActive?: boolean): Promise<Segment[]> {
  const params = new URLSearchParams({ institution_id: institutionId });
  if (isActive !== undefined) params.set('is_active', String(isActive));

  const res = await fetch(`/api/admission/campaigns/segments?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch segments');
  }
  const data = await res.json();
  return data.segments;
}

async function fetchSegment(segmentId: string): Promise<Segment> {
  const res = await fetch(`/api/admission/campaigns/segments/${segmentId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch segment');
  }
  const data = await res.json();
  return data.segment;
}

async function createSegmentApi(params: CreateSegmentParams): Promise<Segment> {
  const res = await fetch('/api/admission/campaigns/segments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create segment');
  }
  const data = await res.json();
  return data.segment;
}

async function updateSegmentApi(segmentId: string, params: UpdateSegmentParams): Promise<Segment> {
  const res = await fetch(`/api/admission/campaigns/segments/${segmentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update segment');
  }
  const data = await res.json();
  return data.segment;
}

async function deleteSegmentApi(segmentId: string): Promise<void> {
  const res = await fetch(`/api/admission/campaigns/segments/${segmentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete segment');
  }
}

async function previewSegmentApi(params: {
  institution_id: string;
  criteria: SegmentCriterion[];
  logic: 'AND' | 'OR';
}): Promise<SegmentPreviewResult> {
  const res = await fetch('/api/admission/campaigns/segments/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to preview segment');
  }
  return res.json();
}

async function resolveSegmentApi(segmentId: string): Promise<{ leads: ResolvedLead[]; total: number }> {
  const res = await fetch(`/api/admission/campaigns/segments/${segmentId}/resolve`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to resolve segment');
  }
  return res.json();
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetch all segments for an institution
 */
export function useWASegments(institutionId?: string) {
  const query = useQuery({
    queryKey: waSegmentKeys.list(institutionId || ''),
    queryFn: () => fetchSegments(institutionId!),
    enabled: !!institutionId,
  });

  return {
    segments: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch a single segment by ID
 */
export function useWASegment(segmentId?: string) {
  const query = useQuery({
    queryKey: waSegmentKeys.detail(segmentId || ''),
    queryFn: () => fetchSegment(segmentId!),
    enabled: !!segmentId,
  });

  return {
    segment: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * Preview a segment (mutation — not cached, called on demand)
 */
export function useWASegmentPreview() {
  const mutation = useMutation({
    mutationFn: previewSegmentApi,
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to preview segment');
    },
  });

  return {
    preview: mutation.mutate,
    previewAsync: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    reset: mutation.reset,
  };
}

/**
 * CRUD + resolve mutations for segments
 */
export function useWASegmentMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: createSegmentApi,
    onSuccess: (segment) => {
      queryClient.invalidateQueries({ queryKey: waSegmentKeys.list(segment.institution_id) });
      toast.success('Segment created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create segment');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...params }: UpdateSegmentParams & { id: string }) =>
      updateSegmentApi(id, params),
    onSuccess: (segment) => {
      queryClient.invalidateQueries({ queryKey: waSegmentKeys.list(segment.institution_id) });
      queryClient.invalidateQueries({ queryKey: waSegmentKeys.detail(segment.id) });
      toast.success('Segment updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update segment');
    },
  });

  const remove = useMutation({
    mutationFn: deleteSegmentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waSegmentKeys.all });
      toast.success('Segment deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete segment');
    },
  });

  const resolve = useMutation({
    mutationFn: resolveSegmentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waSegmentKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resolve segment');
    },
  });

  return {
    create,
    update,
    delete: remove,
    resolve,
  };
}
