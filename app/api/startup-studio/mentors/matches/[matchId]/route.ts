import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MentorService } from '@/lib/services/startup-studio/mentor-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { matchId } = await context!.params!
  const body = await request.json()

  if (!body.status) {
    return errorResponse('status is required', 400)
  }

  const validStatuses = ['proposed', 'active', 'paused', 'completed', 'terminated']
  if (!validStatuses.includes(body.status)) {
    return errorResponse(`status must be one of: ${validStatuses.join(', ')}`, 400)
  }

  const result = await MentorService.updateMatchStatus(matchId, body.status, body.reason)
  return successApiResponse(result)
})
