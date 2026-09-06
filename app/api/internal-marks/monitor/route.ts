/**
 * GET /api/internal-marks/monitor
 *
 * Admin/faculty IA-completeness monitor. Reads the COE database DIRECTLY (via
 * the service-role coe-db-client), so it works even while the COE REST API key
 * is expired — the app's student-facing CIA pass-through is REST-based and can
 * be down; this monitor is not.
 *
 * Modes:
 *   • no `sessionCode`  → returns { sessions } for the picker.
 *   • with `sessionCode` → returns { rows } — per course: CIA entry state
 *     (draft/submitted/verified/approved/locked) joined with whether final marks
 *     are published, plus a mismatch flag.
 *
 * Scope: super-admins may pass any `institutionId`; everyone else is locked to
 * their own institution (resolveInternalMarksAccess). The MyJKKN institution is
 * resolved to a COE institution_code directly from the COE DB.
 *
 * Grain caveat: the COE summary views aggregate at course_code × program grain,
 * so `cia.total_entries` counts CIA rows, not distinct students — it is a
 * completeness signal, not a per-student reconciliation (that is the separate
 * attendance↔IA reconciliation view).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import {
  isCoeDbConfigured,
  getCoeExaminationSessions,
  getCoeCiaSummary,
  getCoeFinalSummary,
  resolveCoeInstitutionByMyjkknId,
  type CoeCiaCourseSummary,
} from '@/lib/services/coe/coe-db-client';

type CiaStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'locked';

interface MonitorRow {
  course_code: string | null;
  course_name: string | null;
  program_code: string | null;
  faculty_name: string | null;
  cia: {
    total_entries: number;
    draft: number;
    submitted: number;
    verified: number;
    approved: number;
    locked: number;
    avg_percentage: number | null;
    status: CiaStatus;
  };
  finals: {
    total_students: number;
    published: number;
    passed: number;
    failed: number;
  } | null;
  flags: string[];
}

const n = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0);

function ciaStatus(c: CoeCiaCourseSummary): CiaStatus {
  if (n(c.locked_count) > 0) return 'locked';
  if (n(c.approved_count) > 0) return 'approved';
  if (n(c.verified_count) > 0) return 'verified';
  if (n(c.submitted_count) > 0) return 'submitted';
  return 'draft';
}

interface FinalsAgg {
  total_students: number;
  published: number;
  passed: number;
  failed: number;
}

export async function GET(request: NextRequest) {
  try {
    if (!isCoeDbConfigured()) {
      return NextResponse.json(
        { error: 'COE database is not configured on the server.' },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    if (!scope.isSuperAdmin && !scope.institutionId) {
      return NextResponse.json(
        { error: 'You do not have access to internal-marks data.' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(
      scope,
      searchParams.get('institutionId'),
    );

    // Resolve the COE institution for scoping (skip only for super-admin with no
    // institution chosen → show all institutions for the session).
    let institutionCode: string | undefined;
    let institutionName: string | null = null;
    if (institutionId) {
      const coeInst = await resolveCoeInstitutionByMyjkknId(institutionId);
      if (!coeInst) {
        return NextResponse.json(
          { error: 'This institution is not mapped in COE.' },
          { status: 404 },
        );
      }
      institutionCode = coeInst.institutionCode;
      institutionName = coeInst.name;
    }

    const sessionCode = searchParams.get('sessionCode');

    // Picker mode: no session chosen yet.
    if (!sessionCode) {
      const coeInstId = institutionId
        ? (await resolveCoeInstitutionByMyjkknId(institutionId))?.coeId
        : undefined;
      const sessions = await getCoeExaminationSessions(coeInstId);
      return NextResponse.json({ sessions, institution: institutionName });
    }

    // Monitor mode.
    const [cia, finals] = await Promise.all([
      getCoeCiaSummary(sessionCode, institutionCode),
      getCoeFinalSummary(sessionCode, institutionCode),
    ]);

    // CIA summary rows are program-agnostic (program_code is null); final-marks
    // summary rows are per program. So join on course_code alone and aggregate
    // a course's finals across all its programs, then compare against its CIA.
    const finalsByCourse = new Map<string, FinalsAgg>();
    for (const f of finals) {
      const k = f.course_code ?? '';
      const agg = finalsByCourse.get(k) ?? {
        total_students: 0,
        published: 0,
        passed: 0,
        failed: 0,
      };
      agg.total_students += n(f.total_students);
      agg.published += n(f.published_count);
      agg.passed += n(f.passed_count);
      agg.failed += n(f.failed_count);
      finalsByCourse.set(k, agg);
    }

    const rows: MonitorRow[] = cia.map((c) => {
      const f = finalsByCourse.get(c.course_code ?? '') ?? null;
      const flags: string[] = [];
      const status = ciaStatus(c);
      const published = f ? f.published : 0;

      if (published === 0) {
        flags.push('cia_entered_not_finalized');
      }
      if (status === 'draft') flags.push('cia_still_draft');
      if (f && published > 0 && published < f.total_students) {
        flags.push('finals_partially_published');
      }

      return {
        course_code: c.course_code,
        course_name: c.course_name,
        program_code: c.program_code,
        faculty_name: c.faculty_name,
        cia: {
          total_entries: n(c.total_entries),
          draft: n(c.draft_count),
          submitted: n(c.submitted_count),
          verified: n(c.verified_count),
          approved: n(c.approved_count),
          locked: n(c.locked_count),
          avg_percentage: c.avg_internal_percentage,
          status,
        },
        finals: f,
        flags,
      };
    });

    // Stable, useful ordering: rows needing attention first, then by course.
    rows.sort((a, b) => {
      if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length;
      return (a.course_code ?? '').localeCompare(b.course_code ?? '');
    });

    const summary = {
      total_courses: rows.length,
      needs_attention: rows.filter((r) => r.flags.length > 0).length,
      finalized: rows.filter((r) => n(r.finals?.published) > 0).length,
    };

    return NextResponse.json({
      sessionCode,
      institution: institutionName,
      summary,
      rows,
    });
  } catch (error) {
    console.error('[internal-marks/monitor] error:', error);
    return NextResponse.json(
      { error: 'Failed to load internal-marks monitor.' },
      { status: 500 },
    );
  }
}
