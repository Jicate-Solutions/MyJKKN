import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/enrollments/my — the cohorts the caller is in
export const GET = withAuth(
  async (request, auth) => {
    const enrollments = await FoundationsService.getMyEnrollments(auth.user.id)
    return successApiResponse(enrollments)
  },
  { requiredPermission: 'read' }
)

// POST /api/startup-studio/foundations/enrollments/my — self-enrol into a cohort (#4).
// RLS allows the insert only when student_id = auth.uid() AND enrolled_via = 'self'.
export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json()
    if (!body.cohort_id) return errorResponse('cohort_id is required', 400)
    try {
      const enrollment = await FoundationsService.enroll(
        body.cohort_id,
        auth.user.id,
        'self',
        auth.user.id
      )
      return createdResponse(enrollment)
    } catch (err) {
      // D9 (400 — unresolvable member) and enrollment-mode/RLS denial (403) are client
      // errors, not 500s. Surface the tagged status cleanly.
      const status = (err as { status?: number })?.status
      if (status === 400 || status === 403) return errorResponse((err as Error).message, status)
      throw err
    }
  },
  { requiredPermission: 'write' }
)
