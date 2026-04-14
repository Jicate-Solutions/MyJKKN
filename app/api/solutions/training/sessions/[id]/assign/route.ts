import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrainingService } from '@/lib/services/solutions/training-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.cohort_member_id) {
    return errorResponse('cohort_member_id is required', 400)
  }

  const result = await TrainingService.assignSession(
    id,
    body.cohort_member_id,
    auth.user.id,
    body.role || 'lead'
  )

  return createdResponse(result)
})
