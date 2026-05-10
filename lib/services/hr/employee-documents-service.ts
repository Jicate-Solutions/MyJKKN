/**
 * HR Employee Documents Service (T1.5b Phase 2a)
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2a)
 * Pattern: static class with SupabaseClient as first arg (mirrors
 * RecruitmentJobsService + LeaveService). Storage usage pattern lifted from
 * app/(routes)/campus-living/vacate-requests/_components/document-uploader.tsx
 * — adapted to enforce institution_id/staff_id path-isolation.
 *
 * Q-locks (Director, 2026-05-10) baked into this file:
 *   - Single bucket `hr-employee-documents`
 *   - Path: {institution_id}/{staff_id}/{document_code}_{ts}.{ext}
 *   - 5 MB cap (client-side guard before server)
 *   - verification_status defaults to 'pending' on upload
 *   - expires_at optional; cron is Phase 2b
 *
 * Methods:
 *   getStaffByProfileId       — resolve auth.uid() → staff record (id + institution_id)
 *   uploadDocument            — upload to storage + insert row, returns canonical row
 *   listMyDocuments           — list rows for a staff_id (live = not replaced)
 *   getRequiredChecklistForStaff — required-docs joined with latest live upload per code
 *   getSignedDownloadUrl      — short-lived signed URL for retrieval
 *   listForVerification       — HR officer queue: paginated, filterable, with employee join (Phase 2b)
 *   verifyDocument            — HR officer marks status=verified (Phase 2b)
 *   rejectDocument            — HR officer marks status=rejected with required note (Phase 2b)
 *   signedUrlFor              — signed URL by storage_path (used by cron + verification page) (Phase 2b)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HREmployeeDocument,
  HRDocumentChecklistItem,
  EmployeeDocumentMimeType,
  EmployeeDocumentVerificationStatus,
} from '@/types/hr';
import {
  EMPLOYEE_DOCUMENT_ALLOWED_MIME,
  EMPLOYEE_DOCUMENT_MAX_BYTES,
} from '@/types/hr';

// =====================================================================================
// Phase 2b types — exported for the verification page + hooks to consume.
// =====================================================================================

/**
 * A single row in the HR officer's verification queue: a document plus the
 * relevant fields from the employee (staff) that uploaded it. Joined via
 * staff_id FK.
 */
export interface EmployeeDocumentVerificationRow {
  id: string;
  staff_id: string;
  institution_id: string;
  document_code: string;
  document_name: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: EmployeeDocumentMimeType;
  verification_status: EmployeeDocumentVerificationStatus;
  verification_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  replaces_document_id: string | null;
  uploaded_at: string;
  uploaded_by: string;
  /** Raw join field from the supabase select; consumers should read `employee` instead. */
  staff?: unknown;
  /** Joined employee snapshot. NULL when staff record was deleted (rare). */
  employee: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    designation: string | null;
  } | null;
}

const BUCKET_ID = 'hr-employee-documents';

// Default 1-hour signed URL for downloads. Long enough for a click-then-view
// flow without leaking durable URLs into browser history.
const SIGNED_URL_TTL_SEC = 60 * 60;

// =====================================================================================
// Types
// =====================================================================================

export interface UploadDocumentArgs {
  staffId: string;
  /** Document code mirroring hr_required_documents.document_code (or ad-hoc string). */
  documentCode: string;
  /** Human-readable name surfaced in UIs (defaults to file.name when omitted). */
  documentName?: string;
  /** FK to hr_required_documents. NULL for ad-hoc uploads not in any policy. */
  requiredDocumentId?: string | null;
  /** ISO timestamptz string. NULL for non-expirable docs. */
  expiresAt?: string | null;
  /** ID of the document this upload supersedes (when re-uploading). */
  replacesDocumentId?: string | null;
  /** Browser File from <input type="file">. */
  file: File;
}

export interface StaffContext {
  id: string;
  institution_id: string;
}

// =====================================================================================
// Service
// =====================================================================================

export class EmployeeDocumentsService {
  // ----- Identity helpers -----

