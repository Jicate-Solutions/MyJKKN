// app/api/instasolver/broken/route.ts
// ============================================================================
// InstaSolver — "something is broken" intake, open to EVERY signed-in user.
//
// Decision I4 (Director, 2026-09-14, specs/instasolver-2026-09-14.md):
// a broken thing reported by anyone with a login becomes a `project_tasks`
// row under the standing CAMPUS-OPS project, via the SAME engine Campus Walk
// uses — `createWalkTask`. InstaSolver is the front door; Campus Walk is the
// engine behind it.
//
// WHY NOT grievance_tickets (guardrail G1, and the reason this route exists
// at all): nothing that counts grievance_tickets filters by type. One counter
// is an HOD's resolution percentage (20260722200000) and another is the
// NAAC/UGC export behind app/api/b2a/grievance/dashboard. A broken ceiling
// fan filed there would dent a department head's rating and inflate an
// accreditation return. The unapplied 20261103000000_instasolver_substrate
// migration would have done exactly that with an `issue_type` tag; verified
// 2026-09-14, nothing reads that column.
//
// HOW THIS DIFFERS FROM app/api/campus-walk/observations:
//   - Audience. That route is Director-only (D2, `isCampusWalkReporter`).
//     This one is any signed-in user with an active profile. The D2 gate is
//     deliberately NOT reused here — it stays on the photo route.
//   - The photo is OPTIONAL here. Someone reporting a broken fan from a
//     corridor may have nothing usable to attach, and losing the report over
//     a missing image is the worse outcome.
//   - A per-user rate limit stands in for the D2 gate as the abuse control.
// Everything the two DO share — the JPEG pipeline, the private bucket, the
// service-role write, the 422-vs-503 split, the 207 `stored_unrouted`
// envelope — is imported from the same modules, never re-implemented.
//
// THE JPEG PIPELINE IS IMPORTED, NOT COPIED. isJpegMagic -> stripJpegMetadata
// -> scanJpegForMetadata (lib/services/pde/jpeg-metadata.ts) is the same
// Node-safe strip-and-fail-closed sequence the observations route documents at
// length: sniff the bytes rather than trusting the declared content type,
// rewrite the container to drop every metadata-bearing segment, then fail
// CLOSED if the rewrite did not actually produce a clean file. It is guardrail
// G4's enforcement point and it applies identically to a learner's photo.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  isJpegMagic,
  stripJpegMetadata,
  scanJpegForMetadata,
} from '@/lib/services/pde/jpeg-metadata';
import {
  createWalkTask,
  type CreateWalkTaskInput,
} from '@/lib/services/campus-walk/campus-walk-service';

const BUCKET = 'campus-walk';
const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit (10 MB)
const MIN_BYTES = 1024; // below this it is not a real photograph

const LOCATION_MIN = 3;
const LOCATION_MAX = 120;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 500;

/**
 * Abuse control. The Director-only D2 gate is what keeps the Campus Walk
 * photo route from being flooded; this route has no such gate by design (I1 —
 * "everyone with a login"), so the ceiling does that job instead. Counted on
 * the rows this route itself creates, over a rolling 24h window rather than a
 * calendar day, so it cannot be reset by waiting for midnight.
 */
const DAILY_REPORT_LIMIT = 10;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Rule #27 — every refusal is explicit JSON, never a silent success. */
function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

/**
 * Location comes ONLY from these explicit client-supplied fields — never read
 * back out of EXIF, which the pipeline above strips on purpose (G4). A
 * malformed or absent coordinate does not fail the report; it just proceeds
 * without one, because the typed "Where is it?" line is the load-bearing
 * answer and the coordinate is a convenience on top of it.
 */
