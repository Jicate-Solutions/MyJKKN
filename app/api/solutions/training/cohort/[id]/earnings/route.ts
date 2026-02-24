import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CohortService } from '@/lib/services/solutions/cohort-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (req, context) => {
  const { id } = await context!.params!
  const body = await req.json()

  if (body.amount === undefined || body.amount === null) {
    return errorResponse('amount is required', 400)
  }

  if (typeof body.amount !== 'number') {
    return errorResponse('amount must be a number', 400)
  }

  const result = await CohortService.addEarnings(id, body.amount)

  return successApiResponse(result)
})
