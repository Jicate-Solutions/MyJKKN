import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MentorService } from '@/lib/services/startup-studio/mentor-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { matchId } = await context!.params!
  const result = await MentorService.getSessionHistory(matchId)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { matchId } = await context!.params!
  const body = await request.json()

  if (!body.session_date) {
    return errorResponse('session_date is required', 400)
  }
  if (!body.duration_minutes || body.duration_minutes < 1) {
    return errorResponse('duration_minutes (positive number) is required', 400)
  }
  if (!body.topics_discussed || !Array.isArray(body.topics_discussed)) {
    return errorResponse('topics_discussed (array) is required', 400)
  }

  const result = await MentorService.logSession({
    ...body,
    match_id: matchId,
  })
  return createdResponse(result)
})
