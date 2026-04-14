import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PaymentsService } from '@/lib/services/solutions/payments-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam, getDateRangeParams } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const { dateFrom, dateTo } = getDateRangeParams(url)
  const status = getStringParam(url, 'status')
  const payment_type = getStringParam(url, 'payment_type')
  const phase_id = getUuidParam(url, 'phase_id')
  const program_id = getUuidParam(url, 'program_id')
  const order_id = getUuidParam(url, 'order_id')

  const result = await PaymentsService.getPayments({
    page,
    limit,
    status: status as any,
    payment_type: payment_type as any,
    phase_id,
    program_id,
    order_id,
    from_date: dateFrom,
    to_date: dateTo,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!auth.institutionId && !body.institution_id) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await PaymentsService.createPayment({
    ...body,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
