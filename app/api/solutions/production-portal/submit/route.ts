import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
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
  const { assignment_id, earnings, quality_rating } = body
  if (!assignment_id) {
    return errorResponse('assignment_id is required', 400)
  }

  const result = await ProductionService.completeAssignment(assignment_id, earnings, quality_rating)
  return successApiResponse(result)
}, { allowApiKey: false })
