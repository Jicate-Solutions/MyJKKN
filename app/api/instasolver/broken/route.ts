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
// ONE LIST, NOT A SECOND ONE. The task this route creates carries
// `metadata.source = 'campus-walk'`, exactly like an observation, because I4
// is "campus walk also should feed into the same only". Every campus-walk
// consumer that filters on that value therefore keeps working on these rows
// unchanged: the fix screen and API close them, the review screen and API list
// and approve them, the chase ladder chases them when they go overdue, and the
// photo-retention cron purges their photos on the same clock. All of that is
// intended, not incidental.
//
// The door is recorded as `metadata.front_door = 'instasolver'` and exactly
// two things read it: this route's per-reporter rate limit, and the D9
// coverage board (`isWalkedObservation`, lib/campus-walk/scoreboard.ts), which
// excludes these rows because coverage measures ground the Director WALKED and
// nobody walked to a report a learner sent in. The fixing board still counts
// their verified closures — D9's own split: walkers on coverage, fixers on
// verified closures.
//
// THE JPEG PIPELINE IS IMPORTED, NOT COPIED. isJpegMagic -> stripJpegMetadata
// -> scanJpegForMetadata (lib/services/pde/jpeg-metadata.ts) is the same
// Node-safe strip-and-fail-closed sequence the observations route documents at
// length: sniff the bytes rather than trusting the declared content type,
// rewrite the container to drop every metadata-bearing segment, then fail
// CLOSED if the rewrite did not actually produce a clean file. It is guardrail
// G4's enforcement point and it applies identically to a learner's photo.
//
// WHO CAN ACTUALLY REACH THIS. Every role in the STAFF auth flow — learners,
// teaching and non-teaching staff — including right now, before #3743 maps the
// route: `RouteMatcher.hasAccess` (lib/auth/route-matcher.ts) returns `true`
// when `match(path)` finds no config, so an UNMAPPED route is open, not
// super-admin-only. #3743 makes that access explicit rather than granting it.
//
// PARENTS ARE NOT REACHED YET, despite I1's wording. The Parent Portal is a
// separate login domain: proxy.ts gates `/parent/*` with a `parent_session`
// JWT via `handleParentPortal` and returns BEFORE the staff Supabase flow
// runs. A parent opening /instasolver/broken therefore has no Supabase session
// and is redirected to /auth/login. Reaching parents needs a `/parent/…` entry
// point — a follow-up lane, not a change to this route.
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
 * Abuse control. The Director-only D2 gate is what keeps the Campus Walk photo
 * route from being flooded; this route has no such gate by design (I1), so
 * these two ceilings do that job instead. Both are rolling windows rather than
 * calendar days, so neither resets at midnight.
 *
 * ── WHY BOTH ARE COUNTED FROM `instasolver_report_ledger` ───────────────────
 * NOT from `project_tasks`, which is what the first cut of this route counted.
 * That table's RLS (20260528000000:844-849) is
 * `FOR ALL USING (auth.uid() IS NOT NULL)` — any authenticated learner can
 * DELETE those rows through PostgREST with their own JWT and then file again,
 * so the ceiling could be erased by the party it limits. It was also an
 * unindexed `count:'exact'` over a jsonb predicate that failed OPEN on
 * timeout, meaning it got easier to defeat as the table grew.
 *
 * `instasolver_report_ledger` (20261213110000) has RLS on and NO policy for
 * `authenticated`, so it is invisible and unwritable through both public keys
 * while the service role can still count it, and it is indexed on exactly
 * these two windows. `audit_logs` was checked first and rejected: its
 * `FOR INSERT WITH CHECK (true)` policy would have let a learner forge rows
 * under someone else's `user_id` and lock that person out of reporting a
 * hazard.
 */
const DAILY_REPORT_LIMIT = 10;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LEDGER_TABLE = 'instasolver_report_ledger';

/**
 * HIGH 2 — a learner ticking "dangerous" pages a real phone, and the Director
 * has NOT ruled on that. D6 was decided for HIS OWN observations, where the
 * volume is one walker. Until he widens or narrows it, an InstaSolver report
 * pages the EAO ONLY (no Director copy — he gets the in-app bell like everyone
 * else), and no college may send more than this many pages in a rolling 24h.
 *
 * Per INSTITUTION, not per reporter: the reporter ceiling above already stops
 * one person flooding, and what this cap exists to stop is two hundred
 * different learners each legitimately reporting the same fire risk. Over the
 * cap the report is still filed and still urgent in-app — only the phone goes
 * quiet, and the response says so.
 */
