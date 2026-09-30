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
//     "reported N times in the last 90 days" and "add to the open report";
//   - a resource_maintenance_logs row, so the item's own maintenance history
//     in Resource Management shows the report.
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
import { createHash } from 'node:crypto';
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
  isValidQrToken,
  loadResourceByToken,
  type ScannedResource,
} from '@/lib/instasolver/resource-report';
import {
  OWNER_SOURCE_LABEL,
  resolveResourceReportOwner,
} from '@/lib/instasolver/resource-report-owner';

const BUCKET = 'campus-walk';
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_BYTES = 1024;
/** How many extra reports one task keeps in metadata.additional_reports. */
const MAX_JOINED_REPORTS = 50;

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
    // Its own path segment, so the same bytes sent through the broken-thing
    // form never overwrite (and later get purged under) this report's photo.
    const sha256 = createHash('sha256').update(cleaned).digest('hex');
    const month = new Date().toISOString().slice(0, 7);
    const storagePath = `${user.id}/resource-report/${month}/${sha256}.jpg`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, cleaned, { contentType: 'image/jpeg', upsert: true });
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
  // is not trusted — it must be an OPEN report on THIS item.
  let joinNotice: string | null = null;
  if (joinTaskId && !dangerous) {
    const { data: task } = await admin
      .from('project_tasks')
      .select('id, title, status_key, owner_staff_id, metadata')
      .eq('id', joinTaskId)
      .maybeSingle();
    const meta = (task?.metadata ?? {}) as Record<string, unknown>;
    const joinable =
      task &&
      meta.resource_id === resource.id &&
      meta.source === 'campus-walk' &&
      !(TERMINAL_STATUS_KEYS as readonly string[]).includes(task.status_key as string);

    if (joinable) {
      const ledgerOk = await recordLedgerRow(admin, {
        reporterId: user.id,
        institutionId: profile.institution_id ?? null,
        paged: false,
      });
      if (!ledgerOk) {
        console.warn('[instasolver/resource-report] joined without a ledger row');
      }
      const previous = Array.isArray(meta.additional_reports)
        ? (meta.additional_reports as unknown[])
        : [];
      const entry = {
        reporter_id: user.id,
        raised_by_profile_id: user.id,
        reporter_role: profile.role ?? null,
        note: description,
        photo_storage_path: uploaded?.storagePath ?? null,
        at: new Date().toISOString(),
      };
      const nextMeta = {
        ...meta,
        additional_reports: [...previous, entry].slice(-MAX_JOINED_REPORTS),
      };
      const { error: updErr } = await admin
        .from('project_tasks')
        .update({ metadata: nextMeta })
        .eq('id', task.id);
      if (updErr) {
        console.error('[instasolver/resource-report] join update failed:', updErr.message);
        return fail('Could not add your note to the open report. Please try again.', 502);
      }

      // Bell whoever owns the task now.
      let ownerProfileId: string | null = null;
      if (task.owner_staff_id) {
        const map = await mapStaffToProfilesLocal(admin, [task.owner_staff_id as string]);
        ownerProfileId = map.get(task.owner_staff_id as string) ?? null;
      }
      if (ownerProfileId) {
        try {
          await createBellNotification(admin, {
            recipientIds: [ownerProfileId],
            // D10: a ticket shows how it arrived, never who sent it — so the
            // bell is "from" its own recipient, as every campus-walk bell is.
            createdBy: ownerProfileId,
            title: `Reported again — ${resource.name.slice(0, 80)}`,
            body: `Someone else has reported "${String(task.title ?? resource.name).slice(0, 120)}": ${description.slice(0, 200)}`,
            url: `/campus-walk/fix?task=${task.id}`,
            category: 'instasolver:resource-report-joined',
            metadata: { task_id: task.id, resource_id: resource.id, source: 'campus-walk' },
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
        task_id: task.id,
        routed_to: await ownerName(admin, ownerProfileId),
        notice: null,
        due_date: null,
        dangerous: false,
        photo_saved: Boolean(uploaded),
      });
    }
    // Closed in the meantime, or not this item's: file a new report instead
    // of losing this one.
    joinNotice = 'That report was already closed, so this was sent as a new report.';
  }

  // ── New report ────────────────────────────────────────────────────────────
  const owner = await resolveResourceReportOwner(admin, resource);

  // Paging for "dangerous" — the broken route's rules exactly: only when the
  // ledger can be counted and the college is under its 24-hour page cap.
  let pageSuppressedReason: 'institution_cap' | 'ledger_unavailable' | null = null;
  if (dangerous && reporterCount.failed) {
    pageSuppressedReason = 'ledger_unavailable';
  } else if (dangerous) {
    const pages = await countInstitutionPages(admin, profile.institution_id ?? null);
    if (pages.failed) pageSuppressedReason = 'ledger_unavailable';
    else if (pages.count >= INSTITUTION_PAGE_LIMIT_PER_DAY) pageSuppressedReason = 'institution_cap';
  }
  const mayPage = dangerous && pageSuppressedReason === null;
  const ledgerOk = await recordLedgerRow(admin, {
    reporterId: user.id,
    institutionId: profile.institution_id ?? null,
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
    // The item's college, not the reporter's: that is where the fix happens.
    institutionId: resource.institution_id ?? profile.institution_id ?? null,
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
  if (accountable && accountable === owner.profileId) {
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

  // The item's own maintenance history. Best-effort: the task is the record
  // of work; this row only makes the report visible from Resource Management.
  // resource_maintenance_logs has no task column, so the task id goes in notes.
  const { error: logErr } = await admin.from('resource_maintenance_logs').insert({
    resource_id: resource.id,
    maintenance_type: dangerous ? 'emergency' : 'corrective',
    title: buildReportTitle(resource, description).slice(0, 255),
    description,
    scheduled_date: result.dueDate ?? new Date().toISOString().slice(0, 10),
    status: 'scheduled',
    priority: dangerous ? 4 : 2,
    assigned_to_user_id: accountable,
    notes: `Reported via InstaSolver (QR scan). Campus Walk task: ${result.taskId}`,
    created_by: user.id,
  });
  if (logErr) {
    console.error('[instasolver/resource-report] maintenance log insert failed:', logErr.message);
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
