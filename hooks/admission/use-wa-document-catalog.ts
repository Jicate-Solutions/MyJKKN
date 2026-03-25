// hooks/admission/use-wa-document-catalog.ts
// React Query hooks for WhatsApp Document Catalog (Gap 9)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// =============================================================================
// Types (client-side mirror of service types)
// =============================================================================

export interface CatalogDocument {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  category: string;
  document_type: string;
  url: string;
  thumbnail_url: string | null;
  file_size_bytes: number | null;
  share_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Query Keys
// =============================================================================

export const waDocCatalogKeys = {
  all: ['wa-doc-catalog'] as const,
  list: (institutionId: string, category?: string, search?: string) =>
    [...waDocCatalogKeys.all, 'list', institutionId, category, search] as const,
  detail: (id: string) => [...waDocCatalogKeys.all, 'detail', id] as const,
};

// =============================================================================
// API Helpers
// =============================================================================

async function fetchCatalog(
  institutionId: string,
  category?: string,
  search?: string
): Promise<CatalogDocument[]> {
  const params = new URLSearchParams({ institution_id: institutionId });
  if (category && category !== 'all') params.set('category', category);
  if (search) params.set('search', search);

  const res = await fetch(`/api/admission/chat/documents?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch documents');
  }
  const json = await res.json();
  return json.data;
}

async function createDocument(body: {
  title: string;
  description?: string;
  category: string;
  document_type: string;
  url: string;
  thumbnail_url?: string;
  file_size_bytes?: number;
}): Promise<CatalogDocument> {
  const res = await fetch('/api/admission/chat/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create document');
  }
  const json = await res.json();
  return json.data;
}

async function updateDocument(
  id: string,
  body: Record<string, unknown>
): Promise<CatalogDocument> {
  const res = await fetch(`/api/admission/chat/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update document');
  }
  const json = await res.json();
  return json.data;
}

async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/admission/chat/documents/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete document');
  }
}

async function shareDocument(
  id: string,
  conversationId: string,
  senderId: string
): Promise<unknown> {
  const res = await fetch(`/api/admission/chat/documents/${id}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, sender_id: senderId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to share document');
  }
  return res.json();
}

// =============================================================================
// Hooks
// =============================================================================

export function useWADocumentCatalog(
  institutionId: string | undefined,
  category?: string,
  search?: string
) {
  const query = useQuery({
    queryKey: waDocCatalogKeys.list(institutionId || '', category, search),
    queryFn: () => fetchCatalog(institutionId!, category, search),
    enabled: !!institutionId,
  });

  return {
    documents: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useWADocumentMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: createDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waDocCatalogKeys.all });
      toast.success('Document added to catalog');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      updateDocument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waDocCatalogKeys.all });
      toast.success('Document updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const remove = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waDocCatalogKeys.all });
      toast.success('Document removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const share = useMutation({
    mutationFn: ({
      documentId,
      conversationId,
      senderId,
    }: {
      documentId: string;
      conversationId: string;
      senderId: string;
    }) => shareDocument(documentId, conversationId, senderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waDocCatalogKeys.all });
      toast.success('Document shared');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return { create, update, remove, share };
}
