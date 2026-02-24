import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { review_notes } = body

  if (!review_notes) {
    return errorResponse('review_notes is required when rejecting a nomination', 400)
  }

  await DepartmentTrackerService.rejectNomination(id, auth.user.id, review_notes)

  return successApiResponse({ message: 'Nomination rejected' })
})
