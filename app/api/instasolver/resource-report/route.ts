// app/api/instasolver/resource-report/route.ts
// ============================================================================
// InstaSolver — report a problem by scanning a room's or an item's QR sticker.
//
// Director rulings (30 Sep – 1 Oct 2026):
//   - The fastest way to report is a QR sticker in every room: room and item
//     already filled in, a photo, tap send — about ten seconds.
//   - "Use resource management for list of places and items for reporting
//     issues." The sticker carries resources.qr_code_token.
//   - The owner is the item's CARETAKER first, else the estate office (EAO),
//     else the college principal (lib/instasolver/resource-report-owner.ts).
//
// It is the same lane as /instasolver/broken, not a second one: the report
// becomes a Campus Walk task through createWalkTask, with the same
// metadata.front_door = 'instasolver', so the fix screen, the review screen,
// the chase ladder and the photo-retention cron all treat it exactly as they
// treat a broken-thing report. What this door adds:
//   - the place and the item come from the resource, not from typing;
//   - the owner is the item's caretaker when one is recorded;
//   - metadata.resource_id ties the task to the item, which is what powers
//     "reported N times in the last 90 days" and "add to the open report".
//
// NO resource_maintenance_logs row (repair round, 1 Oct 2026): nothing in the
// Campus Walk lane ever closes such a row, so every report showed as
// "overdue" in Resource Management for ever once its due date passed. The
// Campus Walk task is the record of the work. Writing the row back — and
// completing it when the task closes — is a follow-up.
//
// SHARED, NOT COPIED:
//   - the JPEG pipeline (isJpegMagic -> stripJpegMetadata -> scanJpegForMetadata)
//     is imported from lib/services/pde/jpeg-metadata.ts, as the broken route does;
//   - the rate limit counts the SAME ledger with the SAME numbers
//     (lib/instasolver/report-ledger.ts), so the two doors share one ceiling.
//
// Every refusal is explicit JSON with a reason (rule #27).
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  isJpegMagic,
  stripJpegMetadata,
  scanJpegForMetadata,
} from '@/lib/services/pde/jpeg-metadata';
import {
  createWalkTask,
  mapStaffToProfilesLocal,
  type CreateWalkTaskInput,
} from '@/lib/services/campus-walk/campus-walk-service';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  DAILY_REPORT_LIMIT,
  INSTITUTION_PAGE_LIMIT_PER_DAY,
  countInstitutionPages,
  countReporterReports,
  recordLedgerRow,
} from '@/lib/instasolver/report-ledger';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TERMINAL_STATUS_KEYS,
  buildReportTitle,
  formatLocation,
  formatPlace,
  isJoinableStatus,
  isUuid,
  isValidQrToken,
  loadResourceByToken,
  type ScannedResource,
} from '@/lib/instasolver/resource-report';
import {
  OWNER_SOURCE_LABEL,
  resolveResourceReportOwner,
} from '@/lib/instasolver/resource-report-owner';
import { sendNoCaretakerNote } from '@/lib/instasolver/no-caretaker-note';
import {
  MAX_JOINED_REPORTS,
  countJoinedReports,
  type JoinedReportEntry,
} from '@/lib/campus-walk/joined-reports';

const BUCKET = 'campus-walk';
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_BYTES = 1024;
/** Times the join re-reads the task when someone else wrote it in between. */
const JOIN_ATTEMPTS = 3;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

