// app/api/admission/consultants/import/route.ts
// Import API for bulk consultant upload

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { parseExcelFile } from '@/lib/utils/excel-parser';
import {
  CONSULTANT_COLUMN_MAPPING,
  CONSULTANT_REQUIRED_FIELDS,
  parseArrayField,
  parseNumberField,
  normalizeConsultantType,
  normalizeStatus,
  normalizeTier,
  cleanPhoneNumber,
  parseDateField,
} from '@/lib/utils/mappings/consultant-excel-mappings';

/**
 * Map Excel row data to DB fields using CONSULTANT_COLUMN_MAPPING.
 * The mapping is { excelHeader: dbField }, so we iterate over its entries
 * and look up each Excel header key in the raw row data.
 */
function mapConsultantRow(rowData: Record<string, any>): Record<string, any> {
  // Normalize row keys: strip trailing asterisks (template marks required fields with *)
  const normalizedRow: Record<string, any> = {};
  for (const [key, value] of Object.entries(rowData)) {
    normalizedRow[key.replace(/\*+$/, '').trim()] = value;
  }

  const mapped: Record<string, any> = {};
  for (const [excelHeader, dbField] of Object.entries(CONSULTANT_COLUMN_MAPPING)) {
    const value = normalizedRow[excelHeader];
    if (value !== undefined && value !== null && value !== '') {
      mapped[dbField] = value;
    }
  }
  return mapped;
}

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  duplicatePhones?: string[];
}

