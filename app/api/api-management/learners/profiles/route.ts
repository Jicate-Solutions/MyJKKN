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
  const lifecycleStatus = url.searchParams.get('lifecycle_status')
  const programId = url.searchParams.get('program_id')
  const semesterId = url.searchParams.get('semester_id')
  const sectionId = url.searchParams.get('section_id')
  const admissionYear = url.searchParams.get('admission_year')
  const gender = url.searchParams.get('gender')
  const quota = url.searchParams.get('quota')
  const expand = url.searchParams.get('expand')

  // Build query - select all fields except migration fields
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

  let query = (auth.supabase as any).from('learners_profiles').select(
    selectFields,
    { count: 'exact' }
  )

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  // Apply filters
  // Default: only active learners unless lifecycle_status is specified
  if (lifecycleStatus) {
    const statuses = lifecycleStatus.split(',')
    query = query.in('lifecycle_status', statuses)
  } else {
    query = query.eq('lifecycle_status', 'active')
  }

  if (programId) {
    query = query.eq('program_id', programId)
  }

  if (semesterId) {
    query = query.eq('semester_id', semesterId)
  }

  if (sectionId) {
    query = query.eq('section_id', sectionId)
  }

  if (admissionYear) {
    query = query.eq('admission_year', parseInt(admissionYear))
  }

  if (gender) {
    query = query.eq('gender', gender)
  }

  if (quota) {
    query = query.eq('quota', quota)
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  // Execute query
  const { data: learners, error, count } = await query

  if (error) throw error

  // Expand related data if requested
  let expandedData = learners
  if (expand && learners && learners.length > 0) {
    const expandFields = expand.split(',')

    if (expandFields.includes('program')) {
      const programIds = [
        ...new Set(learners.map((l: any) => l.program_id).filter(Boolean))
      ]
      const { data: programs } = await auth.supabase
        .from('programs')
        .select('id, program_name, program_code')
        .in('id', programIds)

      const programMap = new Map(programs?.map((p: any) => [p.id, p]) || [])
      expandedData = learners.map((learner: any) => ({
        ...learner,
        program: learner.program_id ? programMap.get(learner.program_id) : null
      }))
    }

    if (expandFields.includes('semester')) {
      const semesterIds = [
        ...new Set(expandedData.map((l: any) => l.semester_id).filter(Boolean))
      ]
      const { data: semesters } = await auth.supabase
        .from('semesters')
        .select('id, semester_name, semester_code, semester_number')
        .in('id', semesterIds)

      const semesterMap = new Map(
        semesters?.map((s: any) => [s.id, s]) || []
      )
      expandedData = expandedData.map((learner: any) => ({
        ...learner,
        semester: learner.semester_id
          ? semesterMap.get(learner.semester_id)
          : null
      }))
    }

    if (expandFields.includes('section')) {
      const sectionIds = [
        ...new Set(expandedData.map((l: any) => l.section_id).filter(Boolean))
      ]
      const { data: sections } = await auth.supabase
        .from('sections')
        .select('id, section_name, section_code')
        .in('id', sectionIds)

      const sectionMap = new Map(sections?.map((s: any) => [s.id, s]) || [])
      expandedData = expandedData.map((learner: any) => ({
        ...learner,
        section: learner.section_id
          ? sectionMap.get(learner.section_id)
          : null
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