async function ownerName(
  admin: ReturnType<typeof createServiceRoleClient>,
  profileId: string | null | undefined
): Promise<string | null> {
  if (!profileId) return null;
  try {
    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle();
    return (data?.full_name as string | undefined) ?? null;
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
    return fail('You need to be signed in to report a problem.', 401);
  }

  // Same profile rules as the broken route: an active, non-guest profile.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[instasolver/resource-report] profile lookup failed:', profileError.message);
    return fail('Could not check your account just now. Please try again.', 503);
  }
  if (!profile) {
    return fail(
      'Your account has no profile on MyJKKN yet, so a report cannot be filed against it. Contact the office to have your profile set up.',
      403
    );
  }
  if (profile.is_active !== true) {
    return fail('Your account is not active, so it cannot file reports. Contact the office if this is wrong.', 403);
  }
  if (profile.role === 'guest') {
    return fail(
      'Guest accounts cannot report a problem yet. Ask the office to finish setting up your account, then try again.',
      403
    );
  }

  // ── Rate limit, before any bytes are read ─────────────────────────────────
  const admin = createServiceRoleClient();
  const reporterCount = await countReporterReports(admin, user.id);
  if (!reporterCount.failed && reporterCount.count >= DAILY_REPORT_LIMIT) {
    return fail(
      `You've reported ${DAILY_REPORT_LIMIT} things in the last 24 hours — thank you. Try again after 24 hours from your first report today.`,
      429
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data.', 400);
  }

  // ── Which item was scanned ────────────────────────────────────────────────
  const token = String(form.get('token') ?? '').trim();
  if (!isValidQrToken(token)) {
    return fail('This sticker code is not one we recognise. Scan the sticker again.', 400);
  }
  let resource: ScannedResource | null;
  try {
    resource = await loadResourceByToken(admin, token);
  } catch {
    return fail('Could not look up this sticker just now. Please try again.', 503);
  }
  if (!resource) {
    return fail(
      'This sticker is not linked to any room or item any more. Tell the estate office, or report it from InstaSolver instead.',
      404
    );
  }

  const description = String(form.get('description') ?? '').trim();
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return fail(`Tell us what is wrong — between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`, 400);
  }
  const dangerous = ['true', '1', 'on', 'yes'].includes(
    String(form.get('dangerous') ?? '').trim().toLowerCase()
  );
  const joinTaskId = String(form.get('join_task_id') ?? '').trim() || null;
  if (joinTaskId && !isUuid(joinTaskId)) {
    return fail('That report link is not valid. Scan the sticker again.', 400);
  }
  // Director ruling (1 Oct 2026): a report from a scanned sticker belongs to
  // the college where the ITEM is (resources.institution_id), NEVER the
  // reporter's college. The task, the owner chain, the page cap and the
  // ledger row all use it. An item with no college stays null — it is not
  // silently credited to whoever happened to scan it.
  const itemInstitutionId = resource.institution_id ?? null;

  // ── Optional photo — the same strip-and-fail-closed pipeline ──────────────
  const rawPhoto = form.get('photo');
  const photoFile = rawPhoto instanceof File && rawPhoto.size > 0 ? rawPhoto : null;
  let uploaded: { storagePath: string; mimeType: string; sizeBytes: number } | null = null;
  if (photoFile) {
    if (photoFile.size > MAX_BYTES) {
      return fail(
        `That photo is ${(photoFile.size / 1048576).toFixed(1)} MB — the limit is 10 MB. Send it without the photo, or pick a smaller one.`,
        422
      );
    }
    if (photoFile.size < MIN_BYTES) {
      return fail('That photo could not be read. Try another one, or send without it.', 422);
    }
    const buf = new Uint8Array(await photoFile.arrayBuffer());
    if (!isJpegMagic(buf)) {
      return fail('That photo could not be read. Try another one, or send without it.', 422);
    }
    const cleaned = stripJpegMetadata(buf);
    if (!cleaned || !scanJpegForMetadata(cleaned).ok) {
      return fail('That photo could not be read. Try another one, or send without it.', 422);
    }
    // One object per report: its own path segment AND a random suffix, so the
    // same bytes sent twice (through this door or the broken-thing form) never
    // share an object — otherwise purging one task's photo would delete the
    // other task's.
    const sha256 = createHash('sha256').update(cleaned).digest('hex');
    const month = new Date().toISOString().slice(0, 7);
    const storagePath = `${user.id}/resource-report/${month}/${sha256.slice(0, 32)}-${randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, cleaned, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.error('[instasolver/resource-report] upload failed:', upErr.message);
      return fail(
        'Could not save the photo right now. Please try again in a moment, or send the report without it.',
        503
      );
    }
    uploaded = { storagePath, mimeType: 'image/jpeg', sizeBytes: cleaned.byteLength };
  }

  // ── "Add to the open report" ──────────────────────────────────────────────
  // Never for a dangerous report: that must get its own same-day, paged task
  // rather than be folded into an ordinary one. The task id from the client
  // is not trusted — it must be an OPEN report on THIS item, not waiting for
  // sign-off, and not already full.
  //
  // The note goes into metadata.additional_reports (shape: JoinedReportEntry,
  // lib/campus-walk/joined-reports.ts). The fix screen, the approvals screen
  // and the photo-retention cron all read it from there.
  //
  // Written with a version check on updated_at (bumped by
  // trg_project_tasks_updated_at on every update): if the fix or review route
  // wrote the task in between, re-read and try again, so neither side's keys
  // are lost.
  let joinNotice: string | null = null;
  if (joinTaskId && !dangerous) {
    let joinedTask: { id: string; title: string | null; owner_staff_id: string | null } | null = null;
    let refusal: 'closed' | 'awaiting_sign_off' | 'full' | 'not_this_item' | 'busy' = 'busy';

    for (let attempt = 0; attempt < JOIN_ATTEMPTS && !joinedTask; attempt++) {
      const { data: task, error: taskErr } = await admin
        .from('project_tasks')
        .select('id, title, status_key, owner_staff_id, metadata, updated_at')
        .eq('id', joinTaskId)
        .maybeSingle();
      if (taskErr) {
        console.error('[instasolver/resource-report] join lookup failed:', taskErr.message);
        return fail('Could not check the open report just now. Please try again.', 503);
      }
      const meta = (task?.metadata ?? {}) as Record<string, unknown>;
      if (!task || meta.resource_id !== resource.id || meta.source !== 'campus-walk') {
        refusal = 'not_this_item';
        break;
      }
      if ((TERMINAL_STATUS_KEYS as readonly string[]).includes(task.status_key as string)) {
        refusal = 'closed';
        break;
      }
      if (!isJoinableStatus(task.status_key as string)) {
        refusal = 'awaiting_sign_off';
        break;
      }
      if (countJoinedReports(meta) >= MAX_JOINED_REPORTS) {
        // Refuse rather than drop the oldest: every entry is a person who is
        // told when the job is fixed, and a dropped entry's photo would never
        // be purged.
        refusal = 'full';
        break;
      }

      const entry: JoinedReportEntry = {
        reporter_id: user.id,
        raised_by_profile_id: user.id,
        reporter_role: profile.role ?? null,
        note: description,
        photo_storage_path: uploaded?.storagePath ?? null,
        at: new Date().toISOString(),
      };
      const previous = Array.isArray(meta.additional_reports) ? (meta.additional_reports as unknown[]) : [];
      const nextMeta = { ...meta, additional_reports: [...previous, entry] };

      const { data: written, error: updErr } = await admin
        .from('project_tasks')
        .update({ metadata: nextMeta })
        .eq('id', task.id)
        .eq('updated_at', task.updated_at)
        .select('id');
      if (updErr) {
        console.error('[instasolver/resource-report] join update failed:', updErr.message);
        return fail('Could not add your note to the open report. Please try again.', 502);
      }
      if (Array.isArray(written) && written.length > 0) {
        joinedTask = {
          id: task.id as string,
          title: (task.title as string | null) ?? null,
          owner_staff_id: (task.owner_staff_id as string | null) ?? null,
        };
      }
      // Zero rows: someone wrote the task in between. Loop and re-read.
    }

    if (joinedTask) {
      const ledgerOk = await recordLedgerRow(admin, {
        reporterId: user.id,
        institutionId: itemInstitutionId,
        paged: false,
      });
      if (!ledgerOk) {
        console.warn('[instasolver/resource-report] joined without a ledger row');
      }

      // Bell whoever owns the task now.
      let ownerProfileId: string | null = null;
      if (joinedTask.owner_staff_id) {
        const map = await mapStaffToProfilesLocal(admin, [joinedTask.owner_staff_id]);
        ownerProfileId = map.get(joinedTask.owner_staff_id) ?? null;
      }
      if (ownerProfileId) {
        try {
          await createBellNotification(admin, {
            recipientIds: [ownerProfileId],
            // D10: a ticket shows how it arrived, never who sent it — so the
            // bell is "from" its own recipient, as every campus-walk bell is.
            createdBy: ownerProfileId,
            title: `Reported again — ${resource.name.slice(0, 80)}`,
            body: `Someone else has reported "${String(joinedTask.title ?? resource.name).slice(0, 120)}": ${description.slice(0, 200)}`,
            url: `/campus-walk/fix?task=${joinedTask.id}`,
            category: 'instasolver:resource-report-joined',
            metadata: { task_id: joinedTask.id, resource_id: resource.id, source: 'campus-walk' },
          });
        } catch (e: unknown) {
          console.error(
            '[instasolver/resource-report] join bell failed:',
            e instanceof Error ? e.message : e
          );
        }
      }

      return NextResponse.json({
        success: true,
        joined: true,
        task_id: joinedTask.id,
        routed_to: await ownerName(admin, ownerProfileId),
        notice: null,
        due_date: null,
        dangerous: false,
        photo_saved: Boolean(uploaded),
      });
    }

    // Not joinable: file a new report instead of losing this one, and say why.
    joinNotice =
      refusal === 'awaiting_sign_off'
        ? 'The earlier report is already fixed and waiting for sign-off, so this was sent as a new report.'
        : refusal === 'full'
          ? 'The earlier report already has many reports added to it, so this was sent as a new report.'
          : refusal === 'busy'
            ? 'The earlier report was being updated just then, so this was sent as a new report.'
            : 'That report was already closed, so this was sent as a new report.';
  }

  // ── New report ────────────────────────────────────────────────────────────
  const owner = await resolveResourceReportOwner(admin, resource);

  // Paging for "dangerous" — the broken route's rules exactly: only when the
  // ledger can be counted and the college is under its 24-hour page cap.
  let pageSuppressedReason: 'institution_cap' | 'ledger_unavailable' | null = null;
  if (dangerous && reporterCount.failed) {
    pageSuppressedReason = 'ledger_unavailable';
  } else if (dangerous) {
    const pages = await countInstitutionPages(admin, itemInstitutionId);
    if (pages.failed) pageSuppressedReason = 'ledger_unavailable';
    else if (pages.count >= INSTITUTION_PAGE_LIMIT_PER_DAY) pageSuppressedReason = 'institution_cap';
  }
  const mayPage = dangerous && pageSuppressedReason === null;
  const ledgerOk = await recordLedgerRow(admin, {
    reporterId: user.id,
    institutionId: itemInstitutionId,
    paged: mayPage,
  });
  if (!ledgerOk && dangerous) pageSuppressedReason = 'ledger_unavailable';
  const pageAllowed = dangerous && pageSuppressedReason === null;

  const location = formatLocation(resource);
  const input: CreateWalkTaskInput = {
    title: buildReportTitle(resource, description),
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
    accountableProfileId: owner.profileId,
    // The item's college, never the reporter's: that is where the fix happens.
    institutionId: itemInstitutionId,
    raisedByProfileId: user.id,
    extraMetadata: {
      front_door: 'instasolver',
      entry: 'qr-scan',
      reporter_id: user.id,
      reporter_role: profile.role ?? null,
      reporter_institution_id: profile.institution_id ?? null,
      resource_id: resource.id,
      resource_name: resource.name,
      location,
      owner_source: owner.source,
    },
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

  let result: Awaited<ReturnType<typeof createWalkTask>> = null;
  try {
    result = await createWalkTask(admin, input);
  } catch (e: unknown) {
    console.error(
      '[instasolver/resource-report] createWalkTask threw:',
      e instanceof Error ? e.message : e
    );
    result = null;
  }
  if (!result) {
    if (uploaded) {
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
    return fail('The report could not be filed just now. Please try again, or tell the office directly.', 502);
  }

  const accountable = result.accountableProfileId ?? null;

  // createWalkTask bells only on its own EAO fallback and leave paths; an
  // owner WE supplied who is available gets nothing from it. Bell them here.
  // When that owner is on approved leave with nobody to hand over to,
  // createWalkTask has already sent them its "clock paused" bell and marked
  // the task is_blocked — skip ours then, so they are not belled twice.
  let ownerAlreadyBelled = false;
  if (accountable && accountable === owner.profileId) {
    const { data: created } = await admin
      .from('project_tasks')
      .select('is_blocked')
      .eq('id', result.taskId)
      .maybeSingle();
    ownerAlreadyBelled = created?.is_blocked === true;
  }
  if (accountable && accountable === owner.profileId && !ownerAlreadyBelled) {
    try {
      await createBellNotification(admin, {
        recipientIds: [accountable],
        // D10 — never the reporter (see the join bell above).
        createdBy: accountable,
        title: `${dangerous ? 'DANGEROUS — ' : ''}Problem reported: ${resource.name.slice(0, 80)}`,
        body: `${location}: ${description.slice(0, 200)}. You are named as ${OWNER_SOURCE_LABEL[owner.source]}.`,
        url: `/campus-walk/fix?task=${result.taskId}`,
        category: 'instasolver:resource-report',
        metadata: { task_id: result.taskId, resource_id: resource.id, source: 'campus-walk' },
      });
    } catch (e: unknown) {
      console.error(
        '[instasolver/resource-report] owner bell failed:',
        e instanceof Error ? e.message : e
      );
    }
  }

  // Director ruling (1 Oct 2026): no ACTIVE caretaker -> the job went to the
  // estate office above, and the estate office ALSO gets a separate note to
  // assign one, linking the item's resource page. At most one per item per
  // 30 days. When no estate office exists at all and the principal got the
  // job, the principal gets the note — they are the person who can act on it.
  if (
    owner.caretakerMissing &&
    owner.profileId &&
    (owner.source === 'estate_office' || owner.source === 'principal')
  ) {
    await sendNoCaretakerNote(admin, {
      recipientId: owner.profileId,
      resourceId: resource.id,
      itemName: resource.name,
      // Place and college only (formatLocation falls back to the item name).
      place: [formatPlace(resource), resource.institution_name].filter(Boolean).join(' — ') || null,
      taskId: result.taskId,
    });
  }

  const routedTo = await ownerName(admin, accountable);
  const urgent = result.urgentAlert ?? null;
  return NextResponse.json({
    success: true,
    joined: false,
    task_id: result.taskId,
    routed_to: routedTo,
    owner_source: accountable && accountable === owner.profileId ? owner.source : null,
    notice:
      joinNotice ??
      (routedTo === null
        ? 'Recorded. No one is assigned yet — the campus operations team will pick it up.'
        : null),
    due_date: result.dueDate ?? null,
    dangerous,
    photo_saved: Boolean(uploaded),
    urgent_alert: urgent
      ? {
          delivered: urgent.delivered,
          used_fallback: urgent.usedFallback,
          failure_reason: urgent.failureReason,
          page_suppressed: urgent.pageSuppressed,
          page_suppressed_reason: urgent.pageSuppressedReason,
        }
      : null,
  });
}
