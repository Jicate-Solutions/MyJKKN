// app/api/instasolver/thanks/route.ts
// ============================================================================
// InstaSolver — "Say thanks". POST { taskId, stars, thanks?, signed? }
//
// Director's rulings, 2026-09-30: after a fix the person who reported it can
// give 1–5 stars and say thanks. The thank-you names the FIXER personally
// ("Kumar, Priya from Pharmacy thanked you for fixing “Tap leaking” in Room 12
// and gave it 5 of 5 stars."). The reporter's own name is shown only when
// they tick "Sign with my name"; the default is "Someone".
//
// ── ONE RATING PER REPORTER PER FIX ROUND ───────────────────────────────────
// The round is the fix photo (fixRoundKeyOf in lib/campus-walk/my-reports.ts).
// The UNIQUE index on public.campus_walk_task_ratings (task_id, fix_round_key,
// reporter_profile_id) is the arbiter: a second tap — or a second tab — gets
// 23505 and is told "already thanked", never a second bell.
//
// ── WHY SERVICE ROLE ────────────────────────────────────────────────────────
// Same reason as app/api/campus-walk/not-fixed/route.ts: project_* RLS is
// `auth.uid() IS NOT NULL`, so the checks below — this is YOUR report, it IS
// fixed — are the real boundary. This route is also the table's ONLY writer:
// signed-in users have SELECT only on campus_walk_task_ratings, so nobody can
// skip these checks by inserting straight through PostgREST with a round key
// of their choosing (migration 20270701090000, repair round 1 Oct 2026).
//
// ── D10 ─────────────────────────────────────────────────────────────────────
// The reporter is never told who fixed it: nothing in the response names the
// fixer. The fixer's bell is created BY the fixer (createdBy = recipient, the
// closure.ts idiom), so an unsigned reporter cannot surface as "From:".
//
// ── FAIL SOFT ON THE BELL ───────────────────────────────────────────────────
// The rating is the record; the bell is the courtesy. A bell that fails is
// reported back as fixerTold:false, never turned into an error that invites a
// second tap (which the unique index would refuse anyway). createBellNotification
// returns null (it does not throw) when the notification row was not written,
// and it returns an id even when the recipient row failed — so "told" means an
// id came back AND the fixer's user_notifications row is there.
//
// The bell's idempotency key is the rating row's own id. It must not carry the
// reporter's profile id: the fixer can read their notification row, key
// included, and an unsigned "Someone" must stay unnamed.
//
// Every refusal is { success: false, error } with a sentence the reporter can
// act on (rule #27).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { reporterProfileIdOf, resolveFixerProfileId } from '@/lib/campus-walk/closure';
import {
  buildThanksBell,
  cleanThanks,
  fixRoundKeyOf,
  isRateableFix,
  parseStars,
} from '@/lib/campus-walk/my-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function fail(error: string, status: number, code: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

/** The department a person belongs to, if they are a team member. Null otherwise. */
async function departmentNameOf(
  admin: ReturnType<typeof createServiceRoleClient>,
  profileId: string
): Promise<string | null> {
  const { data: staff } = await admin
    .from('staff')
    .select('department_id')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle();
  const departmentId = (staff?.department_id as string | null) ?? null;
  if (!departmentId) return null;
  const { data: dept } = await admin
    .from('departments')
    .select('department_name')
    .eq('id', departmentId)
    .maybeSingle();
  return (dept?.department_name as string | null) ?? null;
}

