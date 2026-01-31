// app/api/admission/consultants/import/route.ts
// Import API for bulk consultant upload

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseExcelFile, mapColumns } from '@/lib/utils/excel-parser';
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
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile for institution_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, full_name')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json(
        { error: 'User must be associated with an institution' },
        { status: 400 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    // Parse Excel file
    const parseResult = await parseExcelFile(file, 'Consultants');
    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { success: false, errors: parseResult.errors.map((msg, i) => ({ row: 0, message: msg })) },
        { status: 400 }
      );
    }

    if (parseResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, errors: [{ row: 0, message: 'No data found in the file' }] },
        { status: 400 }
      );
    }

    // Get existing consultants for duplicate detection
    const { data: existingConsultants } = await supabase
      .from('education_consultants')
      .select('phone, email')
      .eq('institution_id', profile.institution_id);

    const existingPhones = new Set(existingConsultants?.map(c => cleanPhoneNumber(c.phone)) || []);
    const existingEmails = new Set(
      existingConsultants?.map(c => c.email?.toLowerCase()).filter(Boolean) || []
    );

    // Process rows
    const errors: ImportError[] = [];
    const validConsultants: any[] = [];
    const duplicatePhones: string[] = [];
    const seenPhones = new Set<string>();

    for (const row of parseResult.rows) {
      const rowNum = row.rowNumber;
      const mappedData = mapColumns(row.data, CONSULTANT_COLUMN_MAPPING as Record<string, string[]>);

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

      // Check for duplicate phone in file
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

      // Validate and normalize consultant type
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

      // Build consultant record
      const consultant = {
        institution_id: profile.institution_id,
        name: String(mappedData.name).trim(),
        phone: phone,
        consultant_type: consultantType,
        email: email || null,
        contact_person: mappedData.contact_person?.trim() || null,
        alternate_phone: cleanPhoneNumber(mappedData.alternate_phone) || null,
        website: mappedData.website?.trim() || null,
        address: mappedData.address?.trim() || null,
        city: mappedData.city?.trim() || null,
        state: mappedData.state?.trim() || null,
        country: mappedData.country?.trim() || 'India',
        pincode: mappedData.pincode?.toString().trim() || null,
        bank_name: mappedData.bank_name?.trim() || null,
        bank_account_number: mappedData.bank_account_number?.toString().trim() || null,
        bank_ifsc: mappedData.bank_ifsc?.toUpperCase().trim() || null,
        bank_account_holder: mappedData.bank_account_holder?.trim() || null,
        pan_number: mappedData.pan_number?.toUpperCase().trim() || null,
        gst_number: mappedData.gst_number?.toUpperCase().trim() || null,
        geographic_coverage: parseArrayField(mappedData.geographic_coverage),
        specializations: parseArrayField(mappedData.specializations),
        programs_handled: parseArrayField(mappedData.programs_handled),
        tier: normalizeTier(mappedData.tier),
        total_leads_referred: parseNumberField(mappedData.total_leads_referred, 0),
        total_conversions: parseNumberField(mappedData.total_conversions, 0),
        total_commission_earned: parseNumberField(mappedData.total_commission_earned, 0),
        pending_commission: 0,
        relationship_score: 50, // Default score
        conversion_rate: 0,
        contract_start_date: parseDateField(mappedData.contract_start_date),
        contract_end_date: parseDateField(mappedData.contract_end_date),
        status: normalizeStatus(mappedData.status),
        notes: mappedData.notes?.trim() || null,
        tags: parseArrayField(mappedData.tags),
        created_by: user.id,
      };

      // Calculate conversion rate if historical data provided
      if (consultant.total_leads_referred > 0) {
        consultant.conversion_rate = (consultant.total_conversions / consultant.total_leads_referred) * 100;
      }

      validConsultants.push(consultant);
    }

    // Insert valid consultants
    let successCount = 0;
    if (validConsultants.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from('education_consultants')
        .insert(validConsultants)
        .select('id');

      if (insertError) {
        console.error('[consultant-import] Insert error:', insertError);
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

      successCount = insertedData?.length || 0;
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
