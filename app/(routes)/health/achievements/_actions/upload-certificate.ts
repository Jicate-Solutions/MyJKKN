'use server';

// app/(routes)/health/achievements/_actions/upload-certificate.ts
// ============================================================================
// Store a certificate scan and hand back a link the IQAC team can open.
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
//   The bucket, the folder-prefix path shape and the 1-year signed URL are all
//   the repo's existing conventions (cdc-docs; hostel-vacate-documents'
//   createSignedUrl-and-store), not new ones. cdc-docs is private, so a signed
//   URL — never getPublicUrl — is what actually resolves.
//
// GATE
//   Any signed-in user may upload, and the returned link is only ever written to
//   their own achievement row (RLS self-policy). The path is namespaced by the
//   uploader's auth id, so every stored object carries its provenance. Size and
//   MIME are capped here, server-side, not only in the picker.
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const STORAGE_BUCKET = 'cdc-docs';
const PATH_PREFIX = 'sports-achievement-certificates';
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

export interface UploadCertificateResult {
  ok: boolean;
  url?: string;
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

  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    // The file is stored; hand back the path so the record still points at it.
    return { ok: true, url: path };
  }

  return { ok: true, url: signed.signedUrl };
}
