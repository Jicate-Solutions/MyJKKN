import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EarningsService } from '@/lib/services/solutions/earnings-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const monthParam = getStringParam(url, 'month')
  const yearParam = getStringParam(url, 'year')

  const now = new Date()
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear()

  if (isNaN(month) || month < 1 || month > 12) {
    return errorResponse('month must be between 1 and 12', 400)
  }
  if (isNaN(year) || year < 2000 || year > 2100) {
    return errorResponse('Invalid year', 400)
  }

  const result = await EarningsService.getMonthlyEarningsReport(month, year)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
