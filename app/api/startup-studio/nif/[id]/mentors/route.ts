import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MentorService } from '@/lib/services/startup-studio/mentor-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await MentorService.getMatchesForCandidate(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.mentor_id) {
    return errorResponse('mentor_id is required', 400)
  }

  const result = await MentorService.createMatch({
    ...body,
    candidate_id: id,
  })
  return createdResponse(result)
})
