// ============================================
// BULK UPLOAD PREVIEW VALIDATION API
// ============================================
// Created: 2025-12-29
// Purpose: Validate academic field values BEFORE upload for complete validation
// Endpoint: POST /api/learners/validate-bulk-upload-preview
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkValidationBatchService, type BatchValidationInput } from '@/lib/services/bulk-validation-batch-service';

/**
 * POST /api/learners/validate-bulk-upload-preview
 * Validate all unique academic field values before bulk upload
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

    // 2. Get user's profile and institution
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

    const profile = profileData as {
      id: string;
      role: string;
      is_super_admin: boolean | null;
      institution_id: string | null;
    };

    // 3. Parse request body
    const body = await request.json();
    const { uniqueValues } = body as { uniqueValues: BatchValidationInput['uniqueValues'] };

    if (!uniqueValues) {
      return NextResponse.json(
        {
          success: false,
          error: 'No values provided for validation'
        },
        { status: 400 }
      );
    }

    // 4. Validate with batch service
    const validationInput: BatchValidationInput = {
      institutionId: profile.institution_id || undefined,
      uniqueValues
    };

    const validationResult = await BulkValidationBatchService.validateBatch(validationInput);

    // 5. Convert Maps to plain objects for JSON serialization
    const serializedResult = {
      institutions: Object.fromEntries(validationResult.institutions),
      programs: Object.fromEntries(validationResult.programs),
      semesters: Object.fromEntries(validationResult.semesters),
      sections: Object.fromEntries(validationResult.sections),
      degrees: Object.fromEntries(validationResult.degrees),
      departments: Object.fromEntries(validationResult.departments),
      academicYears: Object.fromEntries(validationResult.academicYears)
    };

    return NextResponse.json({
      success: true,
      validationResult: serializedResult
    });

  } catch (error) {
    console.error('[api/learners/validate-bulk-upload-preview] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
