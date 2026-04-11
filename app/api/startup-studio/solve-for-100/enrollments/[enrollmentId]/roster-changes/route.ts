import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const body = await request.json()

  if (!body.action || !['add', 'remove'].includes(body.action)) {
    return errorResponse('action is required and must be "add" or "remove"', 400)
  }
  if (!body.email) {
    return errorResponse('email is required', 400)
  }

  const result = await SF100Service.requestRosterChange(enrollmentId, {
    action: body.action,
    email: body.email,
    full_name: body.full_name,
    reason: body.reason,
    profile_id: body.profile_id,
    learner_id: body.learner_id,
  }, auth.user.id)

  return createdResponse(result)
})
