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
import {
  DUPLICATE_RECENCY_WINDOW_MS,
  extractSha256FromStoragePath,
  findLikelyDuplicate,
  type RecentLaneTaskPhoto,
} from '@/lib/campus-walk/duplicates';
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
  /**
   * Defect-2 fix: true ONLY for a storage/infrastructure failure (the
   * `admin.storage.upload()` call itself errored — e.g. the private
   * `campus-walk` bucket does not exist yet on a fresh deploy, or Storage is
   * unreachable). Retrying the identical bytes could succeed once the
   * infrastructure recovers. False for a genuine content rejection (wrong
   * size, not a JPEG, corrupt, or could not be cleaned of metadata) — those
   * exact bytes fail the same way on every retry, so retrying can never
   * help. This flag is what decides, below, whether an all-photos-failed
   * batch answers with a retryable status or a terminal one.
   */
  retryable: boolean;
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
  // The offline queue sets this on any item revived after a force-close killed
  // it mid-upload (lib/campus-walk/offline-queue.ts). Informational: it does
  // NOT gate the duplicate check — the sha256 match is the signal — but it
  // separates two very different situations that otherwise look identical:
  // a crash-retry of one observation, versus the Director deliberately
  // photographing the same thing twice.
  const retryAfterCrash =
    String(form.get('retryAfterCrash') ?? '').trim().toLowerCase() === 'true';

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
      photoIssues.push({ index: i, fileName: label, error: `${(file.size / 1048576).toFixed(1)} MB exceeds the 10 MB limit.`, retryable: false });
      continue;
    }
    if (file.size < MIN_BYTES) {
      photoIssues.push({ index: i, fileName: label, error: 'Too small to be a real photo.', retryable: false });
      continue;
    }

    const buf = new Uint8Array(await file.arrayBuffer());

    // Sniff the bytes rather than trusting the declared content type.
    if (!isJpegMagic(buf)) {
      photoIssues.push({ index: i, fileName: label, error: 'Not a JPEG — retake or re-select the photo.', retryable: false });
      continue;
    }

    // G4: strip every metadata-bearing segment (EXIF/GPS/IPTC/XMP/ICC), then
    // fail closed if the rewrite didn't actually produce a clean file.
    const cleaned = stripJpegMetadata(buf);
    if (!cleaned) {
      photoIssues.push({ index: i, fileName: label, error: 'Could not be read as a valid JPEG.', retryable: false });
      continue;
    }
    const scan = scanJpegForMetadata(cleaned);
    if (!scan.ok) {
      photoIssues.push({ index: i, fileName: label, error: 'Could not be cleaned of embedded camera/location data — not saved.', retryable: false });
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
      // Infrastructure failure, not a content problem — e.g. the private
      // `campus-walk` bucket does not exist yet on a fresh deploy, or
      // Storage is transiently unreachable. The exact same cleaned bytes
      // could upload successfully on a later attempt, so this is marked
      // retryable (Defect-2 fix) — it must NOT be lumped in with a genuine
      // photo rejection below, which never retries.
      console.error('[campus-walk] upload failed:', upErr.message);
      photoIssues.push({ index: i, fileName: label, error: 'Could not be saved to storage.', retryable: true });
      continue;
    }

    uploaded.push({ storagePath, mimeType: 'image/jpeg', sizeBytes: cleaned.byteLength });
  }

  if (uploaded.length === 0) {
    // Nothing was captured at all — this is a real failure, not a fail-soft
    // partial success, because there is no observation to route.
    //
    // Defect-2 fix: this used to always answer 502, which the offline queue
    // (lib/campus-walk/offline-queue.ts) treated as terminal — "every photo
    // failed validation, retrying is pointless." That was true for a genuine
    // content rejection, but this branch is also reached when EVERY photo
    // failed because the storage upload itself errored (see `retryable:
    // true` above) — on a fresh deploy before the `campus-walk` bucket
    // exists, that meant every queued observation was permanently discarded
    // instead of recovering once the bucket was created. Split by whether
    // ANY failure in this batch was infrastructure, not content:
    //   - at least one retryable (infra) failure -> retryable status. The
    //     identical bytes can still succeed once storage recovers, so the
    //     queue must keep retrying, never discard.
    //   - every failure is a genuine content rejection -> a real client
    //     error. Retrying the same bytes produces the same rejection every
    //     time (the existing "a real rejection must not retry forever"
    //     rule), so this one stays non-retryable.
    const anyInfraFailure = photoIssues.some((issue) => issue.retryable);
    if (anyInfraFailure) {
      return fail(
        'Could not save to storage right now — this will be retried automatically.',
        503,
        { photoIssues },
      );
    }
    return fail('None of the photos could be saved. Please retake and try again.', 422, { photoIssues });
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

  // Defect-3 fix: service-role client, not the session client.
  // createWalkTask() does far more than the project_tasks insert — it reads
  // `profiles` (to resolve the EAO by role), `staff` (profile_id -> staff.id,
  // twice over), `departments` (head_of_department_id, for leave
  // reassignment) and `hr_leave_applications`, and writes bell notifications
  // via createBellNotification(). Every one of those reads is governed by
  // the CALLER's own row-level permissions when passed the session client —
  // project_tasks itself is open to any authenticated write (D2 note above),
  // but profiles/staff/departments/hr_leave_applications are not, and there
  // is no guarantee a future reporter (isCampusWalkReporter() reads a
  // platform_policies row, deliberately changeable without a deploy — see
  // lib/campus-walk/reporters.ts) can see the rows this routing logic needs.
  // Today it only worked because the one permitted reporter happens to be a
  // super admin; the moment the allowed-reporters list widens, routing would
  // silently resolve fewer people (EAO fallback, department heads,
  // notification recipients) and tickets would land unowned, with no error
  // to show for it.
  //
  // Using `admin` here (the same service-role client already used for the
  // storage upload above) makes that internal resolution and every
  // notification write independent of the caller's own permissions. This
  // does NOT widen who may post: the D2 gate at the top of this route
  // (isCampusWalkReporter(callerEmail), the sole authority on who may reach
  // this point) is untouched and still runs on the session client before a
  // single byte is read. `raisedByProfileId: user.id` above still carries
  // the caller's own profile id through to `input`, so the task is still
  // attributed to whoever actually filed it (stored in metadata for audit) —
  // campus-walk-service.ts's own D10 rule keeps presenting every ticket as
  // "Management walk", never a personal name, and that is unaffected by
  // which client performs the write.
  let result: Awaited<ReturnType<typeof createWalkTask>> = null;
  try {
    result = await createWalkTask(admin, input);
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
    //
    // Defect-1 fix: this used to answer `{ success: true, routed: false,
    // ... }` — a plain-success envelope with the failure buried one field
    // deep. The offline queue (lib/campus-walk/offline-queue.ts) reads only
    // `success`/`error` as load-bearing and treated that as a normal
    // delivery: it deleted the queued item's photo bytes and marked it
    // 'done'. Net effect: the Director was told the observation was filed,
    // the photo sat orphaned in storage, and no ticket existed — with
    // nothing left in the queue to show for it.
    //
    // `success: false` here is deliberate, not an oversight: this response
    // must never satisfy the queue's `success !== false` "delivered" check.
    // `outcome: 'stored_unrouted'` is the machine-readable discriminator the
    // queue now checks for explicitly (ahead of any status-code handling),
    // so this exact case is classified correctly regardless of which HTTP
    // status it happens to carry. Status 207 (Multi-Status) is used because
    // that is literally what happened — the photo upload succeeded, the
    // task-creation step did not — but the body's `outcome` field, not the
    // status code, is the actual contract.
    return NextResponse.json(
      {
        success: false,
        outcome: 'stored_unrouted',
        routed: false,
        taskId: null,
        attachmentId: null,
        photos: uploaded,
        photoIssues,
        error:
          'Photo saved. Ticket NOT created — routing could not complete automatically.',
      },
      { status: 207 },
    );
  }

  // ── Likely-duplicate flag (Director ruling, 2026-08-21) ───────────────────
  // The offline queue retries an upload interrupted mid-flight, because it
  // cannot tell whether the server received the first attempt. That retry is
  // deliberate — losing an observation is worse than an extra ticket — but it
  // can file the same problem twice, and a fixer sent to the same broken tap
  // twice stops trusting the tickets.
  //
  // So: flag, never drop. Photos are stored at content-addressed sha256 paths,
  // so a re-send of the same bytes lands on an identical path — that is the
  // signal. Wholly best-effort: this runs AFTER the task exists, and any
  // failure here leaves a correctly-filed observation untouched.
  let duplicateOf: string | null = null;
  try {
    const since = new Date(Date.now() - DUPLICATE_RECENCY_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from('project_tasks')
      .select('id, created_at, metadata')
      .eq('metadata->>source', 'campus-walk')
      .gte('created_at', since)
      .neq('id', result.taskId)
      .limit(50);

    const recentLaneTasks: RecentLaneTaskPhoto[] = (recent ?? [])
      .map((r) => {
        const md = (r.metadata ?? {}) as Record<string, unknown>;
        const path = typeof md.photo_storage_path === 'string' ? md.photo_storage_path : null;
        const hash = path ? extractSha256FromStoragePath(path) : null;
        return {
          taskId: r.id as string,
          createdAt: r.created_at as string,
          photoHashes: hash ? [hash] : [],
        };
      })
      .filter((t) => t.photoHashes.length > 0);

    const candidatePhotoHashes = uploaded
      .map((u) => extractSha256FromStoragePath(u.storagePath))
      .filter((h): h is string => Boolean(h));

    const verdict = findLikelyDuplicate({ candidatePhotoHashes, recentLaneTasks });
    if (verdict.isLikelyDuplicate && verdict.matchedTaskId) {
      duplicateOf = verdict.matchedTaskId;
      // Record it on the task so the queue and any later review can see it.
      // Not fatal if it fails — the response still carries the flag.
      const { data: fresh } = await supabase
        .from('project_tasks')
        .select('metadata')
        .eq('id', result.taskId)
        .maybeSingle();
      const md = ((fresh?.metadata ?? {}) as Record<string, unknown>);
      await supabase
        .from('project_tasks')
        .update({
          metadata: {
            ...md,
            possible_duplicate_of: verdict.matchedTaskId,
            possible_duplicate_detected_at: new Date().toISOString(),
            possible_duplicate_age_ms: verdict.ageMs,
            // true => almost certainly one observation sent twice by the retry
            // pump. false => the same photo arrived twice without a crash,
            // which is a deliberate re-send and worth a closer look.
            possible_duplicate_after_crash: retryAfterCrash,
          },
        })
        .eq('id', result.taskId);
    }
  } catch (e: unknown) {
    console.warn(
      '[campus-walk] duplicate check skipped:',
      e instanceof Error ? e.message : e,
    );
  }

  // ── D6 urgent lane — did a phone actually ring? ───────────────────────────
  // Present only for an observation marked unsafe. This is deliberately part
  // of a `success: true` body and NOT a failure: the ticket exists, the photo
  // is stored, and the ordinary lane worked. What it carries is the one thing
  // the observer cannot otherwise know while still standing at the hazard —
  // whether anybody was actually paged about it. The capture screen shows it
  // in the queue when nothing was delivered, so "nobody was told" can never be
  // mistaken for "told". Null when the observation was not marked unsafe.
  const urgentAlert = result.urgentAlert
    ? {
        delivered: result.urgentAlert.delivered,
        usedFallback: result.urgentAlert.usedFallback,
        failureReason: result.urgentAlert.failureReason,
      }
    : null;

  return NextResponse.json(
    {
      success: true,
      routed: true,
      taskId: result.taskId,
      attachmentId: result.attachmentId,
      photos: uploaded,
      photoIssues,
      // The client surfaces this as a dismissible "looks like the one you just
      // sent" in the queue. It never discards anything on its own.
      possibleDuplicateOf: duplicateOf,
      urgentAlert,
    },
    { status: 200 },
  );
}
