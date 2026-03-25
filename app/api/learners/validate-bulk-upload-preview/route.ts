// ============================================
// BULK UPLOAD PREVIEW VALIDATION API
// ============================================
// Created: 2025-12-29
// Updated: 2026-01-06 - Fixed institution validation to cascade from Excel data
// Purpose: Validate academic field values BEFORE upload for complete validation
// Endpoint: POST /api/learners/validate-bulk-upload-preview
// Security: Super admins can validate any institution, regular users limited to their own
// Design: Service cascades validation (Institution→Department→Program→Semester→Section)
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

    // ========================================
    // 3.5. SECURITY: Institution Access Check
    // ========================================
    // Super admins can validate ANY institution (cross-institution uploads)
    // Regular users can ONLY validate their OWN institution
    // This prevents unauthorized cross-institution data access
    if (!profile.is_super_admin && uniqueValues.institutions && uniqueValues.institutions.length > 0) {
      // Regular user: must have an institution assigned
      if (!profile.institution_id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Your profile has no institution assigned. Please contact administrator.'
          },
          { status: 403 }
        );
      }

      // Get user's institution name from database
      const { data: userInstitution, error: instError } = await supabase
        .from('institutions')
        .select('name')
        .eq('id', profile.institution_id)
        .single();

      if (instError || !userInstitution) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to verify institution access'
          },
          { status: 500 }
        );
      }

      // Check if ALL institutions in Excel match user's institution (case-insensitive)
      const userInstitutionName = userInstitution.name.trim().toUpperCase();
      const unauthorizedInstitutions = uniqueValues.institutions.filter(
        (instName) => instName.trim().toUpperCase() !== userInstitutionName
      );

      if (unauthorizedInstitutions.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Access denied: You can only upload learners for your institution (${userInstitution.name}). The Excel file contains data for: ${unauthorizedInstitutions.join(', ')}. Super admin access is required for cross-institution uploads.`
          },
          { status: 403 }
        );
      }
    }

    // 4. Check for duplicate emails in database
    const duplicateEmailsMap = new Map<string, { found: boolean; error?: string; suggestions?: string[] }>();

    if (uniqueValues.emails && uniqueValues.emails.length > 0) {
      const { data: existingLearners } = await supabase
        .from('learners_profiles')
        .select('college_email')
        .in('college_email', uniqueValues.emails);

      const existingEmailsSet = new Set(
        existingLearners?.map(l => l.college_email.toLowerCase()) || []
      );

      uniqueValues.emails.forEach((email: string) => {
        const emailLower = email.toLowerCase();
        if (existingEmailsSet.has(emailLower)) {
          duplicateEmailsMap.set(emailLower, {
            found: true,
            error: 'Email already exists in database'
          });
        } else {
          duplicateEmailsMap.set(emailLower, {
            found: false
          });
        }
      });
    }

    // 5. Validate with batch service
    // CRITICAL: Do NOT pass profile.institution_id here
    // The service cascades from Excel institutions for accurate cross-institution validation
    // Passing user's institution breaks cascade for super admins and causes inconsistent results
    const validationInput: BatchValidationInput = {
      institutionId: undefined, // Let service cascade from Excel institutions (Step 1→2→3→4)
      uniqueValues
    };

    const validationResult = await BulkValidationBatchService.validateBatch(validationInput);

    // 6. Convert Maps to plain objects for JSON serialization
    const serializedResult = {
      institutions: Object.fromEntries(validationResult.institutions),
      programs: Object.fromEntries(validationResult.programs),
      semesters: Object.fromEntries(validationResult.semesters),
      sections: Object.fromEntries(validationResult.sections),
      degrees: Object.fromEntries(validationResult.degrees),
      departments: Object.fromEntries(validationResult.departments),
      academicYears: Object.fromEntries(validationResult.academicYears),
      regulations: Object.fromEntries(validationResult.regulations),
      batches: Object.fromEntries(validationResult.batches),
      duplicateEmails: Object.fromEntries(duplicateEmailsMap)
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
