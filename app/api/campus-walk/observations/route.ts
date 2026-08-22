// app/api/campus-walk/observations/route.ts
// ============================================================================
// Campus Walk intake — turn a photographed campus condition into a routed
// project_tasks row. Spec: lib/services/campus-walk/campus-walk-service.ts
// (specs/campus-walk-2026-08-17.md was referenced but is not present in this
// worktree at the time of writing — the service file's own header carries the
// same 13-decision/5-guardrail summary and is the canonical source used here).
//
// POST — permission-gate (D2, Director-only for v1) BEFORE touching any bytes,
// then per photo (1-3, first is primary): sniff -> strip EXIF -> sha256 ->
// service-role upload to the private `campus-walk` bucket -> createWalkTask().
//
// WHY THIS ROUTE DOES NOT LITERALLY CALL compressImage() / stripImageMetadata()
// Both lib/utils/compress-image.ts and lib/services/pde/strip-image-metadata.ts
// are canvas re-encoders that call `createImageBitmap` and
// `document.createElement('canvas')` — browser-only APIs. Neither is reachable
// from a Next.js Node route (no `document`, no DOM canvas polyfill in this
// repo's dependency tree — confirmed no `sharp`/`jimp`/`@napi-rs/canvas`
// installed). Their only existing call sites are client components
// (lib/services/moments/moments-service.ts, CaseFormBuilder.tsx). Shipping
// code that calls them here would throw `ReferenceError: document is not
// defined` on the very first real request.
//
// This codebase already has the Node-safe half of exactly this problem, used
// today for the same threat model (identifiable people/places in institutional
// photos): lib/services/pde/jpeg-metadata.ts, the server-side re-verification
// layer behind app/api/pde/cases/upload-image. That route's own header states
// the browser step is "a convenience, NOT the security boundary" — the
// re-verify-and-fail-closed step is. This route reuses that exact mechanism as
// guardrail G4's enforcement point:
//   1. sniff magic bytes (never trust declared content-type)
//   2. stripJpegMetadata()      — rewrite the container, drop every
//                                  metadata-bearing segment
//   3. scanJpegForMetadata()    — FAIL CLOSED if the strip didn't work
// Because compressImage() always re-encodes to JPEG client-side (quality 0.8,
// canvas.toBlob('image/jpeg', ...)), a JPEG-only expectation at this layer
// matches the intended client pipeline rather than fighting it. Anything that
// doesn't sniff as JPEG is rejected with a clear "retake" message rather than
// silently accepted un-stripped.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { isJpegMagic, stripJpegMetadata, scanJpegForMetadata } from '@/lib/services/pde/jpeg-metadata';
import {
  createWalkTask,
  type CreateWalkTaskInput,
  type WalkKind,
} from '@/lib/services/campus-walk/campus-walk-service';

const BUCKET = 'campus-walk';
const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit (10 MB)
const MIN_BYTES = 1024; // below this it is not a real photograph
const MAX_PHOTOS = 3; // locked at 3 (spec): enough for context, not an album

const ALLOWED_KINDS = new Set<WalkKind>(['symptom', 'system_gap']);

/**
 * The service (lib/services/campus-walk/campus-walk-service.ts) is being
 * extended IN PARALLEL, additively, to accept a `photos` array (1-3, first
 * primary) alongside its existing singular `photoStoragePath` fields. This
 * route is written against that fixed contract now. Until the extension
 * lands, `createWalkTask` simply ignores the extra `photos` key on the object
 * below and falls back to the legacy singular fields — which this route also
 * populates, from the primary photo — so capture works today AND the moment
 * the extension ships, nothing here needs to change.
 */
type WalkTaskInputWithPhotos = CreateWalkTaskInput & {
  photos?: Array<{ storagePath: string; mimeType?: string; sizeBytes?: number }>;
};

