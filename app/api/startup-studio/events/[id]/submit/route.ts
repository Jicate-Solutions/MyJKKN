import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SubmissionsService } from '@/lib/services/startup-studio/submissions-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Create a submission for this event
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  // --- Fix 5: Fetch event and enforce submission deadline + active check ---
  const { data: event, error: eventError } = await auth.supabase
    .from('ss_events')
    .select('end_date, is_active')
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return errorResponse('Event not found', 404)
  }
  if (!event.is_active) {
    return errorResponse('Event is not active', 400)
  }
  // Allow submissions until 1 hour after event ends
  if (event.end_date) {
    const submissionDeadline = new Date(event.end_date)
    submissionDeadline.setHours(submissionDeadline.getHours() + 1)
    if (new Date() > submissionDeadline) {
      return errorResponse('Submission deadline has passed', 400)
    }
  }

  const body = await request.json()
  if (!body.app_name) return errorResponse('App name is required', 400)

  const submission = await SubmissionsService.createSubmission({
    event_id: id,
    user_id: auth.user.id,
    cycle_id: body.cycle_id,
    team_name: body.team_name,
    team_members: body.team_members,
    applicant_name: auth.user.full_name || body.applicant_name,
    applicant_email: auth.user.email || body.applicant_email,
    institution_id: body.institution_id || auth.institutionId || null,
    department: body.department,
    app_name: body.app_name,
    problem_statement: body.problem_statement,
    solution_summary: body.solution_summary,
    live_url: body.live_url,
    lovable_url: body.lovable_url,
    elevator_pitch: body.elevator_pitch,
    github_repo_url: body.github_repo_url,
    category: body.category,
  })

  // Auto-submit for review
  if (body.auto_submit) {
    const submitted = await SubmissionsService.submitForReview(submission.id)
    return createdResponse(submitted)
  }

  return createdResponse(submission)
})
