export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/hr-playbook-lessons — weekly, Monday 07:13 IST (the 07:00 slot),
 * fired by the AI routine dispatcher (ai_routine_schedules 'hr-playbook-lessons').
 *
 * 1. fn_hr_duty_lessons_harvest(now - 35 days): gathers the reason text people
 *    already type when rejecting or reversing (leave, comp-off, attendance
 *    corrections, documents, photographs, HR forms) into hr_duty_lessons,
 *    sorted into a reason code by keyword. Idempotent.
 * 2. fn_hr_playbook_propose_from_lessons(): a reason seen often enough (the
 *    platform_policies threshold and window) becomes a proposed playbook line
 *    for the HR head on /hr/playbooks.
 *
 * Sends NOTHING — no notification, no email, no message.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` only.
 * Answers 500 when either call fails, or when the harvest reports a source it
 * could not read (an {error} inside its result), so a skipped source is never
 * recorded as a good run.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { runPlaybookLessons } from '@/lib/services/hr/playbooks/playbook-service';

const JOB = 'hr-playbook-lessons';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, job: JOB, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPlaybookLessons(createServiceRoleClient());
    if (!result.ok) {
      console.error(`[cron/${JOB}] failed`, result.errors);
      return NextResponse.json({ job: JOB, ...result }, { status: 500 });
    }
    return NextResponse.json({ job: JOB, ...result });
  } catch (err) {
    console.error(`[cron/${JOB}] failed`, err);
    return NextResponse.json(
      { ok: false, job: JOB, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
