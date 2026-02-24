import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PaymentsService } from '@/lib/services/solutions/payments-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await PaymentsService.calculateAndDistributeSplits(id)
  if (!result.success) {
    return errorResponse(result.error || 'Failed to calculate splits', 400)
  }
  return successApiResponse(result)
})
