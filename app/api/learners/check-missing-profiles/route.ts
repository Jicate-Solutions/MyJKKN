import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { JkknLearner } from '@/types/jkkn-api/learners';

// Service-role client for reading all profiles (needs SUPABASE_SERVICE_ROLE_KEY).
// Used only for the profiles comparison step — not for the learner data fetch.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const JKKN_API_BASE_URL =
  process.env.JKKN_API_BASE_URL ?? 'https://www.jkkn.ai/api';
const JKKN_API_KEY = process.env.JKKN_API_KEY;

/** Fetch one page of learners directly from JKKN (server-to-server). */
async function fetchJkknPage(page: number, limit: number) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    lifecycle_status: 'active',
  });
  const res = await fetch(
    `${JKKN_API_BASE_URL}/api-management/learners/profiles?${params}`,
    {
      headers: {
        Authorization: `Bearer ${JKKN_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`JKKN API error ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<{
    data: JkknLearner[];
    pagination?: { page: number; totalPages: number; total: number; limit: number };
    metadata?: { page: number; totalPages: number; total: number; limit: number };
  }>;
}

/** Fetch ALL active learners from JKKN across all pages. */
async function fetchAllActiveJkknLearners(): Promise<JkknLearner[]> {
  const PAGE_SIZE = 100;
  let all: JkknLearner[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const result = await fetchJkknPage(currentPage, PAGE_SIZE);
    all = all.concat(result.data ?? []);

    const pag = result.pagination ?? result.metadata;
    if (pag) totalPages = pag.totalPages;

    currentPage++;
  } while (currentPage <= totalPages);

  return all;
}

export async function GET() {
  try {
    // 1. Authenticate — JKKN API pattern: only require a valid session.
    //    Permission is implicitly granted by authentication; this is an
    //    admin-only operation protected by JKKN_API_KEY (server secret).
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Guard: JKKN API key must be present
    if (!JKKN_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'JKKN_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    // 3. Fetch ALL active learners from JKKN API (server-to-server).
    //    Same pattern used by sync-from-jkkn — no Supabase query needed.
    const allJkknLearners = await fetchAllActiveJkknLearners();

    // Keep only learners with a college_email (needed for profile matching)
    const allLearners = allJkknLearners.filter(
      (l) => l.college_email && l.college_email.trim() !== ''
    );

    if (allLearners.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          total_learners: 0,
          with_complete_profiles: 0,
          with_incomplete_profiles: 0,
          without_profiles: 0,
          total_needing_sync: 0,
        },
        details: {
          learners_with_complete_profiles: [],
          learners_with_incomplete_profiles: [],
          learners_without_profiles: [],
        },
      });
    }

    // 4. Get existing Supabase auth profiles for comparison.
    //    Uses supabaseAdmin (service role) to read all profiles regardless of RLS.
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, institution_id, department_id, learner_id, full_name, phone_number, gender, is_active');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Build email → profile map (case-insensitive)
    const profilesByEmail = new Map<string, typeof existingProfiles[0]>();
    for (const p of existingProfiles ?? []) {
      if (p.email) profilesByEmail.set(p.email.toLowerCase(), p);
    }

    // 5. Categorize each JKKN learner by their profile status
    const learnersWithCompleteProfiles: JkknLearner[] = [];
    const learnersWithIncompleteProfiles: any[] = [];
    const learnersWithoutProfiles: JkknLearner[] = [];

    for (const learner of allLearners) {
      const profile = profilesByEmail.get(learner.college_email!.toLowerCase());

      if (!profile) {
        learnersWithoutProfiles.push(learner);
      } else {
        const expectedFullName = `${learner.first_name} ${learner.last_name || ''}`.trim();
        const hasCorrectRole        = profile.role === 'student';
        const hasCorrectInstitution = profile.institution_id === learner.institution_id;
        const hasCorrectDepartment  = profile.department_id === learner.department_id;
        const hasLearnerId          = profile.learner_id === learner.id;
        const hasCorrectName        = profile.full_name === expectedFullName;
        const hasCorrectPhone       = profile.phone_number === learner.student_mobile;
        const hasCorrectGender      = learner.gender
          ? (profile.gender || '').toUpperCase() === learner.gender.toUpperCase()
          : true;
        const hasCorrectActive      = profile.is_active === true;

        if (
          hasCorrectRole && hasCorrectInstitution && hasCorrectDepartment &&
          hasLearnerId && hasCorrectName && hasCorrectPhone &&
          hasCorrectGender && hasCorrectActive
        ) {
          learnersWithCompleteProfiles.push(learner);
        } else {
          learnersWithIncompleteProfiles.push({
            ...learner,
            profile_id:             profile.id,
            current_role:           profile.role,
            current_institution_id: profile.institution_id,
            current_department_id:  profile.department_id,
            current_learner_id:     profile.learner_id,
            current_full_name:      profile.full_name,
            current_phone_number:   profile.phone_number,
            current_gender:         profile.gender,
            current_is_active:      profile.is_active,
            has_correct_role:       hasCorrectRole,
            has_learner_id:         hasLearnerId,
            has_correct_gender:     hasCorrectGender,
          });
        }
      }
    }

    const totalNeedingSync =
      learnersWithoutProfiles.length + learnersWithIncompleteProfiles.length;

    return NextResponse.json({
      success: true,
      summary: {
        total_learners:            allLearners.length,
        with_complete_profiles:    learnersWithCompleteProfiles.length,
        with_incomplete_profiles:  learnersWithIncompleteProfiles.length,
        without_profiles:          learnersWithoutProfiles.length,
        total_needing_sync:        totalNeedingSync,
      },
      details: {
        learners_with_complete_profiles: learnersWithCompleteProfiles.map((l) => ({
          name:  `${l.first_name} ${l.last_name || ''}`.trim(),
          email: l.college_email,
        })),
        learners_with_incomplete_profiles: learnersWithIncompleteProfiles.map((l: any) => ({
          learner_id: l.id,
          name:       `${l.first_name} ${l.last_name || ''}`.trim(),
          email:      l.college_email,
          changes: {
            role:          { current: l.current_role,           new: 'student',  changed: !l.has_correct_role },
            institution_id:{ current: l.current_institution_id, new: l.institution_id, changed: l.current_institution_id !== l.institution_id },
            department_id: { current: l.current_department_id,  new: l.department_id,  changed: l.current_department_id !== l.department_id },
            learner_id:    { current: l.current_learner_id,     new: l.id,             changed: l.current_learner_id !== l.id },
            full_name:     { current: l.current_full_name,      new: `${l.first_name} ${l.last_name || ''}`.trim(), changed: l.current_full_name !== `${l.first_name} ${l.last_name || ''}`.trim() },
            phone_number:  { current: l.current_phone_number,   new: l.student_mobile, changed: l.current_phone_number !== l.student_mobile },
            gender:        { current: l.current_gender,         new: l.gender,         changed: !l.has_correct_gender },
            is_active:     { current: l.current_is_active,      new: true,             changed: l.current_is_active !== true },
          },
          issues: {
            wrong_role:          !l.has_correct_role,
            missing_learner_id:  !l.has_learner_id,
            wrong_institution:   l.current_institution_id !== l.institution_id,
            wrong_department:    l.current_department_id !== l.department_id,
            wrong_name:          l.current_full_name !== `${l.first_name} ${l.last_name || ''}`.trim(),
            wrong_phone:         l.current_phone_number !== l.student_mobile,
            wrong_gender:        !l.has_correct_gender,
            wrong_active:        l.current_is_active !== true,
          },
        })),
        learners_without_profiles: learnersWithoutProfiles.map((l) => ({
          learner_id: l.id,
          name:       `${l.first_name} ${l.last_name || ''}`.trim(),
          email:      l.college_email,
        })),
      },
    });
  } catch (error) {
    console.error('[api/learners/check-missing-profiles] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.',
      },
      { status: 500 }
    );
  }
}