const INSTITUTION_PAGE_LIMIT_PER_DAY = 20;

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
  // FAIL CLOSED on `is_active`. `=== false` let NULL and any future third
  // state through; `!== true` requires the column to actually say yes. There
  // are no NULLs in `profiles.is_active` today, which is exactly why this is
  // free to tighten now rather than after one appears.
  if (profile.is_active !== true) {
    return fail(
      'Your account is not active, so it cannot file reports. Contact the office if this is wrong.',
      403
    );
  }
  // 'guest' is a real `profiles.role` value and it is not an audience I1 names
  // — it is the placeholder a not-yet-onboarded account sits in. Refused
  // explicitly, with a reason, rather than being allowed to file a ticket that
  // routes to nobody and belongs to no college (rule #27).
  if (profile.role === 'guest') {
    return fail(
      'Guest accounts cannot report a fault yet. Ask the office to finish setting up your account, then try again.',
      403
    );
  }

  // ── Rate limit, before any bytes are read ─────────────────────────────────
  // Counted from `instasolver_report_ledger` with the service-role client. See
  // DAILY_REPORT_LIMIT above for why not `project_tasks` and why not
  // `audit_logs`: both are writable by the party being limited.
  const admin = createServiceRoleClient();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount, error: countError } = await admin
    .from(LEDGER_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .gte('created_at', since);

  if (countError) {
    // A counting outage must NOT swallow a report about an exposed wire, so the
    // report still goes through. But "we cannot count" and "you may page every
    // phone on campus" are different permissions: with no working ledger the
    // per-institution page cap below cannot be enforced either, so the urgent
    // path degrades to in-app only and the response says so. Never lose a
    // hazard report; never page unbounded.
    console.error(
      '[instasolver] ledger count failed — filing the report, WhatsApp paging disabled for it:',
      countError.message
    );
  } else if ((recentCount ?? 0) >= DAILY_REPORT_LIMIT) {
    return fail(
      `You've reported ${DAILY_REPORT_LIMIT} things in the last 24 hours — thank you. Try again after 24 hours from your first report today.`,
      429
    );
  }
  const ledgerCountFailed = Boolean(countError);

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
    //
    // The `report/` segment keeps the two doors apart. Without it, the same
    // person photographing the same fault through the Campus Walk capture
    // screen and through this form produces the SAME key, so the second upload
    // silently overwrites the first — and then the photo-retention cron, which
    // deletes by object path, can purge an object a second live task still
    // points at. Two doors must mean two objects.
    const sha256 = createHash('sha256').update(cleaned).digest('hex');
    const month = new Date().toISOString().slice(0, 7);
    const storagePath = `${user.id}/report/${month}/${sha256}.jpg`;

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

  // ── May this report page a phone? (HIGH 2) ────────────────────────────────
  // Only a `dangerous` report ever pages. On top of that: the college must be
  // under its rolling-24h page cap, and the ledger must be countable at all.
  // Anything else and the report is still filed and still urgent IN-APP — the
  // phone simply stays quiet, and `urgent_alert.suppressed_reason` below says
  // which rule did it.
  let pageSuppressedReason: 'institution_cap' | 'ledger_unavailable' | null = null;
  if (dangerous && ledgerCountFailed) {
    pageSuppressedReason = 'ledger_unavailable';
  } else if (dangerous) {
    const { count: pagedCount, error: pagedError } = await admin
      .from(LEDGER_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', profile.institution_id ?? null)
      .eq('paged', true)
      .gte('created_at', since);

    if (pagedError) {
      // Same rule as the reporter ceiling: file the report, but do not page on
      // the strength of a count we could not take.
      console.error(
        '[instasolver] page-cap count failed — filing the report, WhatsApp paging disabled for it:',
        pagedError.message
      );
      pageSuppressedReason = 'ledger_unavailable';
    } else if ((pagedCount ?? 0) >= INSTITUTION_PAGE_LIMIT_PER_DAY) {
      pageSuppressedReason = 'institution_cap';
    }
  }
  const mayPage = dangerous && pageSuppressedReason === null;

  // ── Record the report in the ledger BEFORE creating the task ──────────────
  // Before, not after, so a crash between the two costs the reporter one slot
  // out of ten rather than handing out an uncounted filing. `paged` records
  // what we ALLOWED, not what WhatsApp later managed to deliver — a cap that
  // only counted successful sends could be walked past by causing failures.
  //
  // A ledger write failure does not lose the report either. It degrades the
  // same way a failed count does: file it, keep the phone quiet.
  const { error: ledgerError } = await admin.from(LEDGER_TABLE).insert({
    reporter_id: user.id,
    institution_id: profile.institution_id ?? null,
    paged: mayPage,
  });
  if (ledgerError) {
    console.error(
      '[instasolver] ledger insert failed — filing the report, WhatsApp paging disabled for it:',
      ledgerError.message
    );
    pageSuppressedReason = dangerous ? 'ledger_unavailable' : pageSuppressedReason;
  }
  const pageAllowed = dangerous && pageSuppressedReason === null;

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
    // ONE LIST (decision I4). The service writes metadata.source =
    // 'campus-walk' unconditionally and no caller can change it, so this task
    // is a campus-walk lane task in every respect: the fix screen and API will
    // close it, the review screen lists it, the chase ladder chases it when it
    // goes overdue, and the photo-retention cron purges its photo on the same
    // clock. Only the door it arrived through is recorded here — read by the
    // D9 coverage board alone, which must not credit the Director's walk with
    // ground a learner reported from.
    extraMetadata: {
      front_door: 'instasolver',
      reporter_id: user.id,
      reporter_role: profile.role ?? null,
      reporter_institution_id: profile.institution_id ?? null,
      location,
    },
    // HIGH 2 — EAO only, and only while the college is under its cap.
    urgentPaging: {
      whatsApp: pageAllowed,
      directorCopy: false,
      suppressedReason:
        pageSuppressedReason === 'institution_cap'
          ? `this college has already sent ${INSTITUTION_PAGE_LIMIT_PER_DAY} urgent pages in the last 24 hours`
          : pageSuppressedReason === 'ledger_unavailable'
            ? 'the report ledger could not be read, so the page cap could not be enforced'
            : null,
    },
  };

  // Service-role client, for the same reason the observations route uses one
  // (its "Defect-3" note): createWalkTask reads `profiles`, `staff`,
  // `departments` and `hr_leave_applications` to resolve the EAO, the
  // department head and any leave reassignment, and writes bell
  // notifications. Under the caller's own session those reads are governed by
  // the caller's permissions — and this route's callers include learners, who
  // can see almost none of it. Routing would silently resolve
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

  // A human label for "Sent to ___", and NOTHING when there is nobody to name.
  //
  // The old default was the string 'the campus operations team', returned even
  // when routing had resolved no owner at all. That reads as an assignment to
  // a named group and it is not one: nobody is accountable, no due-date clock
  // is anybody's, and a reporter who believes a team has it does not follow up.
  // `routed_to: null` plus `notice` says what actually happened.
  let routedTo: string | null = null;
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

  const urgent = result.urgentAlert ?? null;

  return NextResponse.json(
    {
      success: true,
      task_id: result.taskId,
      routed_to: routedTo,
      // Set only when there is something true to say that `routed_to` cannot.
      notice:
        routedTo === null
          ? 'Recorded. No one is assigned yet — the campus operations team will pick it up.'
          : null,
      due_date: result.dueDate ?? null,
      dangerous,
      photo_saved: Boolean(uploaded),
      // Present only for a dangerous report. Carries whether a phone was
      // actually reached — an unsafe condition that paged nobody must never
      // look like one that did — and, separately, whether we deliberately
      // chose not to page, which is not a failure and must not read as one.
      urgent_alert: urgent
        ? {
            delivered: urgent.delivered,
            used_fallback: urgent.usedFallback,
            failure_reason: urgent.failureReason,
            page_suppressed: urgent.pageSuppressed,
            page_suppressed_reason: urgent.pageSuppressedReason,
          }
        : null,
    },
    { status: 200 }
  );
}
