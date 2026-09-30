// app/api/campus-walk/check/route.ts
// ============================================================================
// Campus Walk — answer a ROUTINE CHECK (preventive maintenance).
//
// Director rulings, 30 Sep 2026: MyJKKN creates routine check jobs by itself
// (app/api/cron/routine-checks) and sends them to the fixer. Two answers:
//
//   all_ok   ONE photo, required. The job is DONE — no approval step. This is
//            the ruling-sanctioned second writer of status_key 'done' in the
//            lane (the first is app/api/campus-walk/review/route.ts). It is
//            allowed ONLY on a task carrying metadata.routine_check = true that
//            has no recorded answer yet — anything else is refused, so this
//            route can never be used to close an ordinary repair job with one
//            photo and skip D4's approval.
//   problem  one line, photo optional. The same task becomes an ordinary
//            repair job (kind 'symptom', the lane's normal due date) for the
//            same owner, and from then on it is closed through the fix screen
//            with the normal photo + approval.
//
// metadata.fix is never written here: the scoreboard reads fix.approval as a
// VERIFIED closure, and an All OK answer is not a repair.
//
// Gate: the accountable person, their department head (the two doors of the
// fix route) and a super admin — lib/campus-walk/routine-checks.ts
// resolveCheckAccess. project_* RLS is open to any signed-in user, so this
// route is the only boundary; every refusal is a structured result the screen
// renders as a card (rule #27, no redirect).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isJpegMagic, scanJpegForMetadata, stripJpegMetadata } from '@/lib/services/pde/jpeg-metadata';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { routeAccountable } from '@/lib/services/campus-walk/campus-walk-service';
import {
  accountableProfileOf,
  problemConversionMetadata,
  resolveCheckAccess,
  routineCheckState,
  todayInIndia,
  validateOutcome
} from '@/lib/campus-walk/routine-checks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const BUCKET = 'campus-walk';
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_BYTES = 1024;

type Admin = ReturnType<typeof createServiceRoleClient>;

function fail(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, code, error, ...extra }, { status });
}

/** Read, re-strip and store the photo. Fails closed: nothing stored unless clean. */
async function storePhoto(
  admin: Admin,
  taskId: string,
  file: Blob
): Promise<{ ok: true; storagePath: string; bytes: number; sha: string } | { ok: false; res: NextResponse }> {
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      res: fail(413, 'too_large', `That photo is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB.`)
    };
  }
  if (file.size < MIN_BYTES) {
    return { ok: false, res: fail(400, 'too_small', 'That file is too small to be a photo. Please take it again.') };
  }
  const raw = new Uint8Array(await file.arrayBuffer());
  if (!isJpegMagic(raw)) {
    return { ok: false, res: fail(400, 'not_jpeg', 'That image could not be read. Please take the photo again.') };
  }
  const cleaned = stripJpegMetadata(raw);
  if (!cleaned || !scanJpegForMetadata(cleaned).ok) {
    return {
      ok: false,
      res: fail(
        422,
        'metadata_not_cleanable',
        'This photo could not be cleared of camera and location data, so it was not saved. Please take it again.'
      )
    };
  }
  const sha = createHash('sha256').update(cleaned).digest('hex');
  const storagePath = `${taskId}/check/${sha}.jpg`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, cleaned, { contentType: 'image/jpeg', upsert: true });
  if (error) {
    console.error('[campus-walk/check] upload failed:', error.message);
    return {
      ok: false,
      res: fail(502, 'upload_failed', 'The photo could not be sent. Keep this screen open and try again.', {
        retryable: true
      })
    };
  }
  return { ok: true, storagePath, bytes: cleaned.byteLength, sha };
}