function parseLatLng(
  latRaw: FormDataEntryValue | null,
  lngRaw: FormDataEntryValue | null
): { lat: number; lng: number } | null {
  if (latRaw === null || lngRaw === null) return null;
  const lat = Number(String(latRaw).trim());
  const lng = Number(String(lngRaw).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail('You need to be signed in to report something broken.', 401);
  }

  // ── Any signed-in user WITH AN ACTIVE PROFILE (I1) ────────────────────────
  // The profile is not a formality: `institution_id` and `role` are recorded
  // on the task so the fix lane can tell which college a report came from,
  // and an auth user with no profile row would otherwise file ownerless,
  // unattributable tickets. Checked before any bytes are read.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[instasolver] profile lookup failed:', profileError.message);
    return fail('Could not check your account just now. Please try again.', 503);
  }
  if (!profile) {
    return fail(
      'Your account has no profile on MyJKKN yet, so a report cannot be filed against it. Contact the office to have your profile set up.',
      403
    );
  }
  if (profile.is_active === false) {
    return fail(
      'Your account is not active, so it cannot file reports. Contact the office if this is wrong.',
      403
    );
  }

  // ── Rate limit, before any bytes are read ─────────────────────────────────
  // Counted with the service-role client: `project_tasks` is readable by any
  // authenticated user today (migration 20260528000000), but that is exactly
  // the kind of open policy that gets tightened later, and a rate limit that
  // silently counts zero is a rate limit that does not exist.
  const admin = createServiceRoleClient();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount, error: countError } = await admin
    .from('project_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>source', 'instasolver')
    .eq('metadata->>reporter_id', user.id)
    .gte('created_at', since);

  if (countError) {
    // Fail OPEN, loudly logged. A counting outage must not swallow a report
    // about an exposed wire; the ceiling exists to stop flooding, not to be
    // the thing that loses a hazard.
    console.error(
      '[instasolver] rate-limit count failed, allowing the report through:',
      countError.message
    );
  } else if ((recentCount ?? 0) >= DAILY_REPORT_LIMIT) {
    return fail(
      `You've reported ${DAILY_REPORT_LIMIT} things today — thank you. More opens tomorrow.`,
      429
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data.', 400);
  }

  // ── Required fields ───────────────────────────────────────────────────────
  const location = String(form.get('location') ?? '').trim();
  if (location.length < LOCATION_MIN || location.length > LOCATION_MAX) {
    return fail(
      `Tell us where it is — between ${LOCATION_MIN} and ${LOCATION_MAX} characters.`,
      400
    );
  }

  const description = String(form.get('description') ?? '').trim();
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return fail(
      `Tell us what is wrong — between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`,
      400
    );
  }

  // ── Optional fields ───────────────────────────────────────────────────────
  // "This is dangerous" maps to the service's `isUnsafe`, which is what puts
  // the task in D6's urgent lane: due the SAME day (DUE_IN_DAYS.unsafe = 0)
  // and a phone paged straight away. An ordinary report is a `symptom` — one
  // action, 2 days. `system_gap` is deliberately never produced here: that
  // kind is for an audit finding ("there is no cleaning SOP"), which is not
  // what this form asks for.
  const dangerous = ['true', '1', 'on', 'yes'].includes(
    String(form.get('dangerous') ?? '').trim().toLowerCase()
  );

  const geo = parseLatLng(form.get('lat'), form.get('lng'));

  // ── Optional single photo ─────────────────────────────────────────────────
  const rawPhoto = form.get('photo');
  const photoFile = rawPhoto instanceof File && rawPhoto.size > 0 ? rawPhoto : null;

  let uploaded: { storagePath: string; mimeType: string; sizeBytes: number } | null = null;

  if (photoFile) {
    if (photoFile.size > MAX_BYTES) {
      return fail(
        `That photo is ${(photoFile.size / 1048576).toFixed(1)} MB — the limit is 10 MB. Send it without the photo, or take a smaller one.`,
        422
      );
    }
    if (photoFile.size < MIN_BYTES) {
      return fail('That file is too small to be a real photo. Try taking it again.', 422);
    }

    const buf = new Uint8Array(await photoFile.arrayBuffer());

    // Sniff the bytes rather than trusting the declared content type.
    if (!isJpegMagic(buf)) {
      return fail('That photo is not a JPEG. Take it again with the camera, or send without it.', 422);
    }

    // G4: strip every metadata-bearing segment (EXIF/GPS/IPTC/XMP/ICC), then
    // fail closed if the rewrite did not actually produce a clean file.
    const cleaned = stripJpegMetadata(buf);
    if (!cleaned) {
      return fail('That photo could not be read. Take it again, or send without it.', 422);
    }
    const scan = scanJpegForMetadata(cleaned);
    if (!scan.ok) {
      return fail(
        'That photo still had camera or location data embedded and could not be cleaned, so it was not saved. Take it again, or send without it.',
        422
      );
    }

    // Content-addressed path: a re-upload of identical (cleaned) bytes
    // overwrites itself rather than littering the bucket.
    const sha256 = createHash('sha256').update(cleaned).digest('hex');
    const month = new Date().toISOString().slice(0, 7);
    const storagePath = `${user.id}/${month}/${sha256}.jpg`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, cleaned, { contentType: 'image/jpeg', upsert: true });

    if (upErr) {
      // Infrastructure, not content — the same bytes could succeed later.
      // 503, matching the observations route's retryable split, rather than
      // the 422 a genuine photo rejection gets above.
      console.error('[instasolver] upload failed:', upErr.message);
      return fail(
        'Could not save the photo right now. Please try again in a moment, or send the report without it.',
        503
      );
    }

    uploaded = { storagePath, mimeType: 'image/jpeg', sizeBytes: cleaned.byteLength };
  }

  // A task title has to read as one line in the fix lane's list. Location
  // first, because that is what a fixer scans for; the full text still lands
  // in `description` untouched.
  const titleLine = `${location} — ${description}`;
  const title = titleLine.length > 160 ? `${titleLine.slice(0, 157).trimEnd()}...` : titleLine;

  const input: CreateWalkTaskInput = {
    title,
    description,
    kind: 'symptom',
    isUnsafe: dangerous,
    ...(uploaded
      ? {
          photoStoragePath: uploaded.storagePath,
          photoMimeType: uploaded.mimeType,
          photoSizeBytes: uploaded.sizeBytes,
          photos: [uploaded],
        }
      : {}),
    geo,
    institutionId: profile.institution_id ?? null,
    raisedByProfileId: user.id,
    source: 'instasolver',
    extraMetadata: {
      source: 'instasolver',
      reporter_id: user.id,
      reporter_role: profile.role ?? null,
      reporter_institution_id: profile.institution_id ?? null,
      location,
    },
  };

  // Service-role client, for the same reason the observations route uses one
  // (its "Defect-3" note): createWalkTask reads `profiles`, `staff`,
  // `departments` and `hr_leave_applications` to resolve the EAO, the
  // department head and any leave reassignment, and writes bell
  // notifications. Under the caller's own session those reads are governed by
  // the caller's permissions — and this route's callers are learners and
  // parents, who can see almost none of it. Routing would silently resolve
  // nobody and every report would land unowned, with no error to show for it.
  // Who may POST is decided by the profile check at the top of this route,
  // not by which client performs the write.
  let result: Awaited<ReturnType<typeof createWalkTask>> = null;
  try {
    result = await createWalkTask(admin, input);
  } catch (e: unknown) {
    console.error(
      '[instasolver] createWalkTask threw unexpectedly:',
      e instanceof Error ? e.message : e
    );
    result = null;
  }

  if (!result) {
    if (uploaded) {
      // The photo is already durably in storage but no ticket exists. Same
      // envelope as the observations route: `success: false` so nothing can
      // mistake it for a delivery, plus the machine-readable
      // `outcome: 'stored_unrouted'` discriminator, at 207 Multi-Status
      // because that is literally what happened.
      return NextResponse.json(
        {
          success: false,
          outcome: 'stored_unrouted',
          routed: false,
          task_id: null,
          error:
            'Your photo was saved but the report could not be routed. Please tell the office directly — do not assume this has been picked up.',
        },
        { status: 207 }
      );
    }
    return fail(
      'The report could not be filed just now. Please try again, or tell the office directly.',
      502
    );
  }

  // A human label for "Sent to ___". Best-effort: a missing name never turns
  // a filed report into an error, it just falls back to the team.
  let routedTo = 'the campus operations team';
  if (result.accountableProfileId) {
    try {
      const { data: owner } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', result.accountableProfileId)
        .maybeSingle();
      if (owner?.full_name) routedTo = owner.full_name as string;
    } catch (e: unknown) {
      console.warn(
        '[instasolver] could not resolve the owner name for the receipt:',
        e instanceof Error ? e.message : e
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      task_id: result.taskId,
      routed_to: routedTo,
      due_date: result.dueDate ?? null,
      dangerous,
      photo_saved: Boolean(uploaded),
      // Present only for a dangerous report. Carries whether a phone was
      // actually reached — an unsafe condition that paged nobody must never
      // look like one that did.
      urgent_alert: result.urgentAlert
        ? {
            delivered: result.urgentAlert.delivered,
            used_fallback: result.urgentAlert.usedFallback,
            failure_reason: result.urgentAlert.failureReason,
          }
        : null,
    },
    { status: 200 }
  );
}
