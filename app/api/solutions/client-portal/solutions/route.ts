import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientPortalService } from '@/lib/services/solutions/client-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const url = new URL(request.url)
  const solutionId = getStringParam(url, 'solution_id')

  if (solutionId) {
    const solution = await ClientPortalService.getClientSolution(solutionId, profile.id)
    if (!solution) return errorResponse('Solution not found', 404)
    return successApiResponse(solution)
  }

  const solutions = await ClientPortalService.getClientSolutions(profile.id)
  return successApiResponse(solutions)
}, { requiredPermission: 'read', allowApiKey: false })