export async function POST(request: NextRequest) {
  console.log('[consultant-import] ===== POST received =====');
  try {
    // Auth client: verify user identity and fetch profile (respects RLS/JWT)
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    console.log('[consultant-import] auth:', user ? `user=${user.id.slice(0, 8)}` : `error=${authError?.message}`);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await authClient
      .from('profiles')
      .select('institution_id, full_name, is_super_admin')
      .eq('id', user.id)
      .single();
    console.log('[consultant-import] profile:', profile ? `institution_id=${profile.institution_id}, is_super_admin=${profile.is_super_admin}` : `error=${profileError?.message}`);

    // Service role client: bypasses RLS for bulk DB operations.
    // Required because education_consultants SELECT policy checks for a
    // consultant_institutions row that doesn't exist yet at insert time,
    // which blocks the RETURNING clause and makes successCount always 0.
    const supabase = createServiceRoleClient();

    // Parse form data first so we can read institution_id sent by super admins
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const formInstitutionId = formData.get('institution_id') as string | null;
    console.log('[consultant-import] file:', file ? `"${file.name}" ${file.size}B` : 'MISSING');

    // Resolve which institution to import into:
    // - Regular users: always use their own profile institution_id
    // - Super admins: no profile institution_id, must pass it in the form
    const institutionId: string | null = profile?.institution_id ?? formInstitutionId ?? null;

    if (!institutionId) {
      const msg = profile?.is_super_admin
        ? 'Please select an institution to import consultants into'
        : 'User must be associated with an institution';
      console.error('[consultant-import]', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      console.error('[consultant-import] Invalid file type:', file.name);
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    // Parse Excel file — no sheet name argument so parser uses the first available
    // sheet. The downloaded template has a "Consultants" sheet, but user-created
    // files typically use the default "Sheet1".
    console.log(`[consultant-import] Parsing file: "${file.name}" (${file.size} bytes)`);
    const parseResult = await parseExcelFile(file);
    console.log(`[consultant-import] Parse result: ${parseResult.rows.length} rows, ${parseResult.errors.length} errors`);
    if (parseResult.errors.length > 0) {
      console.error('[consultant-import] Parse errors:', parseResult.errors);
      return NextResponse.json(
        {
          success: false,
          successCount: 0,
          errorCount: 0,
          totalRows: 0,
          errors: parseResult.errors.map((msg) => ({ row: 0, message: msg })),
        },
        { status: 400 }
      );
    }

    if (parseResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          successCount: 0,
          errorCount: 0,
          totalRows: 0,
          errors: [{ row: 0, message: 'No data found in the file' }],
        },
        { status: 400 }
      );
    }
    console.log(`[consultant-import] First row keys: ${Object.keys(parseResult.rows[0]?.data || {}).join(', ')}`);

    // --- Duplicate detection ---
    // education_consultants is a global table (no institution_id column).
    // We check phone/email globally to prevent duplicate consultant profiles.
    const { data: existingConsultants } = await supabase
      .from('education_consultants')
      .select('phone, email');

    const existingPhones = new Set(
      existingConsultants?.map(c => cleanPhoneNumber(c.phone)).filter(Boolean) || []
    );
    const existingEmails = new Set(
      existingConsultants?.map(c => c.email?.toLowerCase()).filter(Boolean) || []
    );

    // --- Process rows ---
    const errors: ImportError[] = [];
    // Each entry holds the consultant profile + per-institution fields separately.
    const validRows: Array<{
      profile: Record<string, any>;
      tier: string;
      status: string;
      contract_start_date: string | null;
      contract_end_date: string | null;
    }> = [];
    const duplicatePhones: string[] = [];
    const seenPhones = new Set<string>();

    for (const row of parseResult.rows) {
      const rowNum = row.rowNumber;
      const mappedData = mapConsultantRow(row.data);

      // Validate required fields
      const missingFields = CONSULTANT_REQUIRED_FIELDS.filter(field => !mappedData[field]);
      if (missingFields.length > 0) {
        errors.push({
          row: rowNum,
          field: missingFields[0],
          message: `Missing required field(s): ${missingFields.join(', ')}`,
        });
        continue;
      }

      // Clean and validate phone
      const phone = cleanPhoneNumber(mappedData.phone);
      if (!phone || phone.length < 10) {
        errors.push({
          row: rowNum,
          field: 'phone',
          message: 'Invalid phone number (must be at least 10 digits)',
        });
        continue;
      }

      // Check for duplicate phone within the file
      if (seenPhones.has(phone)) {
        duplicatePhones.push(phone);
        errors.push({
          row: rowNum,
          field: 'phone',
          message: `Duplicate phone number in file: ${phone}`,
        });
        continue;
      }
      seenPhones.add(phone);

      // Check for duplicate phone in database
      if (existingPhones.has(phone)) {
        duplicatePhones.push(phone);
        errors.push({
          row: rowNum,
          field: 'phone',
          message: `Phone number already exists: ${phone}`,
        });
        continue;
      }

      // Normalize consultant type
      const consultantType = normalizeConsultantType(mappedData.consultant_type);
      if (!consultantType) {
        errors.push({
          row: rowNum,
          field: 'consultant_type',
          message: `Invalid consultant type: ${mappedData.consultant_type}. Valid values: external, internal, institutional, alumni, student`,
        });
        continue;
      }

      // Validate email if provided
      const email = mappedData.email?.toLowerCase().trim();
      if (email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push({
            row: rowNum,
            field: 'email',
            message: `Invalid email format: ${email}`,
          });
          continue;
        }
        if (existingEmails.has(email)) {
          errors.push({
            row: rowNum,
            field: 'email',
            message: `Email already exists: ${email}`,
          });
          continue;
        }
      }

      // --- Build consultant profile (global, no institution-specific fields) ---
      // NOTE: education_consultants was refactored 2026-02-26 to a global entity.
      // institution_id / status / tier / contract dates now live on consultant_institutions.
      // Array column names also differ from the CONSULTANT_COLUMN_MAPPING legacy names:
      //   geographic_coverage → covered_states
      //   specializations     → specialized_degrees
      //   programs_handled    → specialized_programs
      //   notes               → internal_notes
      const consultantProfile: Record<string, any> = {
        name: String(mappedData.name).trim(),
        phone,
        consultant_type: consultantType,
        email: email || null,
        contact_person: mappedData.contact_person?.trim() || null,
        alternate_phone: cleanPhoneNumber(mappedData.alternate_phone) || null,
        website: mappedData.website?.trim() || null,
        address_line1: mappedData.address_line1?.trim() || null,
        city: mappedData.city?.trim() || null,
        state: mappedData.state?.trim() || null,
        country: mappedData.country?.trim() || 'India',
        pincode: mappedData.pincode?.toString().trim() || null,
        bank_name: mappedData.bank_name?.trim() || null,
        bank_account_number: mappedData.bank_account_number?.toString().trim() || null,
        bank_ifsc: mappedData.bank_ifsc_code?.toUpperCase().trim() || null,
        bank_account_holder: mappedData.bank_account_holder?.trim() || null,
        pan_number: mappedData.pan_number?.toUpperCase().trim() || null,
        gst_number: mappedData.gst_number?.toUpperCase().trim() || null,
        covered_states: parseArrayField(mappedData.geographic_coverage),
        specialized_degrees: parseArrayField(mappedData.specializations),
        specialized_programs: parseArrayField(mappedData.programs_handled),
        total_leads_referred: parseNumberField(mappedData.total_leads_referred, 0),
        total_conversions: parseNumberField(mappedData.successful_conversions, 0),
        total_commission_earned: parseNumberField(mappedData.total_commission_earned, 0),
        pending_commission: 0,
        relationship_score: 50,
        conversion_rate: 0,
        internal_notes: mappedData.notes?.trim() || null,
      };

      // Derive conversion rate from historical data if provided
      if (consultantProfile.total_leads_referred > 0) {
        consultantProfile.conversion_rate =
          (consultantProfile.total_conversions / consultantProfile.total_leads_referred) * 100;
      }

      validRows.push({
        profile: consultantProfile,
        tier: normalizeTier(mappedData.tier),
        status: normalizeStatus(mappedData.status),
        contract_start_date: parseDateField(mappedData.contract_start_date),
        contract_end_date: parseDateField(mappedData.contract_end_date),
      });
    }

    console.log(`[consultant-import] Row processing done: ${validRows.length} valid, ${errors.length} errors`);
    if (errors.length > 0) {
      console.log('[consultant-import] First 3 validation errors:', errors.slice(0, 3));
    }

    // --- Insert valid consultants (two-step: profile then institution link) ---
    let successCount = 0;

    if (validRows.length > 0) {
      // Step 1: Insert global consultant profiles
      const { data: insertedConsultants, error: insertError } = await supabase
        .from('education_consultants')
        .insert(validRows.map(r => r.profile))
        .select('id');

      if (insertError) {
        console.error('[consultant-import] Profile insert error:', insertError);
        return NextResponse.json(
          {
            success: false,
            successCount: 0,
            errorCount: parseResult.totalRows,
            totalRows: parseResult.totalRows,
            errors: [{ row: 0, message: `Database error: ${insertError.message}` }],
          },
          { status: 500 }
        );
      }

      successCount = insertedConsultants?.length || 0;

      // Step 2: Link each consultant to this institution via consultant_institutions
      if (insertedConsultants && insertedConsultants.length > 0) {
        const institutionLinks = insertedConsultants.map((c, i) => ({
          consultant_id: c.id,
          institution_id: institutionId,
          tier: validRows[i].tier,
          status: validRows[i].status,
          contract_start_date: validRows[i].contract_start_date,
          contract_end_date: validRows[i].contract_end_date,
        }));

        const { error: linkError } = await supabase
          .from('consultant_institutions')
          .insert(institutionLinks);

        if (linkError) {
          console.error('[consultant-import] Institution link error:', linkError);
          return NextResponse.json(
            {
              success: false,
              successCount: 0,
              errorCount: parseResult.totalRows,
              totalRows: parseResult.totalRows,
              errors: [
                {
                  row: 0,
                  message: `Consultants were created but could not be linked to your institution: ${linkError.message}`,
                },
              ],
            },
            { status: 500 }
          );
        }
      }
    }

    const result: ImportResult = {
      success: errors.length === 0,
      successCount,
      errorCount: errors.length,
      totalRows: parseResult.totalRows,
      errors,
      duplicatePhones: duplicatePhones.length > 0 ? duplicatePhones : undefined,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[consultant-import] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process import' },
      { status: 500 }
    );
  }
}
