import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { UnifiedEarningsService } from '@/lib/services/solutions/unified-earnings-service'
import { paginatedResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getDateRangeParams } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const { dateFrom, dateTo } = getDateRangeParams(url)
  const talent_types = getStringParam(url, 'talent_types')

  const userId = auth.user.id

  const result = await UnifiedEarningsService.getPayoutHistory(userId, {
    page,
    limit,
    talent_types: talent_types ? talent_types.split(',') as any : undefined,
    from_date: dateFrom,
    to_date: dateTo,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })
