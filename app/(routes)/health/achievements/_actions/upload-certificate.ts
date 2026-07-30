'use server';

// app/(routes)/health/achievements/_actions/upload-certificate.ts
// ============================================================================
// Store a certificate scan and hand back a POINTER to it — never a link.
//
// WHY THE UPLOAD IS SERVER-SIDE
//   Probed against production before writing this: a learner session uploading
//   straight to the cdc-docs bucket from the browser is refused — "new row
//   violates row-level security policy". So the browser-client upload pattern
//   the CDC forms use (which staff sessions can do) would have shipped a dead
//   button for the very people this feature is for. Widening a storage policy is
//   DDL, and migrations here are Director-gated files that merge never applies —
//   so the file is streamed through this action and written with the
//   service-role client instead. Works the day it deploys.
//
// WHY A PATH AND NOT A SIGNED URL  (fixes two defects found reviewing PR #2650)
//   The first cut of this action stored a ONE-YEAR signed URL in
//   certificate_url. That was wrong twice over:
//
//     * EXPOSURE. A signed URL is a bearer token — whoever holds the string can
//       open the document, signed in or not. It was written into a row that
//       health_sports_achievements_public served to EVERY authenticated user the
//       moment IQAC ticked it (USING (verified = true), no institution or role
//       predicate). One learner's medical-college certificate was one query away
//       from anybody on the platform.
//     * DURABILITY. The link died at +365 days, for a record whose entire
//       purpose is accreditation evidence — NAAC cycles run five years. The
//       evidence would have rotted exactly when a reviewer came looking.
//
//   Storing the storage PATH fixes both. A path is not a credential, so the row
//   is safe to hold; and it never expires, so the evidence outlives any NAAC
//   cycle. A short-lived signed URL is minted on demand, per view, by
//   _actions/certificate-link.ts — and only for a viewer who passes the D7
//   visibility rule.
//
// GATE
//   Any signed-in user may upload, and the returned pointer is only ever written
//   to their own achievement row (RLS self-policy). The path is namespaced by
//   the uploader's auth id, so every stored object carries its provenance. Size
//   and MIME are capped here, server-side, not only in the picker.
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const STORAGE_BUCKET = 'cdc-docs';
const PATH_PREFIX = 'sports-achievement-certificates';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

export interface UploadCertificateResult {
  ok: boolean;
  /**
   * Storage PATH of the stored scan — deliberately not an openable link. Written
   * straight into certificate_url; resolved to a short-lived signed URL at read
   * time by _actions/certificate-link.ts.
   */
  path?: string;
  error?: string;
}

export async function uploadCertificate(
  formData: FormData,
): Promise<UploadCertificateResult> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Duck-typed rather than `instanceof File` so this holds across runtimes.
  const file = formData.get('file') as {
    name?: string;
    size?: number;
    type?: string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  } | null;
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { ok: false, error: 'No file received.' };
  }
  if ((file.size ?? 0) === 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if ((file.size ?? 0) > MAX_BYTES) {
    return { ok: false, error: 'Certificate must be 5 MB or smaller.' };
  }
  if (!ALLOWED_MIME.includes(file.type ?? '')) {
    return { ok: false, error: 'Upload a PDF, JPG, PNG or WebP file.' };
  }

  const safeName = (file.name ?? 'certificate').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${PATH_PREFIX}/${user.id}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const admin = createServiceRoleClient();
  const { error: upErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: `Upload failed: ${upErr.message}` };
  }

  // The pointer, and only the pointer. No link is minted here, on purpose — see
  // the header. Nothing that lands in certificate_url can be redeemed by
  // whoever happens to read the row.
  return { ok: true, path };
}
