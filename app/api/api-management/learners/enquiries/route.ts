import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // ── Institution scoping ──────────────────────────────────────
  let institutionId: string | null = auth.institutionId
  if (auth.authMethod === 'api_key') {
    if (!institutionId) {
      return NextResponse.json(
        { error: 'API key must be scoped to an organization' },
        { status: 400, headers: corsHeaders }
      )
    }
  } else {
    // Session auth: allow super_admin to query specific institution
    const url = new URL(request.url)
    const queryInstitutionId = url.searchParams.get('institution_id')
    if (queryInstitutionId && auth.user.role === 'super_admin') {
      institutionId = queryInstitutionId
    }
  }

  // Get query parameters
  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const programId = url.searchParams.get('program_id')
  const enquiryDateFrom = url.searchParams.get('enquiry_date_from')
  const enquiryDateTo = url.searchParams.get('enquiry_date_to')
  const expand = url.searchParams.get('expand')

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
  `.trim()

  let query = (auth.supabase as any)
    .from('learners_profiles')
    .select(selectFields, { count: 'exact' })
    .eq('lifecycle_status', 'enquiry')

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  // Apply filters
  if (programId) {
    query = query.eq('program_id', programId)
  }

  if (enquiryDateFrom) {
    query = query.gte('enquiry_date', enquiryDateFrom)
  }

  if (enquiryDateTo) {
    query = query.lte('enquiry_date', enquiryDateTo)
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('enquiry_date', { ascending: false })

  // Execute query
  const { data: enquiries, error, count } = await query

  if (error) throw error

  // Expand related data if requested
  let expandedData = enquiries
  if (expand && enquiries && enquiries.length > 0) {
    const expandFields = expand.split(',')

    if (expandFields.includes('program')) {
      const programIds = [
        ...new Set(enquiries.map((e: any) => e.program_id).filter(Boolean))
      ]
      const { data: programs } = await auth.supabase
        .from('programs')
        .select('id, program_name, program_code')
        .in('id', programIds)

      const programMap = new Map(programs?.map((p: any) => [p.id, p]) || [])
      expandedData = enquiries.map((enquiry: any) => ({
        ...enquiry,
        program: enquiry.program_id ? programMap.get(enquiry.program_id) : null
      }))
    }
  }

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
  )
}, { allowApiKey: true, requiredPermission: 'read' })
