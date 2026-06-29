export const dynamic = 'force-dynamic';

// ============================================
// ENQUIRY BULK-EDIT APPLY (NON-ACTIVE LEARNERS)
// ============================================
// Created: 2026-06-29
// Purpose: Update a safe subset of fields on existing non-active (enquiry-stage)
//   learners from an uploaded, id-keyed Excel file. Update-only — no creates.
// Endpoint: POST /api/learners/enquiries/bulk-edit-apply
// Access: SUPER ADMIN ONLY.
// Reuses BulkLearnerEditService.processBulkEdit(..., requireActive=false).
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  BulkLearnerEditService,
  type BulkEditRow
} from '@/lib/services/bulk-learner-edit-service';
import { LearnerValidationService } from '@/lib/services/learner-validation-service';
import { parseExcelFile, mapColumns } from '@/lib/utils/excel-parser';
import {
  ENQUIRY_BULK_EDIT_COLUMN_MAPPING,
  buildSanitizedEnquiryRow
} from '@/lib/utils/enquiry-bulk-edit-columns';

export async function POST(request: NextRequest) {
  await connection();
  try {
    // 1. Authenticate
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Super-admin-only gate
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    if (!profileData.is_super_admin) {
      return NextResponse.json(
        { success: false, error: 'Bulk edit is restricted to super admins.' },
        { status: 403 }
      );
    }

    // 3. Parse the uploaded file (data sheet is named "Enquiries")
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const parseResult = await parseExcelFile(file, 'Enquiries');

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: parseResult.errors.join(', ') },
        { status: 400 }
      );
    }

    if (parseResult.totalRows === 0) {
      return NextResponse.json({ success: false, error: 'No data found in file' }, { status: 400 });
    }

    // 4. Map → sanitize (safe subset only) → validate each row
    const bulkEditRows: BulkEditRow[] = [];
    for (const parsedRow of parseResult.rows) {
      const mappedData = mapColumns(parsedRow.data, ENQUIRY_BULK_EDIT_COLUMN_MAPPING);
      const sanitizedData = buildSanitizedEnquiryRow(mappedData);
      const validation = LearnerValidationService.validateBulkEditExited(sanitizedData);
      bulkEditRows.push({
        rowNumber: parsedRow.rowNumber,
        data: sanitizedData,
        validation
      });
    }

    // 5. Apply — non-active scope (requireActive=false). The service resolves
    //    community/caste labels to FKs, updates only non-empty mapped fields,
    //    and pins the update to lifecycle_status != 'active' for safety.
    const result = await BulkLearnerEditService.processBulkEdit(
      bulkEditRows,
      profileData.institution_id || undefined,
      true, // super admin (route is gated)
      user.id,
      false // requireActive=false → enquiry (non-active) scope
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/learners/enquiries/bulk-edit-apply] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
