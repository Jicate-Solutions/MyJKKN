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

  const canClaim = await TrainingService.canSelfClaimSession(id)
  if (!canClaim) {
    return errorResponse('Session value exceeds self-claim threshold. Use assign endpoint instead.', 403)
  }

  const result = await TrainingService.claimSession(
    id,
    body.cohort_member_id,
    body.role || 'lead'
  )

  return createdResponse(result)
})
