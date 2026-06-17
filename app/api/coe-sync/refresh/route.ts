export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { runCoeCourseSync, isCoeMastered } from '@/lib/services/coe-sync';

/**
 * Manual "Sync from COE" trigger for the Courses + Course Mappings pages.
 *
 * Two modes:
 *   { institutionId }  → sync ONE institution (any authenticated user).
 *   { all: true }      → sync EVERY COE-mastered institution (super-admin only),
 *                        i.e. the hourly cron, on demand from the UI.
 *
 * Forces an immediate full sync (mirror courses, then translate the course-scheme
 * into course_mappings), bypassing the on-demand TTL and the hourly cron. Use when
 * something was just added in the COE portal and it should reflect in MyJKKN now.
 *
 * Writes go through the service-role client (the RLS read client can't upsert).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const service = createServiceRoleClient();

    // ── Mode: sync ALL COE-mastered institutions (super-admin only) ───────────
    if (body?.all === true) {
      const { data: profile } = await service
        .from('profiles')
        .select('is_super_admin, role')
        .eq('id', user.id)
        .maybeSingle();
      const isSuperAdmin =
        profile?.is_super_admin === true || profile?.role === 'super_admin';
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: 'Forbidden: only super-admins can sync all institutions.' },
          { status: 403 },
        );
      }

      const { data: institutions, error: listErr } = await service
        .from('institutions')
        .select('id, name')
        .eq('course_master_source', 'coe');
      if (listErr) {
        return NextResponse.json({ error: listErr.message }, { status: 500 });
      }

      const agg = {
        ok: true,
        mode: 'all' as const,
        institutionsProcessed: 0,
        coursesUpserted: 0,
        coursesDeactivated: 0,
        mappingsUpserted: 0,
        mappingsSkipped: 0,
        errors: [] as string[],
      };

      // Dedup CAS: both Aided + Self rows are course_master_source='coe', but one
      // runCoeCourseSync pass covers ALL myjkkn_institution_ids of the COE unit.
      const covered = new Set<string>();
      for (const inst of institutions ?? []) {
        if (covered.has(inst.id)) continue;
        try {
          const r = await runCoeCourseSync(service, inst.id);
          for (const id of r.mirror.myjkknInstitutionIds.length ? r.mirror.myjkknInstitutionIds : [inst.id]) {
            covered.add(id);
          }
          agg.institutionsProcessed++;
          agg.coursesUpserted += r.mirror.upserted;
          agg.coursesDeactivated += r.mirror.softDeactivated;
          agg.mappingsUpserted += r.mappings.upserted;
          agg.mappingsSkipped += r.mappings.skipped.length;
          agg.errors.push(...r.mirror.errors, ...r.mappings.errors);
        } catch (err) {
          agg.errors.push(`${inst.name ?? inst.id}: ${(err as Error).message}`);
        }
      }
      agg.ok = agg.errors.length === 0;
      return NextResponse.json(agg);
    }

    // ── Mode: sync ONE institution ───────────────────────────────────────────
    const institutionId = body?.institutionId as string | undefined;
    if (!institutionId) {
      return NextResponse.json(
        { error: 'institutionId is required — select an institution first.' },
        { status: 400 },
      );
    }

    if (!(await isCoeMastered(service, institutionId))) {
      return NextResponse.json({
        ok: true,
        coeMastered: false,
        message:
          'This institution maintains courses in MyJKKN — there is nothing to sync from COE.',
      });
    }

    const r = await runCoeCourseSync(service, institutionId);
    const errors = [...r.mirror.errors, ...r.mappings.errors];

    return NextResponse.json({
      ok: errors.length === 0,
      coeMastered: true,
      coursesUpserted: r.mirror.upserted,
      coursesDeactivated: r.mirror.softDeactivated,
      mappingsUpserted: r.mappings.upserted,
      mappingsSkipped: r.mappings.skipped.length,
      errors,
    });
  } catch (err) {
    console.error('[coe-sync/refresh] error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Sync failed' },
      { status: 500 },
    );
  }
}
