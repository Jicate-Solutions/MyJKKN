import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const url = new URL(request.url);
    const expand = url.searchParams.get('expand');

    // Fetch learner by ID - select all fields except migration fields
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

    const { data: learner, error } = await supabase
      .from('learners_profiles')
      .select(selectFields)
      .eq('id', id)
      .single();

    if (error || !learner) {
      return NextResponse.json(
        { error: 'Learner profile not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Expand related data if requested
    let expandedData: any = learner;
    if (expand) {
      const expandFields = expand.split(',');

      if (expandFields.includes('program') && (learner as any).program_id) {
        const { data: program } = await supabase
          .from('programs')
          .select('id, program_name, program_code, degree_id')
          .eq('id', (learner as any).program_id)
          .single();
        expandedData = { ...expandedData, program };
      }

      if (expandFields.includes('semester') && (learner as any).semester_id) {
        const { data: semester } = await supabase
          .from('semesters')
          .select('id, semester_name, semester_code, semester_number, program_id')
          .eq('id', (learner as any).semester_id)
          .single();
        expandedData = { ...expandedData, semester };
      }

      if (expandFields.includes('section') && (learner as any).section_id) {
        const { data: section } = await supabase
          .from('sections')
          .select('id, section_name, section_code, semester_id')
          .eq('id', (learner as any).section_id)
          .single();
        expandedData = { ...expandedData, section };
      }
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({ data: expandedData }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching learner profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