  /**
   * Resolve the staff record for the current authenticated user.
   * Returns null when:
   *   - user is not signed in
   *   - user's profile_id doesn't link to any staff row
   *   - the staff row is deactivated (best-effort filter at the call site)
   *
   * Mirrors AttendanceService.getStaffByProfileId pattern but does not
   * require a known institution_id up-front — the staff row carries it.
   */
  static async getStaffForCurrentUser(
    supabase: SupabaseClient
  ): Promise<StaffContext | null> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('staff')
      .select('id, institution_id')
      .eq('profile_id', userId)
      .maybeSingle();

    if (error) {
      // RLS errors / missing-table errors will throw; treat null as "no staff record"
      throw new Error(`Could not look up staff record: ${error.message}`);
    }
    if (!data) return null;
    return { id: data.id as string, institution_id: data.institution_id as string };
  }

  // ----- Upload -----

  /**
   * Validate + upload to storage + insert table row.
   *
   * Order is deliberate:
   *   1. Client-side validation (size + MIME) — fail fast, no network I/O.
   *   2. Look up staff context to derive institution_id (path-isolation requires it).
   *   3. Upload to storage at the canonical path (institution/staff/code_ts.ext).
   *   4. Insert table row pointing at the storage_path.
   *
   * If step 4 fails after step 3 succeeds we attempt best-effort cleanup of the
   * uploaded object so we don't accumulate orphaned files.
   *
   * NOTE: callers should NOT pass the staff_id of a different employee unless
   * they hold hr.employees.edit + institution access — RLS will reject in that
   * case but the friendly error comes from the trigger / RLS message.
   */
  static async uploadDocument(
    supabase: SupabaseClient,
    args: UploadDocumentArgs
  ): Promise<HREmployeeDocument> {
    const {
      staffId,
      documentCode,
      documentName,
      requiredDocumentId = null,
      expiresAt = null,
      replacesDocumentId = null,
      file,
    } = args;

    // ---- 1. Client-side validation ------------------------------------------------
    if (!file) {
      throw new Error('No file provided.');
    }
    if (!EMPLOYEE_DOCUMENT_ALLOWED_MIME.includes(file.type as EmployeeDocumentMimeType)) {
      throw new Error(
        `Unsupported file type "${file.type || 'unknown'}". Only PDF, JPEG, or PNG.`
      );
    }
    if (file.size === 0) {
      throw new Error('File is empty.');
    }
    if (file.size > EMPLOYEE_DOCUMENT_MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(
        `File is ${mb} MB, exceeds the 5 MB limit.`
      );
    }
    if (!documentCode || documentCode.trim().length === 0) {
      throw new Error('document_code is required.');
    }

    // ---- 2. Resolve staff context (drives institution_id) -------------------------
    // We re-fetch the staff record by id so we get an authoritative institution_id
    // even when the caller is HR officer uploading on behalf of another employee.
    const { data: staffRow, error: staffErr } = await supabase
      .from('staff')
      .select('id, institution_id')
      .eq('id', staffId)
      .maybeSingle();

    if (staffErr) {
      throw new Error(`Could not look up staff record: ${staffErr.message}`);
    }
    if (!staffRow) {
      throw new Error('Staff record not found.');
    }

    const institutionId = (staffRow as { institution_id: string }).institution_id;
    if (!institutionId) {
      throw new Error('Staff record has no institution_id; cannot enforce path isolation.');
    }

    // ---- 3. Compose canonical storage path ---------------------------------------
    // Sanitize the document_code segment so it can't break the path layout.
    // `safeCode` retains alphanumerics, dashes, dots, underscores; everything
    // else gets dropped.
    const safeCode = documentCode.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = file.name.includes('.')
      ? file.name.split('.').pop()!.toLowerCase()
      : mimeToExt(file.type as EmployeeDocumentMimeType);
    const ts = Date.now();
    const storagePath = `${institutionId}/${staffId}/${safeCode}_${ts}.${ext}`;

    // ---- 4. Upload to storage ----------------------------------------------------
    const { error: upErr } = await supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (upErr) {
      throw new Error(`Upload failed: ${upErr.message}`);
    }

    // ---- 5. Insert table row -----------------------------------------------------
    // Resolve current user for uploaded_by/created_by audit cols.
    const { data: auth } = await supabase.auth.getUser();
    const uploaderId = auth?.user?.id;
    if (!uploaderId) {
      // Best-effort cleanup — if we got here the upload succeeded but the
      // session disappeared mid-call. Either way, fail loudly.
      await supabase.storage.from(BUCKET_ID).remove([storagePath]).catch(() => {});
      throw new Error('Upload aborted: no authenticated user.');
    }

    const insertPayload = {
      staff_id: staffId,
      institution_id: institutionId,
      required_document_id: requiredDocumentId,
      document_code: documentCode.trim(),
      document_name: (documentName ?? file.name).trim(),
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type as EmployeeDocumentMimeType,
      verification_status: 'pending' as const,
      expires_at: expiresAt,
      replaces_document_id: replacesDocumentId,
      uploaded_by: uploaderId,
      created_by: uploaderId,
      updated_by: uploaderId,
    };

    const { data, error: insErr } = await supabase
      .from('hr_employee_documents')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insErr) {
      // Cleanup orphaned storage object (best-effort).
      await supabase.storage.from(BUCKET_ID).remove([storagePath]).catch(() => {});
      throw new Error(`Failed to record upload: ${insErr.message}`);
    }

    return data as HREmployeeDocument;
  }

  // ----- Read -----

  /**
   * List the live (non-replaced) document rows for a staff_id, ordered by
   * upload recency. RLS filters automatically — employees see own, HR sees
   * within institution.
   *
   * "Live" = the document hasn't itself been superseded by a newer upload.
   * We exclude rows whose id appears as another row's replaces_document_id.
   */
  static async listMyDocuments(
    supabase: SupabaseClient,
    staffId: string
  ): Promise<HREmployeeDocument[]> {
    if (!staffId) return [];

    const { data, error } = await supabase
      .from('hr_employee_documents')
      .select('*')
      .eq('staff_id', staffId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list documents: ${error.message}`);
    }

    const rows = (data ?? []) as HREmployeeDocument[];
    const supersededIds = new Set(
      rows
        .map((r) => r.replaces_document_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    );

    return rows.filter((r) => !supersededIds.has(r.id));
  }

  /**
   * Build the document checklist for a single staff member: every required
   * document the staff's employment_type calls for, joined with the latest
   * live upload (if any) per document_code.
   *
   * Filtering applies_to_employment_types is server-side: we read the staff's
   * employment_type from hr_staff_details (full_time only) and pass it into
   * the WHERE on hr_required_documents. Phase 2b (non-staff types) extends
   * this to read from hr_employees.
   */
  static async getRequiredChecklistForStaff(
    supabase: SupabaseClient,
    staffId: string
  ): Promise<HRDocumentChecklistItem[]> {
    if (!staffId) return [];

    // Resolve hr_organization_id from the staff's hr_staff_details row.
    // If absent, the staff hasn't been onboarded into HR yet; return empty
    // checklist with a hint via console (UI will show empty-state).
    const { data: hrDetails, error: hrErr } = await supabase
      .from('hr_staff_details')
      .select('hr_organization_id')
      .eq('staff_id', staffId)
      .maybeSingle();

    if (hrErr) {
      throw new Error(`Could not load HR details: ${hrErr.message}`);
    }

    if (!hrDetails) {
      // Not onboarded — return empty list so UI can render an empty state
      // rather than throwing. Director can decide later if this should be
      // a hard error.
      return [];
    }

    const hrOrgId = (hrDetails as { hr_organization_id: string }).hr_organization_id;

    // Pull all active required documents scoped to this org with employment_type
    // applicable to full_time (Phase 2a covers full_time staff only).
    const { data: required, error: reqErr } = await supabase
      .from('hr_required_documents')
      .select('id, document_code, document_name, category, is_mandatory, notes, applies_to_employment_types')
      .eq('hr_organization_id', hrOrgId)
      .is('valid_until', null)
      .order('document_name');

    if (reqErr) {
      throw new Error(`Could not load required documents: ${reqErr.message}`);
    }

    // Filter applies_to_employment_types in JS (text[] array filtering via
    // PostgREST is trickier than just doing it client-side after a small fetch).
    const applicable = (required ?? []).filter((r: any) => {
      const types: string[] = Array.isArray(r.applies_to_employment_types)
        ? r.applies_to_employment_types
        : [];
      return types.includes('full_time');
    });

    // Pull all uploads for this staff in one query (live filtering done in JS).
    const uploads = await this.listMyDocuments(supabase, staffId);

    // Index uploads by document_code (latest wins thanks to ordering).
    const latestByCode = new Map<string, HREmployeeDocument>();
    for (const up of uploads) {
      if (!latestByCode.has(up.document_code)) {
        latestByCode.set(up.document_code, up);
      }
    }

    return applicable.map((r: any): HRDocumentChecklistItem => ({
      required_document_id: r.id,
      document_code: r.document_code,
      document_name: r.document_name,
      category: r.category ?? null,
      is_mandatory: Boolean(r.is_mandatory),
      notes: r.notes ?? null,
      upload: latestByCode.get(r.document_code) ?? null,
    }));
  }

  /**
   * Generate a short-lived signed URL for downloading a document.
   * RLS on storage.objects gates whether the caller can ask for one.
   */
  static async getSignedDownloadUrl(
    supabase: SupabaseClient,
    documentId: string
  ): Promise<string> {
    if (!documentId) throw new Error('document id is required.');

    // Fetch the storage_path (RLS gates this — employees see own, HR sees institution).
    const { data: row, error: rowErr } = await supabase
      .from('hr_employee_documents')
      .select('storage_path')
      .eq('id', documentId)
      .maybeSingle();

    if (rowErr) {
      throw new Error(`Could not look up document: ${rowErr.message}`);
    }
    if (!row) {
      throw new Error('Document not found or access denied.');
    }

    const path = (row as { storage_path: string }).storage_path;
    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);

    if (error || !data?.signedUrl) {
      throw new Error(`Could not create signed URL: ${error?.message ?? 'unknown error'}`);
    }

    return data.signedUrl;
  }

  // =====================================================================================
  // Phase 2b — HR officer verification queue
  // =====================================================================================

  /**
   * List documents for the HR verification queue, filtered by status and
   * scoped by RLS (HR officers see within institution; super_admin sees all).
   *
   * Joins the staff record so the UI can show employee name + email +
   * designation alongside the document. We deliberately exclude rows that
   * have themselves been replaced (the latest upload per chain wins) so HR
   * doesn't waste time on superseded versions.
   *
   * Pagination is offset-based (page-size 50) — for v1 simplicity. If the
   * queue gets large enough to bog down, swap to keyset pagination later.
   */
  static async listForVerification(
    supabase: SupabaseClient,
    args: {
      institutionId?: string | null;
      status: EmployeeDocumentVerificationStatus | 'all';
      limit?: number;
      offset?: number;
    }
  ): Promise<EmployeeDocumentVerificationRow[]> {
    const { institutionId = null, status, limit = 50, offset = 0 } = args;

    let query = supabase
      .from('hr_employee_documents')
      .select(
        `
        id,
        staff_id,
        institution_id,
        document_code,
        document_name,
        storage_path,
        file_name,
        file_size_bytes,
        mime_type,
        verification_status,
        verification_notes,
        verified_by,
        verified_at,
        expires_at,
        replaces_document_id,
        uploaded_at,
        uploaded_by,
        staff:staff!hr_employee_documents_staff_id_fkey (
          id,
          first_name,
          last_name,
          email,
          designation
        )
        `
      )
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('verification_status', status);
    }
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list documents for verification: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as Array<
      Omit<EmployeeDocumentVerificationRow, 'employee'> & {
        staff: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          designation: string | null;
        } | null;
      }
    >;

    // Filter out rows that have been superseded by a newer upload. We do this
    // in JS rather than SQL because we'd otherwise need a NOT EXISTS subquery
    // against the same table, which the PostgREST builder doesn't expose
    // cleanly. The page sizes are small (≤50) so the overhead is negligible.
    const idsInPage = rows.map((r) => r.id);
    let supersededIds = new Set<string>();
    if (idsInPage.length > 0) {
      const { data: replaceRows } = await supabase
        .from('hr_employee_documents')
        .select('replaces_document_id')
        .in('replaces_document_id', idsInPage)
        .not('replaces_document_id', 'is', null);
      supersededIds = new Set(
        (replaceRows ?? [])
          .map((r: any) => r.replaces_document_id as string | null)
          .filter((v): v is string => !!v)
      );
    }

    return rows
      .filter((r) => !supersededIds.has(r.id))
      .map((r): EmployeeDocumentVerificationRow => {
        const staff = r.staff;
        return {
          ...r,
          staff: undefined,
          employee: staff
            ? {
                id: staff.id,
                first_name: staff.first_name,
                last_name: staff.last_name,
                email: staff.email,
                designation: staff.designation,
              }
            : null,
        };
      });
  }

  /**
   * HR officer verifies a document. Sets status='verified', verified_by,
   * verified_at. RLS enforces institution scope — caller does not need to
   * pass institution_id.
   *
   * Returns the canonical updated row so the caller can update its cache.
   */
  static async verifyDocument(
    supabase: SupabaseClient,
    args: { documentId: string; verifierProfileId: string }
  ): Promise<HREmployeeDocument> {
    const { documentId, verifierProfileId } = args;
    if (!documentId) throw new Error('documentId is required.');
    if (!verifierProfileId) throw new Error('verifierProfileId is required.');

    const { data, error } = await supabase
      .from('hr_employee_documents')
      .update({
        verification_status: 'verified' as const,
        verification_notes: null,
        verified_by: verifierProfileId,
        verified_at: new Date().toISOString(),
        updated_by: verifierProfileId,
      })
      .eq('id', documentId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Could not verify document: ${error.message}`);
    }
    return data as HREmployeeDocument;
  }

  /**
   * HR officer rejects a document. Notes are required (employee will see them).
   */
  static async rejectDocument(
    supabase: SupabaseClient,
    args: {
      documentId: string;
      verifierProfileId: string;
      notes: string;
    }
  ): Promise<HREmployeeDocument> {
    const { documentId, verifierProfileId, notes } = args;
    if (!documentId) throw new Error('documentId is required.');
    if (!verifierProfileId) throw new Error('verifierProfileId is required.');
    const trimmed = (notes ?? '').trim();
    if (trimmed.length === 0) {
      throw new Error('Rejection notes are required so the employee knows what to fix.');
    }

    const { data, error } = await supabase
      .from('hr_employee_documents')
      .update({
        verification_status: 'rejected' as const,
        verification_notes: trimmed,
        verified_by: verifierProfileId,
        verified_at: new Date().toISOString(),
        updated_by: verifierProfileId,
      })
      .eq('id', documentId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Could not reject document: ${error.message}`);
    }
    return data as HREmployeeDocument;
  }

  /**
   * Generate a signed URL given a known storage_path (skips the table lookup
   * that getSignedDownloadUrl does). Used by the verification page (already
   * has the path from the row) and by the cron (needs URLs in emails).
   *
   * RLS on storage.objects still gates whether the caller can actually fetch
   * the underlying object — the cron uses service-role client so this works.
   */
  static async signedUrlFor(
    supabase: SupabaseClient,
    storagePath: string,
    expiresInSec: number = SIGNED_URL_TTL_SEC
  ): Promise<string> {
    if (!storagePath) throw new Error('storagePath is required.');
    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(storagePath, expiresInSec);

    if (error || !data?.signedUrl) {
      throw new Error(`Could not create signed URL: ${error?.message ?? 'unknown error'}`);
    }
    return data.signedUrl;
  }
}

// =====================================================================================
// Helpers
// =====================================================================================

function mimeToExt(mime: EmployeeDocumentMimeType): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    default:
      return 'bin';
  }
}
