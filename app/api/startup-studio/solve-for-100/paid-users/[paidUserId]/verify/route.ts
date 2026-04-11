import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio/sf100-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { paidUserId } = await context!.params!
  const body = await request.json()

  if (!body.status || !['verified', 'rejected'].includes(body.status)) {
    return errorResponse('status is required and must be "verified" or "rejected"', 400)
  }

  if (body.status === 'rejected' && !body.rejection_reason) {
    return errorResponse('rejection_reason is required when rejecting', 400)
  }

  await SF100Service.verifyPaidUser(
    paidUserId,
    body.status,
    auth.user.id,
    body.rejection_reason
  )

  return successApiResponse({ message: `Paid user ${body.status} successfully` })
})
