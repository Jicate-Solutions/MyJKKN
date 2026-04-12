import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FinanceService } from '@/lib/services/startup-studio/finance-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const fiscal_year = getStringParam(url, 'fiscal_year')
  const institution_id = getStringParam(url, 'institution_id')

  const data = await FinanceService.getSustainabilityMetrics({ fiscal_year, institution_id })
  return successApiResponse(data)
}, { requiredPermission: 'read' })
