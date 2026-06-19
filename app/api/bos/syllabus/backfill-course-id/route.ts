// app/api/bos/syllabus/backfill-course-id/route.ts
//
// One-time (re-runnable) backfill of bos_course_syllabi.course_id from COE.
// course_id (the stable COE course id) is the canonical link; existing rows only
// have the mutable course_code snapshot. This resolves each row's COE course id
// by matching its CURRENT course_code within (coe_id, regulation_code).
//
// Super-admin only. Supports ?dryRun=true to preview without writing, and
// ?all=true to refresh rows that already have a course_id.
//
// Rows whose course_code no longer exists in COE (i.e. COE already renamed the
// code — exactly the breakage course_id fixes) CANNOT be auto-resolved; they are
// returned in `unmatched` for manual mapping, never guessed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosAccess, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import type { BosCourseListResponse, BosCourseMaster } from '@/types/bos-courses';

interface Row {
  id: string;
  institutions_id: string;
  regulation_id: string | null;
  course_code: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);
    if (!scope.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden — super-admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const refreshAll = searchParams.get('all') === 'true';

    const db = createServiceRoleClient();

    // 1. Candidate rows (missing course_id, or all when ?all=true).
    let rowQuery = db
      .from('bos_course_syllabi')
      .select('id, institutions_id, regulation_id, course_code');
    if (!refreshAll) rowQuery = rowQuery.is('course_id', null);
    const { data: rowsData, error: rowsErr } = await rowQuery;
    if (rowsErr) throw rowsErr;
    const rows = (rowsData ?? []) as Row[];

    // 2. Group by (institutions_id, regulation_id) so we fetch COE once per group.
    const groups = new Map<string, { institutions_id: string; regulation_id: string | null; items: Row[] }>();
    for (const r of rows) {
      const key = `${r.institutions_id}|${r.regulation_id ?? ''}`;
      const g = groups.get(key) ?? { institutions_id: r.institutions_id, regulation_id: r.regulation_id, items: [] };
      g.items.push(r);
      groups.set(key, g);
    }

    const client = CoeRestClient.create();
    let updated = 0;
    const unmatched: Array<{ id: string; course_code: string; reason: string }> = [];

    for (const g of groups.values()) {
      const coeInstId = await resolveCoeInstitutionId(g.institutions_id);
      if (!coeInstId) {
        g.items.forEach((i) => unmatched.push({ id: i.id, course_code: i.course_code, reason: 'institution not mapped in COE' }));
        continue;
      }

      let regulationCode: string | undefined;
      if (g.regulation_id) {
        const { data: reg } = await db
          .from('regulations')
          .select('regulation_code')
          .eq('id', g.regulation_id)
          .maybeSingle();
        regulationCode = (reg as { regulation_code?: string } | null)?.regulation_code ?? undefined;
      }

      // Paginate COE courses for this institution+regulation → course_code → id.
      const codeToId = new Map<string, string>();
      const PAGE = 200;
      const MAX_PAGES = 25;
      for (let p = 0; p < MAX_PAGES; p++) {
        const raw = await client.get<unknown>('/api/v1/courses', {
          institutions_id: coeInstId,
          regulation_code: regulationCode,
          is_active: 'true',
          limit: String(PAGE),
          offset: String(p * PAGE),
        }).catch(() => null);
        if (!raw) break;
        const list: BosCourseMaster[] = Array.isArray(raw)
          ? (raw as BosCourseMaster[])
          : (((raw as BosCourseListResponse)?.data as BosCourseMaster[]) ?? []);
        for (const c of list) {
          if (c.course_code && c.id) codeToId.set(c.course_code, c.id);
        }
        if (list.length < PAGE) break;
      }

      for (const item of g.items) {
        const coeCourseId = codeToId.get(item.course_code);
        if (!coeCourseId) {
          unmatched.push({ id: item.id, course_code: item.course_code, reason: 'course_code not found in COE (possibly renamed)' });
          continue;
        }
        if (!dryRun) {
          const { error: upErr } = await db
            .from('bos_course_syllabi')
            .update({ course_id: coeCourseId })
            .eq('id', item.id);
          if (upErr) {
            unmatched.push({ id: item.id, course_code: item.course_code, reason: `update failed: ${upErr.message}` });
            continue;
          }
        }
        updated++;
      }
    }

    return NextResponse.json({
      dryRun,
      refreshAll,
      totalCandidates: rows.length,
      groups: groups.size,
      updated,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 500), // cap the response payload
    });
  } catch (error) {
    console.error('[bos/syllabus/backfill-course-id] error:', error);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
