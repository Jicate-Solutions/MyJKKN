import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    // Use service role key for API key authentication to bypass RLS
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() {
            return undefined;
          },
          set() {},
          remove() {}
        }
      }
    );

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check read permission
    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const programId = url.searchParams.get('program_id');
    const enquiryDateFrom = url.searchParams.get('enquiry_date_from');
    const enquiryDateTo = url.searchParams.get('enquiry_date_to');
    const expand = url.searchParams.get('expand');

    // Build query - select all fields except migration fields
    // Default filter: only enquiries (lifecycle_status = 'enquiry')
    const selectFields = `
      id, application_id, lifecycle_status, first_name, last_name, date_of_birth,
      gender, religion, community, caste, father_name, father_occupation, father_mobile,
      mother_name, mother_occupation, mother_mobile, annual_income, last_school,
      board_of_study, tenth_marks, twelfth_marks, medical_cutoff_marks,
      engineering_cutoff_marks, neet_roll_number, neet_score, counseling_applied,
      counseling_number, scholarship_type, quota, category, entry_type, student_mobile,
      student_email, permanent_address_street, permanent_address_taluk,
      permanent_address_district, permanent_address_pin_code, permanent_address_state,
      accommodation_type, hostel_type, food_type, reference_type, reference_name, reference_contact,
      institution_id, degree_id, department_id, program_id, semester_id, section_id,
      academic_year_id, regulation_id, batch_id, roll_number, register_number,
      college_email, student_photo_url, is_profile_complete, created_at, updated_at,
      created_by, updated_by, aadhar_number, enquiry_date, blood_group, admission_year
    `.trim();

    let query = (supabase as any)
      .from('learners_profiles')
      .select(selectFields, { count: 'exact' })
      .eq('lifecycle_status', 'enquiry');

    // Apply filters
    if (programId) {
      query = query.eq('program_id', programId);
    }

    if (enquiryDateFrom) {
      query = query.gte('enquiry_date', enquiryDateFrom);
    }

    if (enquiryDateTo) {
      query = query.lte('enquiry_date', enquiryDateTo);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('enquiry_date', { ascending: false });

    // Execute query
    const { data: enquiries, error, count } = await query;

    if (error) throw error;

    // Expand related data if requested
    let expandedData = enquiries;
    if (expand && enquiries && enquiries.length > 0) {
      const expandFields = expand.split(',');

      if (expandFields.includes('program')) {
        const programIds = [
          ...new Set(enquiries.map((e: any) => e.program_id).filter(Boolean))
        ];
        const { data: programs } = await supabase
          .from('programs')
          .select('id, program_name, program_code')
          .in('id', programIds);

        const programMap = new Map(programs?.map((p: any) => [p.id, p]) || []);
        expandedData = enquiries.map((enquiry: any) => ({
          ...enquiry,
          program: enquiry.program_id ? programMap.get(enquiry.program_id) : null
        }));
      }
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // Return response with CORS headers
    return NextResponse.json(
      {
        count: count || 0,
        data: expandedData || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching enquiries:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
