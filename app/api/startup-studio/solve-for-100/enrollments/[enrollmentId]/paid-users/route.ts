import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio/sf100-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const status = getStringParam(url, 'status')
  const isActiveParam = getStringParam(url, 'is_active')

  const is_active = isActiveParam !== undefined
    ? isActiveParam === 'true'
    : undefined

  const result = await SF100Service.listPaidUsers(enrollmentId, {
    status,
    is_active,
    page,
    limit,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const body = await request.json()

  if (!body.user_identifier) {
    return errorResponse('user_identifier is required', 400)
  }
  if (body.amount === undefined || body.amount === null) {
    return errorResponse('amount is required', 400)
  }
  if (!body.transaction_date) {
    return errorResponse('transaction_date is required', 400)
  }
  if (body.is_internal === undefined) {
    return errorResponse('is_internal is required', 400)
  }

  const result = await SF100Service.logPaidUser(enrollmentId, {
    user_identifier: body.user_identifier,
    user_name: body.user_name,
    is_internal: body.is_internal,
    amount: body.amount,
    currency: body.currency,
    payment_gateway: body.payment_gateway,
    transaction_id: body.transaction_id,
    transaction_date: body.transaction_date,
    is_recurring: body.is_recurring,
    subscription_id: body.subscription_id,
    proof_url: body.proof_url,
    proof_description: body.proof_description,
  }, auth.user.id)

  return createdResponse(result)
})
