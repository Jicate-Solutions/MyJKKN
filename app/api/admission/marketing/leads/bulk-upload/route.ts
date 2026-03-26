// app/api/admission/marketing/leads/bulk-upload/route.ts
// Server-side bulk upload endpoint for marketing leads.
// Uses service role client to bypass RLS and avoid the 8-second PostgREST timeout.
// Processes inserts in small batches (100 rows) for reliability.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import {
  normalizeGender,
  cleanMobileNumber,
  cleanPincode,
} from '@/lib/utils/mappings/marketing-leads-excel-mappings';

const BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  await connection();

  // Verify auth
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { leads, batchId, institutionId, fileName, userId } = body as {
      leads: Array<Record<string, string>>;
      batchId: string;
      institutionId: string;
      fileName: string;
      userId?: string;
    };

    if (!institutionId || !batchId || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: institutionId, batchId, leads' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    let inserted = 0;
    const errors: Array<{ row: number; message: string }> = [];

    // Normalize all rows upfront
    const rows = leads.map((lead) => ({
      institution_id: institutionId,
      district: lead.district?.trim() || null,
      sub_district: lead.sub_district?.trim() || null,
      student_name: lead.student_name?.trim() || '',
      father_name: lead.father_name?.trim() || null,
      gender: normalizeGender(lead.gender) || null,
      community: lead.community?.trim() || null,
      mobile_number: cleanMobileNumber(lead.mobile_number) || null,
      group_detail: lead.group_detail?.trim() || null,
      address: lead.address?.trim() || null,
      pincode: cleanPincode(lead.pincode) || null,
      school_name: lead.school_name?.trim() || null,
      upload_batch_id: batchId,
      uploaded_by: userId || null,
      upload_file_name: fileName,
      created_by: userId || null,
    }));

    // Insert in small batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const { error: insertError } = await supabase
        .from('marketing_leads_database')
        .insert(batch as any);

      if (insertError) {
        console.error(
          `[admission/marketing-leads-db] Server batch error (rows ${i + 1}-${i + batch.length}):`,
          insertError
        );
        // Record error but continue with remaining batches
        for (let j = 0; j < batch.length; j++) {
          errors.push({
            row: i + j + 1,
            message: insertError.message || 'Database insert failed',
          });
        }
      } else {
        inserted += batch.length;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      total_rows: leads.length,
      valid_rows: leads.length,
      invalid_rows: 0,
      inserted,
      failed: errors.length,
      errors: errors.slice(0, 50), // Cap error detail to prevent huge responses
      upload_batch_id: batchId,
    });
  } catch (err) {
    console.error('[admission/marketing-leads-db] Bulk upload route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
