import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth) => {
  const learner = await ProductionService.getLearnerByUserId(auth.user.id)
  if (!learner) {
    return errorResponse('Production learner profile not found for current user', 404)
  }

  const body = await request.json()
  const { deliverable_id } = body
  if (!deliverable_id) {
    return errorResponse('deliverable_id is required', 400)
  }

  const assignment = await ProductionService.claimDeliverable(deliverable_id, learner.id)
  return createdResponse(assignment)
}, { allowApiKey: false })
