// hooks/bos/use-bos-sop.ts
// React Query hooks for the SOP document module. Mirrors the cache-key shape
// used by /hooks/bos/use-bos-taxonomies.ts so cache-invalidation idioms transfer.

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  BosSopComment,
  BosSopDocument,
  BosSopFilters,
  BosSopListResponse,
  BosSopVersionSummary,
  CreateBosSopCommentDto,
  CreateBosSopDocumentDto,
  UpdateBosSopCommentDto,
  UpdateBosSopDocumentDto,
} from '@/types/bos-sop';
import { BosSopService } from '@/lib/services/bos/bos-sop-service';
import { useAuth } from '../use-auth';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ── Query Key Factory ────────────────────────────────────────────────────────

export const bosSopKeys = {
  all: ['bos-sop'] as const,
  lists: () => [...bosSopKeys.all, 'list'] as const,
  list: (filters: BosSopFilters) => [...bosSopKeys.lists(), filters] as const,
  details: () => [...bosSopKeys.all, 'detail'] as const,
  detail: (id: string) => [...bosSopKeys.details(), id] as const,
  versions: (id: string) => [...bosSopKeys.detail(id), 'versions'] as const,
  comments: (id: string) => [...bosSopKeys.detail(id), 'comments'] as const,
};

// ── List ─────────────────────────────────────────────────────────────────────

export function useBosSopDocuments(
  filters: BosSopFilters = {}
): UseQueryResult<BosSopListResponse, Error> {
  const { profile } = useAuth();
  const { data: institutionCtx } = useInstitutionContext();

  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

  const scoped: BosSopFilters = {
    ...filters,
    institutionsId: institutionCtx?.myjkkn_id ?? filters.institutionsId ?? undefined,
  };

  return useQuery({
    queryKey: bosSopKeys.list(scoped),
    queryFn: () => BosSopService.list(scoped),
    enabled: !!profile && (!!institutionCtx?.myjkkn_id || isSuperAdmin),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── Detail ───────────────────────────────────────────────────────────────────

export function useBosSopDocument(id: string | undefined) {
  return useQuery({
    queryKey: bosSopKeys.detail(id ?? ''),
    queryFn: () => BosSopService.get(id!),
    enabled: !!id,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ── Create ───────────────────────────────────────────────────────────────────

export function useCreateBosSopDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBosSopDocumentDto) => BosSopService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bosSopKeys.lists() });
    },
  });
}

// ── Update ───────────────────────────────────────────────────────────────────

export function useUpdateBosSopDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosSopDocumentDto }) =>
      BosSopService.update(id, data),
    onSuccess: (updated: BosSopDocument) => {
      queryClient.setQueryData(bosSopKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: bosSopKeys.lists() });
      // Snapshot may have changed version list — invalidate to force refetch.
      queryClient.invalidateQueries({ queryKey: bosSopKeys.versions(updated.id) });
    },
  });
}

// ── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteBosSopDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BosSopService.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: bosSopKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: bosSopKeys.lists() });
    },
  });
}

// ── Versions ─────────────────────────────────────────────────────────────────

export function useBosSopVersions(documentId: string | undefined) {
  return useQuery({
    queryKey: bosSopKeys.versions(documentId ?? ''),
    queryFn: () => BosSopService.listVersions(documentId!),
    enabled: !!documentId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useRestoreBosSopVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionNo }: { id: string; versionNo: number }) =>
      BosSopService.restoreVersion(id, versionNo),
    onSuccess: (restored) => {
      queryClient.setQueryData(bosSopKeys.detail(restored.id), restored);
      queryClient.invalidateQueries({ queryKey: bosSopKeys.versions(restored.id) });
    },
  });
}

// ── Comments ─────────────────────────────────────────────────────────────────

export function useBosSopComments(documentId: string | undefined) {
  return useQuery<BosSopComment[]>({
    queryKey: bosSopKeys.comments(documentId ?? ''),
    queryFn: () => BosSopService.listComments(documentId!),
    enabled: !!documentId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useAddBosSopComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateBosSopCommentDto }) =>
      BosSopService.addComment(id, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: bosSopKeys.comments(vars.id) });
    },
  });
}

export function useUpdateBosSopComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      commentId,
      data,
    }: {
      documentId: string;
      commentId: string;
      data: UpdateBosSopCommentDto;
    }) => BosSopService.updateComment(documentId, commentId, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: bosSopKeys.comments(vars.documentId) });
    },
  });
}

export function useDeleteBosSopComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, commentId }: { documentId: string; commentId: string }) =>
      BosSopService.deleteComment(documentId, commentId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: bosSopKeys.comments(vars.documentId) });
    },
  });
}
