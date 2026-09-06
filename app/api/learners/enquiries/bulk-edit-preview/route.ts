export const dynamic = 'force-dynamic';

// ============================================
// ENQUIRY BULK-EDIT PREVIEW (NON-ACTIVE LEARNERS)
// ============================================
// Created: 2026-06-29
// Purpose: Preview the field-by-field changes an uploaded file would apply to
//   non-active (enquiry-stage) learners, before the super admin confirms.
// Endpoint: POST /api/learners/enquiries/bulk-edit-preview
// Access: SUPER ADMIN ONLY.
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkLearnerEditService } from '@/lib/services/bulk-learner-edit-service';
import { parseExcelFile, mapColumns } from '@/lib/utils/excel-parser';
import {
  ENQUIRY_BULK_EDIT_COLUMN_MAPPING,
  buildSanitizedEnquiryRow
} from '@/lib/utils/enquiry-bulk-edit-columns';

interface PreviewRow {
  learnerId: string;
  learnerName: string;
  rowNumber: number;
  changes: Array<{ field: string; fieldLabel: string; oldValue: any; newValue: any }>;
  status: 'valid' | 'error' | 'no_changes';
  error?: string;
}

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

    // 3. Parse the uploaded file (the export's data sheet is named "Enquiries")
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

    // 4. Build preview, one row at a time
    const previewRows: PreviewRow[] = [];

    for (const parsedRow of parseResult.rows) {
      const mappedData = mapColumns(parsedRow.data, ENQUIRY_BULK_EDIT_COLUMN_MAPPING);
      const sanitizedData = buildSanitizedEnquiryRow(mappedData);
      const learnerId = sanitizedData.id;

      const validation = await BulkLearnerEditService.previewChanges(
        learnerId,
        sanitizedData,
        profileData.institution_id || undefined,
        true, // super admin (route is gated)
        false // requireActive=false → enquiry (non-active) scope
      );

      if (!validation.exists) {
        previewRows.push({
          learnerId,
          learnerName: 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'error',
          error: learnerId ? 'Learner not found' : 'Missing ID (do not edit the ID* column)'
        });
        continue;
      }

      if (!validation.eligible) {
        previewRows.push({
          learnerId,
          learnerName: validation.learnerName || 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'error',
          error: 'Learner is an active student — edit it from the Profiles page'
        });
        continue;
      }

      if (validation.changes.length === 0) {
        previewRows.push({
          learnerId,
          learnerName: validation.learnerName || 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'no_changes',
          error: 'No changes detected'
        });
        continue;
      }

      previewRows.push({
        learnerId,
        learnerName: validation.learnerName || 'Unknown',
        rowNumber: parsedRow.rowNumber,
        changes: validation.changes,
        status: 'valid'
      });
    }

    return NextResponse.json({
      success: true,
      total_rows: previewRows.length,
      valid_changes: previewRows.filter((r) => r.status === 'valid').length,
      no_changes: previewRows.filter((r) => r.status === 'no_changes').length,
      errors: previewRows.filter((r) => r.status === 'error').length,
      preview: previewRows
    });
  } catch (error) {
    console.error('[api/learners/enquiries/bulk-edit-preview] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
