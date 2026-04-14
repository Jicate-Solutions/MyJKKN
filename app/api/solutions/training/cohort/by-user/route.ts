import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CohortService } from '@/lib/services/solutions/cohort-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const userId = getUuidParam(url, 'user_id')

  if (!userId) {
    return errorResponse('user_id is required', 400)
  }

  const result = await CohortService.getCohortMemberByUserId(userId)

  if (!result) {
    return errorResponse('Cohort member not found', 404)
  }

  return successApiResponse(result)
}, { requiredPermission: 'read' })
