import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import {
  RevenueSplitService,
  RevenueSplitUnavailableError,
} from '@/lib/services/solutions/revenue-split-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  // Either calculate by solution_id or by explicit split_type + amount
  if (body.solution_id && body.amount) {
    try {
      const result = await RevenueSplitService.calculateRevenueSplitForSolution(
        body.solution_id,
        body.amount
      )
      return successApiResponse(result)
    } catch (error) {
      // Refuse loudly rather than returning a figure built on an input we cannot source.
      // A split that quietly substitutes a default still looks authoritative, and this
      // number is what gets paid out.
      if (error instanceof RevenueSplitUnavailableError) {
        return NextResponse.json(
          {
            success: false,
            error: error.code,
            message: error.message,
            missing: error.missing,
          },
          { status: 422, headers: corsHeaders }
        )
      }
      throw error
    }
  }

  if (!body.amount || !body.split_type) {
    return errorResponse('amount and split_type are required (or provide solution_id + amount)', 400)
  }

  // hod_discount here is a caller-supplied what-if input, not stored data — nothing in
  // the schema holds an HOD discount. The response reports this in adjustmentSources so
  // the figure is never read as a lookup result.
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
