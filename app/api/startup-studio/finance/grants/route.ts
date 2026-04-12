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
  const institution_id = getStringParam(url, 'institution_id')

  const data = await FinanceService.getGrants(institution_id)
  return successApiResponse(data)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.name) {
    return errorResponse('name is required', 400)
  }
  if (!body.funder) {
    return errorResponse('funder is required', 400)
  }
  if (body.sanctioned_amount == null || body.sanctioned_amount < 0) {
    return errorResponse('sanctioned_amount is required and must be >= 0', 400)
  }

  const result = await FinanceService.createGrant(body)
  return createdResponse(result)
})
