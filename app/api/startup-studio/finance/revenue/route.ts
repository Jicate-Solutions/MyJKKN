import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FinanceService } from '@/lib/services/startup-studio/finance-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const fiscal_year = getStringParam(url, 'fiscal_year')
  const source = getStringParam(url, 'source')
  const institution_id = getStringParam(url, 'institution_id')

  const data = await FinanceService.getRevenue({ fiscal_year, source, institution_id })
  return successApiResponse(data)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.fiscal_year) {
    return errorResponse('fiscal_year is required', 400)
  }
  if (!body.source) {
    return errorResponse('source is required', 400)
  }
  if (body.amount == null || body.amount < 0) {
    return errorResponse('amount is required and must be >= 0', 400)
  }

  const result = await FinanceService.recordRevenue(body)
  return createdResponse(result)
})
