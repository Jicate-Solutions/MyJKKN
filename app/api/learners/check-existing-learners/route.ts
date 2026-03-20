// ============================================
// CHECK EXISTING LEARNERS API
// ============================================
// Created: 2026-01-07
// Purpose: Check if learners already exist before bulk upload
// Endpoint: POST /api/learners/check-existing-learners
// Security: Users can only check their own institution
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface ExistingLearnerCheck {
  student_email?: string;
  student_mobile?: string;
  college_email?: string;
  first_name: string;
  last_name?: string;
  rowNumber: number;
}

export interface ExistingLearnerResult {
  rowNumber: number;
  exists: boolean;
  matchedBy: ('student_email' | 'student_mobile' | 'college_email')[];
  existingLearner?: {
    id: string;
    first_name: string;
    last_name: string;
    student_email: string;
    student_mobile: string;
    college_email: string | null;
    lifecycle_status: string;
    created_at: string;
  };
}

/**
 * POST /api/learners/check-existing-learners
 * Check if learners already exist in database
 *
 * Request body:
 * {
 *   learners: ExistingLearnerCheck[]
 * }
 *
 * Response:
 * {
 *   success: true,
 *   results: ExistingLearnerResult[],
 *   summary: {
 *     total: number,
 *     duplicates: number,
 *     new: number
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized'
        },
        { status: 401 }
      );
    }

    // 2. Get user's profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch user profile'
        },
        { status: 500 }
      );
    }

    // 3. Parse request body
    const body = await request.json();
    const { learners } = body as { learners: ExistingLearnerCheck[] };

    if (!learners || !Array.isArray(learners) || learners.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No learners provided for checking'
        },
        { status: 400 }
      );
    }

    // 4. Extract unique identifiers for batch query
    const studentEmails = learners
      .map(l => l.student_email?.toLowerCase().trim())
      .filter((email): email is string => !!email);

    const studentMobiles = learners
      .map(l => l.student_mobile?.trim())
      .filter((mobile): mobile is string => !!mobile);

    const collegeEmails = learners
      .map(l => l.college_email?.toLowerCase().trim())
      .filter((email): email is string => !!email && email !== '');

    // 5. Query database for existing learners
    let query = supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, student_email, student_mobile, college_email, lifecycle_status, created_at');

    // Build OR conditions
    const orConditions: string[] = [];

    if (studentEmails.length > 0) {
      orConditions.push(`student_email.in.(${studentEmails.map(e => `"${e}"`).join(',')})`);
    }

    if (studentMobiles.length > 0) {
      orConditions.push(`student_mobile.in.(${studentMobiles.map(m => `"${m}"`).join(',')})`);
    }

    if (collegeEmails.length > 0) {
      orConditions.push(`college_email.in.(${collegeEmails.map(e => `"${e}"`).join(',')})`);
    }

    if (orConditions.length === 0) {
      // No identifiers to check - all learners are new
      return NextResponse.json({
        success: true,
        results: learners.map(l => ({
          rowNumber: l.rowNumber,
          exists: false,
          matchedBy: []
        })),
        summary: {
          total: learners.length,
          duplicates: 0,
          new: learners.length
        }
      });
    }

    // Execute query with OR conditions
    const { data: existingLearners, error: queryError } = await query.or(orConditions.join(','));

    if (queryError) {
      console.error('[check-existing-learners] Database query error:', queryError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to check existing learners'
        },
        { status: 500 }
      );
    }

    // 6. Map existing learners for quick lookup
    const existingByEmail = new Map<string, typeof existingLearners[0]>();
    const existingByMobile = new Map<string, typeof existingLearners[0]>();
    const existingByCollegeEmail = new Map<string, typeof existingLearners[0]>();

    existingLearners?.forEach(learner => {
      if (learner.student_email) {
        existingByEmail.set(learner.student_email.toLowerCase().trim(), learner);
      }
      if (learner.student_mobile) {
        existingByMobile.set(learner.student_mobile.trim(), learner);
      }
      if (learner.college_email) {
        existingByCollegeEmail.set(learner.college_email.toLowerCase().trim(), learner);
      }
    });

    // 7. Check each learner
    const results: ExistingLearnerResult[] = learners.map(learner => {
      const matchedBy: ('student_email' | 'student_mobile' | 'college_email')[] = [];
      let existingLearner: typeof existingLearners[0] | undefined;

      // Check student_email (most reliable)
      if (learner.student_email) {
        const email = learner.student_email.toLowerCase().trim();
        const match = existingByEmail.get(email);
        if (match) {
          matchedBy.push('student_email');
          existingLearner = match;
        }
      }

      // Check student_mobile
      if (learner.student_mobile) {
        const mobile = learner.student_mobile.trim();
        const match = existingByMobile.get(mobile);
        if (match && !existingLearner) {
          matchedBy.push('student_mobile');
          existingLearner = match;
        } else if (match && existingLearner?.id === match.id) {
          matchedBy.push('student_mobile');
        }
      }

      // Check college_email (if provided and not empty)
      if (learner.college_email && learner.college_email.trim() !== '') {
        const email = learner.college_email.toLowerCase().trim();
        const match = existingByCollegeEmail.get(email);
        if (match && !existingLearner) {
          matchedBy.push('college_email');
          existingLearner = match;
        } else if (match && existingLearner?.id === match.id) {
          matchedBy.push('college_email');
        }
      }

      return {
        rowNumber: learner.rowNumber,
        exists: matchedBy.length > 0,
        matchedBy,
        existingLearner: existingLearner ? {
          id: existingLearner.id,
          first_name: existingLearner.first_name,
          last_name: existingLearner.last_name || '',
          student_email: existingLearner.student_email,
          student_mobile: existingLearner.student_mobile,
          college_email: existingLearner.college_email || null,
          lifecycle_status: existingLearner.lifecycle_status,
          created_at: existingLearner.created_at
        } : undefined
      };
    });

    // 8. Calculate summary
    const duplicateCount = results.filter(r => r.exists).length;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: learners.length,
        duplicates: duplicateCount,
        new: learners.length - duplicateCount
      }
    });

  } catch (error) {
    console.error('[api/learners/check-existing-learners] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
