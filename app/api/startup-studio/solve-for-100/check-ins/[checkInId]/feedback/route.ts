import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio/sf100-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { checkInId } = await context!.params!
  const body = await request.json()

  if (!body.feedback) {
    return errorResponse('feedback is required', 400)
  }

  await SF100Service.addMentorFeedback(checkInId, body.feedback, auth.user.id)

  return successApiResponse({ message: 'Mentor feedback added successfully' })
})
