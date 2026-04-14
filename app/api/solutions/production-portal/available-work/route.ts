import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'
import type { ContentDivision } from '@/lib/services/solutions/types'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const learner = await ProductionService.getLearnerByUserId(auth.user.id)
  if (!learner) {
    return errorResponse('Production learner profile not found for current user', 404)
  }

  const url = new URL(request.url)
  const division = (getStringParam(url, 'division') ?? learner.division) as ContentDivision | undefined

  if (!division) {
    return errorResponse('division is required (either from profile or query param)', 400)
  }

  const deliverables = await ProductionService.getAvailableDeliverablesForDivision(division)
  return successApiResponse(deliverables)
}, { requiredPermission: 'read', allowApiKey: false })
