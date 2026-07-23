/**
 * GET /api/learners/my-marks/grade-system
 *
 * Read-only proxy to COE /api/v1/grade-system. Returns the grade bands
 * (grade letter, grade point, mark range, description) for the calling
 * student's institution so the Result tab can decorate each subject with a
 * human grade description ("Outstanding", "Distinction", ...).
 *
 * No per-student filtering is needed — grade bands are institution-level
 * reference data, not personal data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type { MyMarksGradeBand } from '@/types/my-marks';

interface CoeGradeRow {
  grade?: string;
  grade_point?: number | null;
  min_mark?: number | null;
  max_mark?: number | null;
  description?: string | null;
  is_active?: boolean;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = await StudentValidationService.validateStudentAccess(user.id);
    if (!validation.allowed) {
      return NextResponse.json(
        { error: 'Forbidden', reason: validation.reason },
        { status: 403 }
      );
    }

    const adminClient = createServiceRoleClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.learner_id || profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const { data: learner } = await adminClient
      .from('learners_profiles')
      .select('institution_id, degree_id')
      .eq('id', profile.learner_id)
      .single();

    const institutionId = learner?.institution_id;
    if (!institutionId) {
      return NextResponse.json(
        { error: 'Student profile incomplete' },
        { status: 422 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json(
        { error: 'Institution not mapped in COE' },
        { status: 404 }
      );
    }

    // Resolve the student's level (UG/PG) from their degree, so we fetch the
    // correct grade band set. degrees.degree_type is 'ug' | 'pg'; the COE
    // grade_system_code uses the upper-cased form ('UG' | 'PG').
    let gradeSystemCode: string | null = null;
    if (learner?.degree_id) {
      const { data: degree } = await adminClient
        .from('degrees')
        .select('degree_type')
        .eq('id', learner.degree_id)
        .maybeSingle();
      const dt = degree?.degree_type?.toString().trim().toLowerCase();
      if (dt === 'ug') gradeSystemCode = 'UG';
      else if (dt === 'pg') gradeSystemCode = 'PG';
    }

    const client = CoeRestClient.create();

    // Fetch grade bands. Try the UG/PG-scoped set first; if that yields nothing
    // (e.g. the level mis-resolved, or COE has no rows under that code), retry
    // unscoped so the grade reference still renders for the student.
    const fetchBands = async (
      code: string | undefined
    ): Promise<CoeGradeRow[]> => {
      try {
        const raw = await client.get<{ data: CoeGradeRow[] } | CoeGradeRow[]>(
          '/api/v1/grade-system',
          {
            institution_id: coeInstitutionId,
            grade_system_code: code,
            is_active: 'true',
          },
          { cacheTtlMs: 5 * 60 * 1000 } // grade bands rarely change — cache 5 min
        );
        return Array.isArray(raw) ? raw : raw.data ?? [];
      } catch (err) {
        if (err instanceof CoeApiError) {
          if (err.status === 403) {
            // Permission not granted for this endpoint. The grade system is an
            // enhancement (descriptions + legend) — never let it break the page.
            console.warn(
              '[my-marks/grade-system] COE returned 403 — the API key is missing the `grade-system:read` permission. ' +
                'Grant it to this app in the COE Developer Portal. Grade descriptions and the legend stay hidden until then.'
            );
            return [];
          }
          if (err.status === 404 || err.status === 400) return [];
        }
        throw err;
      }
    };

    let rows = await fetchBands(gradeSystemCode ?? undefined);
    if (rows.length === 0 && gradeSystemCode) {
      console.warn(
        `[my-marks/grade-system] no bands for grade_system_code=${gradeSystemCode}; retrying unscoped`
      );
      rows = await fetchBands(undefined);
    }

    // Dedupe by grade letter — guards against the unscoped fallback returning
    // both UG and PG rows for the same letter.
    const seen = new Set<string>();
    const bands: MyMarksGradeBand[] = rows
      .filter((r) => !!r.grade)
      .filter((r) => {
        const key = r.grade!.toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({
        grade: r.grade!,
        grade_point: r.grade_point ?? null,
        min_mark: r.min_mark ?? null,
        max_mark: r.max_mark ?? null,
        description: r.description ?? null,
        is_active: r.is_active,
      }));

    const res = NextResponse.json({
      data: { bands, grade_system_code: gradeSystemCode },
    });
    // Reference data — cache aggressively to avoid re-hitting COE per semester.
    res.headers.set(
      'Cache-Control',
      'private, max-age=300, stale-while-revalidate=600'
    );
    return res;
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/grade-system] error:', error);
    return NextResponse.json(
      { error: 'Failed to load grade system' },
      { status: 500 }
    );
  }
}
