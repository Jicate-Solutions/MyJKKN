// lib/services/bos/bos-sop-service.ts
// Client-side service for SOP documents. Calls the proxy API routes under
// /api/bos/sop and never touches Supabase directly so RLS and permission
// checks run server-side.

import {
  BosSopComment,
  BosSopDocument,
  BosSopFilters,
  BosSopListResponse,
  BosSopVersion,
  BosSopVersionSummary,
  CreateBosSopCommentDto,
  CreateBosSopDocumentDto,
  UpdateBosSopCommentDto,
  UpdateBosSopDocumentDto,
} from '@/types/bos-sop';

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: fallback }));
    throw new Error(err.error ?? fallback);
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export class BosSopService {
  private static base = '/api/bos/sop';

  // ── Documents ────────────────────────────────────────────────────────────

  static async list(filters: BosSopFilters = {}): Promise<BosSopListResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.set(k, String(v));
      }
    });
    const res = await fetch(`${this.base}?${params.toString()}`);
    return jsonOrThrow<BosSopListResponse>(res, 'Failed to fetch SOP documents');
  }

  static async get(id: string): Promise<BosSopDocument> {
    const res = await fetch(`${this.base}/${id}`);
    return jsonOrThrow<BosSopDocument>(res, 'SOP document not found');
  }

  static async create(data: CreateBosSopDocumentDto): Promise<BosSopDocument> {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return jsonOrThrow<BosSopDocument>(res, 'Failed to create SOP document');
  }

  static async update(
    id: string,
    data: UpdateBosSopDocumentDto
  ): Promise<BosSopDocument> {
    const res = await fetch(`${this.base}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return jsonOrThrow<BosSopDocument>(res, 'Failed to update SOP document');
  }

  static async remove(id: string): Promise<void> {
    const res = await fetch(`${this.base}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete SOP' }));
      throw new Error(err.error ?? 'Failed to delete SOP');
    }
  }

  // ── Versions ─────────────────────────────────────────────────────────────

  static async listVersions(documentId: string): Promise<BosSopVersionSummary[]> {
    const res = await fetch(`${this.base}/${documentId}/versions`);
    return jsonOrThrow<BosSopVersionSummary[]>(res, 'Failed to fetch versions');
  }

  static async getVersion(documentId: string, versionNo: number): Promise<BosSopVersion> {
    const res = await fetch(`${this.base}/${documentId}/versions/${versionNo}`);
    return jsonOrThrow<BosSopVersion>(res, 'Version not found');
  }

  static async restoreVersion(
    documentId: string,
    versionNo: number
  ): Promise<BosSopDocument> {
    const res = await fetch(`${this.base}/${documentId}/versions/${versionNo}/restore`, {
      method: 'POST',
    });
    return jsonOrThrow<BosSopDocument>(res, 'Failed to restore version');
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  static async listComments(documentId: string): Promise<BosSopComment[]> {
    const res = await fetch(`${this.base}/${documentId}/comments`);
    return jsonOrThrow<BosSopComment[]>(res, 'Failed to fetch comments');
  }

  static async addComment(
    documentId: string,
    data: CreateBosSopCommentDto
  ): Promise<BosSopComment> {
    const res = await fetch(`${this.base}/${documentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return jsonOrThrow<BosSopComment>(res, 'Failed to add comment');
  }

  static async updateComment(
    documentId: string,
    commentId: string,
    data: UpdateBosSopCommentDto
  ): Promise<BosSopComment> {
    const res = await fetch(`${this.base}/${documentId}/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return jsonOrThrow<BosSopComment>(res, 'Failed to update comment');
  }

  static async deleteComment(documentId: string, commentId: string): Promise<void> {
    const res = await fetch(`${this.base}/${documentId}/comments/${commentId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete comment' }));
      throw new Error(err.error ?? 'Failed to delete comment');
    }
  }

  // ── Exports ──────────────────────────────────────────────────────────────
  // The export endpoints stream a binary (PDF/DOCX) or text (HTML/MD/TXT)
  // response. Returning the raw Response lets the caller pipe it to a Blob.

  static async export(
    id: string,
    format: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt'
  ): Promise<Blob> {
    const res = await fetch(`${this.base}/${id}/export?format=${format}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error ?? 'Export failed');
    }
    return res.blob();
  }
}