async function nextAttachmentVersion(admin: Admin, taskId: string, storagePath: string) {
  const { data } = await admin
    .from('project_task_attachments')
    .select('id, version, storage_path')
    .eq('task_id', taskId);
  const rows = (data ?? []) as Array<{ id: string; version: number; storage_path: string }>;
  const existing = rows.find((r) => r.storage_path === storagePath) ?? null;
  const version = rows.reduce((m, r) => Math.max(m, Number(r.version ?? 0)), 0) + 1;
  return { existing, version };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, 'not_signed_in', 'You are signed out. Sign in and try again — your photo is still on this screen.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'bad_request', 'Expected a multipart upload.');
  }

  const taskId = String(form.get('task_id') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  const photo = form.get('photo');
  const hasPhoto = photo instanceof Blob && photo.size > 0;
  if (!taskId) return fail(400, 'bad_request', 'No job was named.');
  if (action !== 'all_ok' && action !== 'problem') return fail(400, 'bad_request', 'Unknown action.');

  const valid = validateOutcome({ result: action, hasPhoto, note });
  if (valid.ok === false) return fail(400, valid.code, valid.error);

  const admin = createServiceRoleClient();
  const access = await resolveCheckAccess(admin as any, user.id, taskId);
  if (access.allowed === false) {
    return fail(access.status, access.code, access.reason);
  }
  const { task } = access;

  const state = routineCheckState(task);
  if (state === 'answered') {
    return fail(409, 'already_answered', 'This routine check has already been answered.');
  }
  if (state === 'closed') {
    return fail(409, 'not_open', 'This routine check is closed, so it cannot be answered.');
  }
  if (state !== 'open') {
    return fail(400, 'wrong_lane', 'This screen only answers routine checks.');
  }

  const nowIso = new Date().toISOString();
  const today = todayInIndia();
  const metadata = { ...(task.metadata ?? {}) } as Record<string, any>;
  const logId: string | null = typeof metadata.routine_check_log_id === 'string' ? metadata.routine_check_log_id : null;
  const scheduleId: string | null =
    typeof metadata.routine_check_schedule_id === 'string' ? metadata.routine_check_schedule_id : null;
  const resourceId: string | null = typeof metadata.resource_id === 'string' ? metadata.resource_id : null;

  let storagePath: string | null = null;
  let attachmentId: string | null = null;
  if (hasPhoto) {
    const stored = await storePhoto(admin, taskId, photo as Blob);
    if (stored.ok === false) return stored.res;
    storagePath = stored.storagePath;

    const { existing, version } = await nextAttachmentVersion(admin, taskId, storagePath);
    if (existing) {
      attachmentId = existing.id;
    } else {
      const { data: att, error: attErr } = await admin
        .from('project_task_attachments')
        .insert({
          task_id: taskId,
          project_id: task.project_id,
          file_name: `check-${stored.sha.slice(0, 12)}.jpg`,
          storage_path: storagePath,
          mime_type: 'image/jpeg',
          size_bytes: stored.bytes,
          version,
          // All OK: this photo IS the evidence the check was done.
          // Problem: it is the observation photo the repair starts from.
          is_final_report: action === 'all_ok',
          uploaded_by: user.id
        })
        .select('id')
        .single();
      if (attErr || !att?.id) {
        console.error('[campus-walk/check] attachment insert failed:', attErr?.message);
        return fail(
          502,
          'photo_stored_not_recorded',
          'Your photo was uploaded but we could not attach it to the job. Tap again — the photo is safe.',
          { retryable: true }
        );
      }
      attachmentId = att.id as string;
    }
  }

  const outcome = {
    result: action,
    at: nowIso,
    by_profile_id: user.id,
    by_staff_id: access.callerStaffId,
    by_name: access.callerName || null,
    via: access.via,
    note: note || null,
    attachment_id: attachmentId,
    storage_path: storagePath
  };

  // ── All OK: done, logged, schedule stamped ────────────────────────────────
  if (action === 'all_ok') {
    const { error } = await admin
      .from('project_tasks')
      .update({
        status_key: 'done',
        completed_at: nowIso,
        is_blocked: false,
        metadata: { ...metadata, routine_check_outcome: outcome }
      })
      .eq('id', taskId);
    if (error) {
      console.error('[campus-walk/check] all_ok update failed:', error.message);
      return fail(502, 'not_saved', 'Your photo is saved but the check could not be closed. Tap All OK again.', {
        retryable: true
      });
    }

    if (logId) {
      const { error: logErr } = await admin
        .from('resource_maintenance_logs')
        .update({
          status: 'completed',
          completed_date: today,
          notes: `All OK — checked by ${access.callerName || 'the assigned team member'}${note ? `: ${note}` : ''}`,
          attachments: storagePath ? [storagePath] : [],
          updated_at: nowIso
        })
        .eq('id', logId);
      if (logErr) console.error('[campus-walk/check] log update failed:', logErr.message);
    }
    if (scheduleId) {
      const { error: schErr } = await admin
        .from('resource_maintenance_schedules')
        .update({ last_maintenance_date: today, updated_at: nowIso })
        .eq('id', scheduleId);
      if (schErr) console.error('[campus-walk/check] schedule stamp failed:', schErr.message);
    }

    return NextResponse.json({
      ok: true,
      action: 'all_ok',
      status_key: 'done',
      message: 'Done. This routine check is closed. Thank you.'
    });
  }

  // ── Found a problem: the same job becomes a normal repair ─────────────────
  const ownerProfileId = await accountableProfileOf(admin as any, access.accountableStaffId);
  // The lane's own due-date rule for a symptom, not a copy of the number.
  const routing = await routeAccountable(admin as any, {
    kind: 'symptom',
    isUnsafe: false,
    candidateProfileId: ownerProfileId
  });
  const repairDue = routing.dueDate;
  const itemName = typeof metadata.resource_name === 'string' ? metadata.resource_name : 'item';
  const place = typeof metadata.resource_place === 'string' ? metadata.resource_place : '';
  const repairTitle = `Repair: ${itemName}${place ? ` (${place})` : ''} — ${note}`.slice(0, 300);

  const { error: convErr } = await admin
    .from('project_tasks')
    .update({
      title: repairTitle,
      description: `Found during a routine check: ${note}\n\n${task.description ?? ''}`.trim(),
      due_date: repairDue,
      status_key: 'todo',
      metadata: problemConversionMetadata(metadata, outcome, storagePath)
    })
    .eq('id', taskId);
  if (convErr) {
    console.error('[campus-walk/check] problem conversion failed:', convErr.message);
    return fail(502, 'not_saved', 'We could not record the problem just now. Nothing was lost — please try again.', {
      retryable: true
    });
  }

  if (logId) {
    const { error: logErr } = await admin
      .from('resource_maintenance_logs')
      .update({
        status: 'completed',
        completed_date: today,
        notes: `Problem found: ${note} — repair job raised`,
        attachments: storagePath ? [storagePath] : [],
        updated_at: nowIso
      })
      .eq('id', logId);
    if (logErr) console.error('[campus-walk/check] log update failed:', logErr.message);
  }
  if (resourceId && ownerProfileId) {
    const { error: repErr } = await admin.from('resource_maintenance_logs').insert({
      resource_id: resourceId,
      maintenance_type: 'corrective',
      title: repairTitle,
      description: note,
      scheduled_date: repairDue,
      status: 'scheduled',
      priority: 3,
      assigned_to_user_id: ownerProfileId,
      created_by: user.id
    });
    if (repErr) console.error('[campus-walk/check] repair log insert failed:', repErr.message);
  }

  if (ownerProfileId) {
    try {
      await createBellNotification(admin as any, {
        recipientIds: [ownerProfileId],
        createdBy: user.id,
        title: `Repair needed — ${itemName}`.slice(0, 140),
        body: `A routine check found a problem: "${note}". Due by ${repairDue}. Send a photo of the finished repair from the fix screen.`,
        url: `/campus-walk/fix?task=${taskId}`,
        category: 'campus-walk:routine-check-problem',
        metadata: { task_id: taskId, source: 'campus-walk' },
        idempotencyKey: `campus-walk-routine-check-problem:${taskId}`
      });
    } catch (e: any) {
      console.error('[campus-walk/check] repair bell failed:', e?.message ?? e);
    }
  }

  return NextResponse.json({
    ok: true,
    action: 'problem',
    status_key: 'todo',
    due_date: repairDue,
    fix_url: `/campus-walk/fix?task=${taskId}`,
    message: `Recorded. This is now a repair job, due by ${repairDue}.`
  });
}
