import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RevenueSplitService } from '@/lib/services/solutions/revenue-split-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  // Either calculate by solution_id or by explicit split_type + amount
  if (body.solution_id && body.amount) {
    const result = await RevenueSplitService.calculateRevenueSplitForSolution(
      body.solution_id,
      body.amount
    )
    return successApiResponse(result)
  }

  if (!body.amount || !body.split_type) {
    return errorResponse('amount and split_type are required (or provide solution_id + amount)', 400)
  }

  const result = await RevenueSplitService.calculateRevenueSplit(
    body.amount,
    body.split_type,
    {
      hodDiscount: body.hod_discount,
      isFirstPhase: body.is_first_phase,
      hasReferral: body.has_referral,
      departmentId: body.department_id,
      customSplitConfig: body.custom_split_config,
    }
  )

  return successApiResponse(result)
})
