import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CohortService } from '@/lib/services/solutions/cohort-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (_request, auth) => {
  const member = await CohortService.getCohortMemberByUserId(auth.user.id)
  if (!member) {
    return errorResponse('Cohort member profile not found for current user', 404)
  }

  const sessions = await CohortService.getAvailableSessionsForMember(member.id)
  return successApiResponse(sessions)
}, { requiredPermission: 'read', allowApiKey: false })
