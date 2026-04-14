import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (_request, auth) => {
  const learner = await ProductionService.getLearnerByUserId(auth.user.id)
  if (!learner) {
    return errorResponse('Production learner profile not found for current user', 404)
  }
  return successApiResponse(learner)
}, { requiredPermission: 'read', allowApiKey: false })
