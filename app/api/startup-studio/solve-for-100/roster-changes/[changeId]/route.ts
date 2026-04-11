import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { changeId } = await context!.params!
  const body = await request.json()

  if (typeof body.approved !== 'boolean') {
    return errorResponse('approved (boolean) is required', 400)
  }

  await SF100Service.reviewRosterChange(
    changeId,
    body.approved,
    auth.user.id,
    body.notes
  )

  return successApiResponse({ change_id: changeId, approved: body.approved })
})
