import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MouService } from '@/lib/services/solutions/mou-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.status) {
    return errorResponse('status is required', 400)
  }

  const validStatuses = ['draft', 'pending_signatures', 'active', 'expired', 'terminated']
  if (!validStatuses.includes(body.status)) {
    return errorResponse(`status must be one of: ${validStatuses.join(', ')}`, 400)
  }

  const result = await MouService.updateStatus(id, body.status)
  return successApiResponse(result)
})