async function fullNameOf(
  admin: ReturnType<typeof createServiceRoleClient>,
  profileId: string
): Promise<string | null> {
  const { data } = await admin.from('profiles').select('full_name').eq('id', profileId).maybeSingle();
  const name = typeof data?.full_name === 'string' ? data.full_name.trim() : '';
  return name || null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('You are signed out. Sign in and try again.', 401, 'not_signed_in');
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Something went wrong sending that. Please try again.', 400, 'bad_request');
  }

  const taskId = String(body?.taskId ?? body?.task_id ?? '').trim();
  if (!taskId) return fail('No report was named.', 400, 'bad_request');

  const stars = parseStars(body?.stars);
  if (stars === null) return fail('Tap from 1 to 5 stars first.', 400, 'bad_stars');

  const thanks = cleanThanks(body?.thanks);
  const signed = body?.signed === true;

  const admin = createServiceRoleClient();

  const { data: taskData, error: taskErr } = await admin
    .from('project_tasks')
    .select('id, title, status_key, owner_staff_id, metadata')
    .eq('id', taskId)
    .maybeSingle();

  if (taskErr) {
    return fail('We could not load this report just now. Please try again in a moment.', 502, 'lookup_failed');
  }
  if (!taskData) {
    return fail('That report no longer exists. It may have been removed.', 404, 'not_found');
  }

  const task = taskData as {
    id: string;
    title: string | null;
    status_key: string;
    owner_staff_id: string | null;
    metadata: Record<string, any> | null;
  };
  const metadata: Record<string, any> = { ...((task.metadata ?? {}) as Record<string, any>) };

  if (metadata.source !== 'campus-walk') {
    return fail('Stars can only be given on reports of something broken.', 400, 'wrong_lane');
  }

  // ── Only the person who reported it ───────────────────────────────────────
  const reporterIds = new Set(
    [
      reporterProfileIdOf(metadata),
      typeof metadata.raised_by_profile_id === 'string' ? metadata.raised_by_profile_id : null,
    ].filter((v): v is string => Boolean(v))
  );
  if (!reporterIds.has(user.id)) {
    return fail('Only the person who reported this can give it stars.', 403, 'not_reporter');
  }

  // ── Only a fixed job ──────────────────────────────────────────────────────
  if (!isRateableFix(task)) {
    return fail(
      'This job is not marked fixed yet. You can give stars once it has been fixed.',
      409,
      'not_fixed'
    );
  }

  const fixRoundKey = fixRoundKeyOf(metadata);

  let fixerProfileId: string | null = null;
  try {
    fixerProfileId = await resolveFixerProfileId(admin, task, metadata);
  } catch (e: any) {
    console.error('[instasolver/thanks] fixer lookup failed:', e?.message ?? e);
  }

  if (fixerProfileId && fixerProfileId === user.id) {
    return fail('You fixed this one yourself, so there is nobody to thank.', 409, 'own_fix');
  }

  // ── Save the rating — the unique index decides "one per round" ────────────
  const { data: ratingRow, error: insertErr } = await admin
    .from('campus_walk_task_ratings')
    .insert({
      task_id: task.id,
      fix_round_key: fixRoundKey,
      reporter_profile_id: user.id,
      fixer_profile_id: fixerProfileId,
      stars,
      thanks_text: thanks,
      signed,
    })
    .select('id')
    .single();

  if (insertErr) {
    if ((insertErr as any).code === '23505') {
      return NextResponse.json({
        success: true,
        already: true,
        task_id: task.id,
        message: 'You have already thanked them for this fix.',
      });
    }
    console.error('[instasolver/thanks] rating write failed:', insertErr.message);
    return fail('We could not save your stars just now. Nothing was sent — please try again.', 502, 'not_saved');
  }

  // ── The fixer's bell (fail soft) ──────────────────────────────────────────
  const ratingId = typeof (ratingRow as any)?.id === 'string' ? ((ratingRow as any).id as string) : null;

  let fixerTold = false;
  if (fixerProfileId) {
    try {
      const [fixerName, reporterName, reporterDepartment] = await Promise.all([
        fullNameOf(admin, fixerProfileId),
        signed ? fullNameOf(admin, user.id) : Promise.resolve(null),
        signed ? departmentNameOf(admin, user.id) : Promise.resolve(null),
      ]);
      const bell = buildThanksBell({
        fixerName,
        signed,
        reporterName,
        reporterDepartment,
        taskTitle: task.title ?? 'Campus job',
        place: typeof metadata.location === 'string' ? metadata.location : null,
        stars,
        thanks,
      });
      const notificationId = await createBellNotification(admin, {
        recipientIds: [fixerProfileId],
        createdBy: fixerProfileId,
        title: bell.title,
        body: bell.body,
        url: `/campus-walk/fix?task=${task.id}`,
        category: 'instasolver:thanks',
        metadata: { task_id: task.id, source: 'campus-walk', stars, signed },
        // One bell per rating row. No reporter id in the key (see the header).
        ...(ratingId ? { idempotencyKey: `instasolver-thanks:${ratingId}` } : {}),
      });
      if (notificationId) {
        const { count, error: deliveredErr } = await admin
          .from('user_notifications')
          .select('notification_id', { count: 'exact', head: true })
          .eq('notification_id', notificationId)
          .eq('user_id', fixerProfileId);
        fixerTold = !deliveredErr && (count ?? 0) > 0;
      }
      if (!fixerTold) {
        console.error(`[instasolver/thanks] rating saved but the fixer's bell did not land (task ${task.id})`);
      }
    } catch (e: any) {
      console.error('[instasolver/thanks] fixer bell failed:', e?.message ?? e);
      fixerTold = false;
    }
  } else {
    console.error(`[instasolver/thanks] rating saved but no fixer to tell (task ${task.id})`);
  }

  return NextResponse.json({
    success: true,
    already: false,
    task_id: task.id,
    fixer_told: fixerTold,
    message:
      !fixerTold
        ? 'Thank you. Your stars are saved.'
        : 'Thank you. The person who fixed it has been told.',
  });
}
