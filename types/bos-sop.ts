// types/bos-sop.ts
// Domain types for the Standard Operating Procedure (SOP) document editor.
// Mirrors the bos_sop_documents / bos_sop_versions / bos_sop_comments tables
// created by 20260508130000_create_bos_sop_documents.sql.

// ── Categories & enums ─────────────────────────────────────────────────────
// Categories drive the default template choice and how documents are bucketed
// in the list view. Keep in sync with bos_sop_documents.category at the DB
// level (no CHECK constraint there, so adding categories is a UI-only change).

export const SOP_CATEGORIES = [
  'syllabus_framing',
  'syllabus_revision',
  'meeting_protocol',
  'evaluation_policy',
  'general',
] as const;

export type SopCategory = (typeof SOP_CATEGORIES)[number];

export const SOP_CATEGORY_LABELS: Record<SopCategory, string> = {
  syllabus_framing: 'Framing of Syllabus',
  syllabus_revision: 'Revision of Syllabus',
  meeting_protocol: 'Meeting Protocol',
  evaluation_policy: 'Evaluation Policy',
  general: 'General',
};

export const SOP_LANGUAGES = ['en', 'ta', 'mixed'] as const;
export type SopLanguage = (typeof SOP_LANGUAGES)[number];

export const SOP_LANGUAGE_LABELS: Record<SopLanguage, string> = {
  en: 'English',
  ta: 'தமிழ் (Tamil)',
  mixed: 'Bilingual (English + Tamil)',
};

export const SOP_STATUSES = ['draft', 'review', 'approved', 'archived'] as const;
export type SopStatus = (typeof SOP_STATUSES)[number];

export const SOP_STATUS_LABELS: Record<SopStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
  archived: 'Archived',
};

// ── Tiptap content shape ───────────────────────────────────────────────────
// We don't import Tiptap's runtime types here (they would force tiptap as a
// hard dep on every consumer). The shape below mirrors the JSONContent type
// from @tiptap/core: a recursive tree of nodes, each with optional `attrs`,
// `content`, `text`, and `marks`.

export interface SopNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: SopNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  [key: string]: unknown;
}

export interface SopDocContent extends SopNode {
  type: 'doc';
  content?: SopNode[];
}

// ── Page settings ──────────────────────────────────────────────────────────
// Persisted in `page_settings` JSONB. Mirrors the Word "Page Layout" ribbon.
// Margins are in millimetres; the renderer converts to CSS at print time.

export interface SopPageSettings {
  pageSize?: 'A4' | 'Letter' | 'Legal' | 'Custom';
  customWidthMm?: number;
  customHeightMm?: number;
  orientation?: 'portrait' | 'landscape';
  margins?: { top: number; right: number; bottom: number; left: number };
  watermark?: { text: string; opacity?: number; angle?: number } | null;
  header?: string;
  footer?: string;
  showPageNumbers?: boolean;
  numberingStart?: number;
  fontFamily?: string;
  fontSizePt?: number;
  lineHeight?: number;
  theme?: 'light' | 'dark' | 'sepia' | 'corporate';
}

// ── Domain entities ────────────────────────────────────────────────────────

export interface BosSopDocument {
  id: string;
  institutions_id: string;
  title: string;
  category: SopCategory;
  description: string | null;
  language: SopLanguage;
  status: SopStatus;
  content: SopDocContent;
  page_settings: SopPageSettings;
  plain_text: string | null;
  current_version: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

// Lightweight row shape for the list view (omits the heavy `content` JSON
// to keep payloads small).
export interface BosSopDocumentSummary {
  id: string;
  institutions_id: string;
  title: string;
  category: SopCategory;
  description: string | null;
  language: SopLanguage;
  status: SopStatus;
  current_version: number;
  updated_at: string;
  created_at: string;
  // Joined-from auth.users via the API; optional so the list works without it.
  updated_by_name?: string | null;
  comment_count?: number;
}

export interface BosSopVersion {
  id: string;
  document_id: string;
  version_no: number;
  content: SopDocContent;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BosSopVersionSummary {
  id: string;
  document_id: string;
  version_no: number;
  note: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface BosSopComment {
  id: string;
  document_id: string;
  parent_id: string | null;
  range_from: number | null;
  range_to: number | null;
  anchor_text: string | null;
  body: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  replies?: BosSopComment[];
}

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateBosSopDocumentDto {
  institutions_id?: string; // super-admin can target a specific institution
  title: string;
  category?: SopCategory;
  description?: string | null;
  language?: SopLanguage;
  content?: SopDocContent;
  page_settings?: SopPageSettings;
  template_id?: string; // pre-fills content from the template library
}

export interface UpdateBosSopDocumentDto {
  title?: string;
  category?: SopCategory;
  description?: string | null;
  language?: SopLanguage;
  status?: SopStatus;
  content?: SopDocContent;
  page_settings?: SopPageSettings;
  /**
   * When true, the API records a new version snapshot after the update.
   * Used by the editor's "Save & Snapshot" button. Plain autosaves omit this.
   */
  snapshot?: boolean;
  /** Optional note attached to the snapshot (only used when snapshot=true). */
  snapshot_note?: string;
}

export interface CreateBosSopCommentDto {
  parent_id?: string | null;
  range_from?: number | null;
  range_to?: number | null;
  anchor_text?: string | null;
  body: string;
}

export interface UpdateBosSopCommentDto {
  body?: string;
  is_resolved?: boolean;
}

// ── Filters & list response ────────────────────────────────────────────────

export interface BosSopFilters {
  institutionsId?: string;
  status?: SopStatus;
  category?: SopCategory;
  language?: SopLanguage;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'updated_at' | 'created_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface BosSopListResponse {
  data: BosSopDocumentSummary[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
