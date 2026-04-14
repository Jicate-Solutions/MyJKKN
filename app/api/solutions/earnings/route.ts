import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EarningsService } from '@/lib/services/solutions/earnings-service'
import { paginatedResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const { dateFrom, dateTo } = getDateRangeParams(url)
  const recipient_type = getStringParam(url, 'recipient_type')
  const recipient_id = getUuidParam(url, 'recipient_id')
  const department_id = getUuidParam(url, 'department_id')
  const status = getStringParam(url, 'status')

  const result = await EarningsService.getEarnings({
    page,
    limit,
    recipient_type: recipient_type as any,
    recipient_id,
    department_id,
    status: status as any,
    from_date: dateFrom,
    to_date: dateTo,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })
