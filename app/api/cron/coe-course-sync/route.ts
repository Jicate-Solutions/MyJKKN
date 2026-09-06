export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runCoeCourseSync } from '@/lib/services/coe-sync';

/**
 * COE → MyJKKN course master + scheme sync cron.
 *
 * Authoritative refresh for COE-mastered institutions (course_master_source='coe',
 * i.e. CAS + Engineering). For each, mirrors the COE course list into the local
 * `courses` table and translates the COE course-scheme into `course_mappings`,
 * so the timetable always sees current courses without anyone re-entering them.
 *
 * Idempotent — upserts on natural keys, soft-deactivates (never deletes) courses
 * that vanish from COE. Resilient to COE downtime: a failed institution is
 * reported and the last good mirror stays in place.
 *
 * Schedule in vercel.json: hourly is plenty (course master changes rarely).
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>` header (Vercel cron)
 * OR `?secret=` query param (manual runs).
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[cron/coe-course-sync] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    console.warn('[cron/coe-course-sync] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const summary = {
    institutions: 0,
    courses_upserted: 0,
    courses_soft_deactivated: 0,
    mappings_upserted: 0,
    mappings_skipped: 0,
    errors: [] as string[],
    per_institution: [] as Array<{
      institution_id: string;
      myjkkn_ids: string[];
      courses_fetched: number;
      courses_upserted: number;
      courses_soft_deactivated: number;
      mappings_fetched: number;
      mappings_upserted: number;
      mappings_skipped: number;
      errors: string[];
    }>,
    duration_ms: 0,
  };

  try {
    // Optional single-institution scope for manual runs / debugging.
    const onlyId = request.nextUrl.searchParams.get('institution_id');

    let q = supabase
      .from('institutions')
      .select('id, name')
      .eq('course_master_source', 'coe');
    if (onlyId) q = q.eq('id', onlyId);

    const { data: institutions, error: instErr } = await q;
    if (instErr) {
      summary.errors.push(`Failed to list COE-mastered institutions: ${instErr.message}`);
      return NextResponse.json({ ...summary, duration_ms: Date.now() - startTime }, { status: 500 });
    }

    summary.institutions = institutions?.length ?? 0;

    // Sequential on purpose — the COE REST client is globally concurrency-capped
    // and rate-limited per key, so fanning out wide here would just queue anyway.
    //
    // Dedup CAS: both Aided + Self rows are course_master_source='coe', but
    // runCoeCourseSync fans out to ALL myjkkn_institution_ids of the COE
    // institution in ONE pass. Processing the sibling again would just re-do the
    // same work, so once an id is covered we skip it.
    const covered = new Set<string>();
    for (const inst of institutions ?? []) {
      if (covered.has(inst.id)) continue;
      try {
        const r = await runCoeCourseSync(supabase, inst.id);
        for (const id of r.mirror.myjkknInstitutionIds.length ? r.mirror.myjkknInstitutionIds : [inst.id]) {
          covered.add(id);
        }
        summary.courses_upserted += r.mirror.upserted;
        summary.courses_soft_deactivated += r.mirror.softDeactivated;
        summary.mappings_upserted += r.mappings.upserted;
        summary.mappings_skipped += r.mappings.skipped.length;
        summary.errors.push(...r.mirror.errors, ...r.mappings.errors);
        summary.per_institution.push({
          institution_id: inst.id,
          myjkkn_ids: r.mirror.myjkknInstitutionIds,
          courses_fetched: r.mirror.coeCoursesFetched,
          courses_upserted: r.mirror.upserted,
          courses_soft_deactivated: r.mirror.softDeactivated,
          mappings_fetched: r.mappings.coeMappingsFetched,
          mappings_upserted: r.mappings.upserted,
          mappings_skipped: r.mappings.skipped.length,
          errors: [...r.mirror.errors, ...r.mappings.errors],
        });
      } catch (err) {
        const msg = `${inst.name ?? inst.id}: ${(err as Error).message}`;
        summary.errors.push(msg);
        console.error('[cron/coe-course-sync]', msg);
      }
    }

    summary.duration_ms = Date.now() - startTime;
    return NextResponse.json(summary, { status: summary.errors.length > 0 ? 207 : 200 });
  } catch (err) {
    summary.errors.push((err as Error).message);
    summary.duration_ms = Date.now() - startTime;
    console.error('[cron/coe-course-sync] fatal:', err);
    return NextResponse.json(summary, { status: 500 });
  }
}
