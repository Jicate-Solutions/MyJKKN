export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse , connection } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  await connection();
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
    const lifecycleStatus = url.searchParams.get('lifecycle_status');
    const programId = url.searchParams.get('program_id');
    const semesterId = url.searchParams.get('semester_id');
    const sectionId = url.searchParams.get('section_id');
    const admissionYear = url.searchParams.get('admission_year');
    const gender = url.searchParams.get('gender');
    const quota = url.searchParams.get('quota');
    const expand = url.searchParams.get('expand');

    // Build query - select all fields except migration fields.
    // 2026-05-02 (Phase C-8): replaced legacy admission_year integer with the
    // FK + program_start_year join. Response derives the integer at serialize
    // time so external consumers see no shape change.
    const selectFields = `
      id, application_id, lifecycle_status, first_name, last_name, date_of_birth,
      gender, religion, community, caste, father_name, father_occupation, father_mobile,
      mother_name, mother_occupation, mother_mobile, annual_income, last_school,
      board_of_study, tenth_marks, twelfth_marks, medical_cutoff_marks,
      engineering_cutoff_marks, neet_roll_number, neet_score, counseling_applied,
      counseling_number, scholarship_type, quota, entry_type, student_mobile,
      student_email, permanent_address_street, permanent_address_taluk,
      permanent_address_district, permanent_address_pin_code, permanent_address_state,
      accommodation_type, hostel_type, food_type, reference_type, reference_name, reference_contact,
      institution_id, degree_id, department_id, program_id, semester_id, section_id,
      academic_year_id, regulation_id, batch_id, roll_number, register_number,
      college_email, student_photo_url, is_profile_complete, created_at, updated_at,
      created_by, updated_by, aadhar_number, enquiry_date, blood_group,
      admission_year_id,
      admission_year_obj:admission_years!admission_year_id(program_start_year)
    `.trim();

    let query = (supabase as any).from('learners_profiles').select(
      selectFields,
      { count: 'exact' }
    );

    // Apply filters
    // Default: only active learners unless lifecycle_status is specified
    if (lifecycleStatus) {
      const statuses = lifecycleStatus.split(',');
      query = query.in('lifecycle_status', statuses);
    } else {
      query = query.eq('lifecycle_status', 'active');
    }

    if (programId) {
      query = query.eq('program_id', programId);
    }

    if (semesterId) {
      query = query.eq('semester_id', semesterId);
    }

    if (sectionId) {
      query = query.eq('section_id', sectionId);
    }

    if (admissionYear) {
      // 2026-05-02 (Phase C-8): translate ?admission_year=INT into FK filter.
      // Resolve the year to admission_years.id values then filter learners by FK.
      const yearInt = parseInt(admissionYear);
      const { data: ayRows } = await (supabase as any)
        .from('admission_years')
        .select('id')
        .eq('program_start_year', yearInt);
      const ayIds = (ayRows ?? []).map((r: any) => r.id);
      if (ayIds.length === 0) {
        // No admission_years rows for that year — short-circuit to empty result.
        query = query.eq('admission_year_id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = query.in('admission_year_id', ayIds);
      }
    }

    if (gender) {
      query = query.eq('gender', gender);
    }

    if (quota) {
      query = query.eq('quota', quota);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: learnersRaw, error, count } = await query;

    if (error) throw error;

    // 2026-05-02 (Phase C-8): Derive legacy admission_year integer from the FK
    // join for back-compat. Strip the join helper from the response shape.
    const learners = (learnersRaw ?? []).map((row: any) => {
      const ayObj = row.admission_year_obj as { program_start_year?: number } | null;
      const { admission_year_obj: _, ...rest } = row;
      return {
        ...rest,
        admission_year: ayObj?.program_start_year ?? null,
      };
    });

    // Expand related data if requested
    let expandedData = learners;
    if (expand && learners && learners.length > 0) {
      const expandFields = expand.split(',');

      if (expandFields.includes('program')) {
        const programIds = [
          ...new Set(learners.map((l: any) => l.program_id).filter(Boolean))
        ];
        const { data: programs } = await supabase
          .from('programs')
          .select('id, program_name, program_code')
          .in('id', programIds);

        const programMap = new Map(programs?.map((p: any) => [p.id, p]) || []);
        expandedData = learners.map((learner: any) => ({
          ...learner,
          program: learner.program_id ? programMap.get(learner.program_id) : null
        }));
      }

      if (expandFields.includes('semester')) {
        const semesterIds = [
          ...new Set(expandedData.map((l: any) => l.semester_id).filter(Boolean))
        ];
        const { data: semesters } = await supabase
          .from('semesters')
          .select('id, semester_name, semester_code, semester_number')
          .in('id', semesterIds);

        const semesterMap = new Map(
          semesters?.map((s: any) => [s.id, s]) || []
        );
        expandedData = expandedData.map((learner: any) => ({
          ...learner,
          semester: learner.semester_id
            ? semesterMap.get(learner.semester_id)
            : null
        }));
      }

      if (expandFields.includes('section')) {
        const sectionIds = [
          ...new Set(expandedData.map((l: any) => l.section_id).filter(Boolean))
        ];
        const { data: sections } = await supabase
          .from('sections')
          .select('id, section_name, section_code')
          .in('id', sectionIds);

        const sectionMap = new Map(sections?.map((s: any) => [s.id, s]) || []);
        expandedData = expandedData.map((learner: any) => ({
          ...learner,
          section: learner.section_id
            ? sectionMap.get(learner.section_id)
            : null
        }));
      }
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // 2026-04-23: Deprecation signals for the integer admission_year filter
    // and response field. Consumers should migrate to admission_year_id (UUID
    // FK) which was added to learners_profiles in the same release. Integer
    // will be retained for at least one release cycle; planned removal date
    // is set to ~90 days out and tracked in docs.
    const deprecationHeaders: Record<string, string> = admissionYear
      ? {
          Deprecation: 'true',
          Sunset: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString(),
          'X-Deprecation-Notice': 'Filter ?admission_year=INT is deprecated. Use ?admission_year_id=UUID once the parameter ships. Response field admission_year (int) will be supplemented by admission_year_id (uuid).',
        }
      : {};

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
      { headers: { ...corsHeaders, ...deprecationHeaders } }
    );
  } catch (error) {
    console.error('Error fetching learner profiles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