interface UploadedPhoto {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

interface PhotoIssue {
  index: number;
  fileName: string;
  error: string;
}

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function parseIdArray(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Geolocation comes ONLY from this explicit client-supplied field — never read
 * back out of EXIF, which the pipeline below strips on purpose (G4). Malformed
 * or missing geo does not fail the request; it just proceeds without it.
 */
function parseGeo(raw: FormDataEntryValue | null): { lat: number; lng: number; accuracy?: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw)) as { lat?: unknown; lng?: unknown; accuracy?: unknown };
    const lat = Number(parsed?.lat);
    const lng = Number(parsed?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const accuracyNum = Number(parsed?.accuracy);
    if (Number.isFinite(accuracyNum) && accuracyNum >= 0) {
      return { lat, lng, accuracy: accuracyNum };
    }
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('Not signed in.', 401);
  }

  // ── D2 gate — Director-only for v1, BEFORE any bytes are read ─────────────
  // project_* RLS is `auth.uid() IS NOT NULL` for read AND write (migration
  // 20260528000000, lines 842/847-848), so ANY authenticated user could read
  // or write ANY task at the database layer. The database does not, and will
  // not, enforce D2 — this email comparison is the only gate. It runs before
  // request.formData() is even called, so a non-Director caller's photo is
  // never parsed or buffered, matching "permission gate before reading bytes".
  const callerEmail = (user.email ?? '').toLowerCase();
  if (!(await isCampusWalkReporter(callerEmail))) {
    return fail(
      'Campus Walk is Director-only in this release — ask the Director to file this observation.',
      403,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data.', 400);
  }

  // ── Required fields ─────────────────────────────────────────────────────
  const title = String(form.get('title') ?? '').trim().slice(0, 300);
  if (!title) {
    return fail('title is required.', 400);
  }

  const kindRaw = String(form.get('kind') ?? '').trim();
  if (!ALLOWED_KINDS.has(kindRaw as WalkKind)) {
    return fail('kind must be "symptom" or "system_gap".', 400);
  }
  const kind = kindRaw as WalkKind;

  // ── Optional fields ─────────────────────────────────────────────────────
  const description = String(form.get('description') ?? '').trim();
  const isUnsafe = ['true', '1', 'on'].includes(String(form.get('isUnsafe') ?? '').trim().toLowerCase());

  const categoryRaw = form.get('category');
  const category = categoryRaw ? String(categoryRaw).trim().slice(0, 120) || null : null;

  // G3 — "what is blocking you?". The capture screen makes this mandatory before
  // it will let an observation be queued, so dropping it here would quietly gut
  // the guardrail: it is the field that keeps a walk pointed at the systemic
  // cause rather than at whoever happens to be standing next to the problem.
  const blockerRaw = form.get('blocker');
  const blocker = blockerRaw ? String(blockerRaw).trim().slice(0, 1000) || null : null;

  const accountableRaw = form.get('accountableProfileId');
  const accountableProfileId = accountableRaw ? String(accountableRaw).trim() || null : null;

  const consultedProfileIds = parseIdArray(form.get('consultedProfileIds'));

  const institutionRaw = form.get('institutionId');
  const institutionId = institutionRaw ? String(institutionRaw).trim() || null : null;

  const geo = parseGeo(form.get('geo'));

  // ── Photos: 1-3, first is primary ───────────────────────────────────────
  const rawPhotos = form.getAll('photos').filter((v): v is File => v instanceof File);
  if (rawPhotos.length === 0) {
    return fail('At least one photo is required — Campus Walk starts from what you photographed.', 400);
  }
  if (rawPhotos.length > MAX_PHOTOS) {
    return fail(`Up to ${MAX_PHOTOS} photos per observation.`, 400);
  }

  const admin = createServiceRoleClient();
  const uploaded: UploadedPhoto[] = [];
  const photoIssues: PhotoIssue[] = [];
  const month = new Date().toISOString().slice(0, 7);

  for (let i = 0; i < rawPhotos.length; i++) {
    const file = rawPhotos[i];
    const label = file.name || `photo-${i + 1}`;

    if (file.size > MAX_BYTES) {
      photoIssues.push({ index: i, fileName: label, error: `${(file.size / 1048576).toFixed(1)} MB exceeds the 10 MB limit.` });
      continue;
    }
    if (file.size < MIN_BYTES) {
      photoIssues.push({ index: i, fileName: label, error: 'Too small to be a real photo.' });
      continue;
    }

    const buf = new Uint8Array(await file.arrayBuffer());

    // Sniff the bytes rather than trusting the declared content type.
    if (!isJpegMagic(buf)) {
      photoIssues.push({ index: i, fileName: label, error: 'Not a JPEG — retake or re-select the photo.' });
      continue;
    }

    // G4: strip every metadata-bearing segment (EXIF/GPS/IPTC/XMP/ICC), then
    // fail closed if the rewrite didn't actually produce a clean file.
    const cleaned = stripJpegMetadata(buf);
    if (!cleaned) {
      photoIssues.push({ index: i, fileName: label, error: 'Could not be read as a valid JPEG.' });
      continue;
    }
    const scan = scanJpegForMetadata(cleaned);
    if (!scan.ok) {
      photoIssues.push({ index: i, fileName: label, error: 'Could not be cleaned of embedded camera/location data — not saved.' });
      continue;
    }

    // Content-addressed path: a re-upload of identical (cleaned) bytes
    // overwrites itself rather than littering the bucket.
    const sha256 = createHash('sha256').update(cleaned).digest('hex');
    const storagePath = `${user.id}/${month}/${sha256}.jpg`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, cleaned, { contentType: 'image/jpeg', upsert: true });

    if (upErr) {
      console.error('[campus-walk] upload failed:', upErr.message);
      photoIssues.push({ index: i, fileName: label, error: 'Could not be saved to storage.' });
      continue;
    }

    uploaded.push({ storagePath, mimeType: 'image/jpeg', sizeBytes: cleaned.byteLength });
  }

