/**
 * GET /api/learners/my-marks/result-view
 *
 * Single-call proxy to COE /api/v1/student-result-view — returns the calling
 * student's ENTIRE multi-semester result view (every semester, regular + arrear
 * courses, marks, grades, SGPA, grade-band legend) in one request. Replaces the
 * old ~20-call fan-out (registrations + results + course-mapping + courses +
 * grade-system) for the Result tab.
 *
 * Security: we pass the caller's OWN register_number + their COE institution, so
 * COE resolves and returns only this learner (a student can never read another).
 *
 * Resilience: fails soft on 429 (returns an empty view, never propagates the
 * rate-limit error) so a burst can't trigger a client retry storm.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  emptyResultView,
  fetchLearnerResultView,
} from '@/lib/services/coe/learner-result-view';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';

// The COE access path (REST → DB fallback, 429 soft-fail, legacy shape
// normalisation) lives in lib/services/coe/learner-result-view.ts and is shared
// with the CDC willingness flow. This route only authorises the caller.

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
      .select('register_number, institution_id')
      .eq('id', profile.learner_id)
      .single();

    const registerNumber = learner?.register_number;
    const institutionId = learner?.institution_id;
    if (!registerNumber || !institutionId) {
      return NextResponse.json(
        { error: 'Student profile incomplete' },
        { status: 422 }
      );
    }

    const result = await fetchLearnerResultView({
      learnerId: profile.learner_id,
      registerNumber,
      institutionId,
    });

    if (result.institutionUnmapped) {
      console.warn(
        `[my-marks/result-view] 404 institution-not-mapped: register_number=${registerNumber} myjkkn_institution_id=${institutionId}`
      );
      return NextResponse.json(
        { error: 'Institution not mapped in COE', institution_id: institutionId },
        { status: 404 }
      );
    }

    if (result.source === 'rate_limited') {
      console.warn(
        '[my-marks/result-view] COE 429 (rate limited) — returning empty view to avoid retry storm'
      );
      return NextResponse.json({ data: emptyResultView(registerNumber) });
    }

    if (!result.view) {
      const err = result.error;
      if (err instanceof CoeApiError) {
        return NextResponse.json(
          { error: err.message, details: err.details },
          { status: err.status }
        );
      }
      throw err ?? new Error('Result view unavailable');
    }

    if (result.source === 'coe_db') {
      console.warn(
        `[my-marks/result-view] COE REST unavailable → served ${result.view.sessions.length} session(s) from COE DB fallback for ${registerNumber}`
      );
    } else {
      console.warn(
        `[my-marks/result-view] register_number=${registerNumber} → ${result.view.sessions.length} tab(s) from COE REST`
      );
    }

    const res = NextResponse.json({ data: result.view });
    // Published results are immutable; cache briefly to ease repeat views.
    res.headers.set(
      'Cache-Control',
      'private, max-age=30, stale-while-revalidate=120'
    );
    return res;
  } catch (error) {
    if (error instanceof CoeApiError) {
      console.warn(`[my-marks/result-view] ${error.status} COE-error: ${error.message}`);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/result-view] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your result' },
      { status: 500 }
    );
  }
}
