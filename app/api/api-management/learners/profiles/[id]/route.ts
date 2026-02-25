import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!
  const url = new URL(request.url)
  const expand = url.searchParams.get('expand')

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
  `.trim()

  const { data: learner, error } = await auth.supabase
    .from('learners_profiles')
    .select(selectFields)
    .eq('id', id)
    .single()

  if (error || !learner) {
    return NextResponse.json(
      { error: 'Learner profile not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  // Expand related data if requested
  let expandedData: any = learner
  if (expand) {
    const expandFields = expand.split(',')

    if (expandFields.includes('program') && (learner as any).program_id) {
      const { data: program } = await auth.supabase
        .from('programs')
        .select('id, program_name, program_code, degree_id')
        .eq('id', (learner as any).program_id)
        .single()
      expandedData = { ...expandedData, program }
    }

    if (expandFields.includes('semester') && (learner as any).semester_id) {
      const { data: semester } = await auth.supabase
        .from('semesters')
        .select('id, semester_name, semester_code, semester_number, program_id')
        .eq('id', (learner as any).semester_id)
        .single()
      expandedData = { ...expandedData, semester }
    }

    if (expandFields.includes('section') && (learner as any).section_id) {
      const { data: section } = await auth.supabase
        .from('sections')
        .select('id, section_name, section_code, semester_id')
        .eq('id', (learner as any).section_id)
        .single()
      expandedData = { ...expandedData, section }
    }
  }

  return NextResponse.json({ data: expandedData }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