  if (uploaded.length === 0) {
    // Nothing was captured at all — this is a real failure, not a fail-soft
    // partial success, because there is no observation to route.
    return fail('None of the photos could be saved. Please retake and try again.', 502, { photoIssues });
  }

  const primary = uploaded[0];

  const input: WalkTaskInputWithPhotos = {
    title,
    description,
    kind,
    isUnsafe,
    photoStoragePath: primary.storagePath,
    photoMimeType: primary.mimeType,
    photoSizeBytes: primary.sizeBytes,
    photos: uploaded,
    category: category ?? undefined,
    blocker: blocker ?? undefined,
    accountableProfileId,
    consultedProfileIds,
    geo,
    institutionId,
    // Stored for audit only — D10 presents the ticket as "Management walk",
    // never this id.
    raisedByProfileId: user.id,
  };

  // Session client, not service-role: project_* RLS already permits any
  // authenticated write (see D2 note above), so there is nothing to bypass
  // here, and using the session client keeps this insert attributable to the
  // caller rather than laundered through the service role. Service-role is
  // reserved for the storage upload above, which genuinely needs it (the
  // `campus-walk` bucket has no client-facing storage policy at all).
  let result: Awaited<ReturnType<typeof createWalkTask>> = null;
  try {
    result = await createWalkTask(supabase, input);
  } catch (e: unknown) {
    // Belt-and-braces: createWalkTask already catches internally and returns
    // null, but nothing here may throw and lose an already-stored photo.
    console.error('[campus-walk] createWalkTask threw unexpectedly:', e instanceof Error ? e.message : e);
    result = null;
  }

  if (!result) {
    // Fail soft (per spec): the photo(s) are already durably in storage. Losing
    // the routing must not lose the observation, and must not read as a
    // generic error to a Director standing in a corridor.
    return NextResponse.json(
      {
        success: true,
        routed: false,
        taskId: null,
        attachmentId: null,
        photos: uploaded,
        photoIssues,
        message:
          'Photo saved. Routing could not complete automatically — this observation was not filed as a task yet.',
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      routed: true,
      taskId: result.taskId,
      attachmentId: result.attachmentId,
      photos: uploaded,
      photoIssues,
    },
    { status: 200 },
  );
}
