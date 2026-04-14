import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PaymentsService } from '@/lib/services/solutions/payments-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await PaymentsService.getPaymentById(id)
  if (!result) return errorResponse('Payment not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, created_by, institution_id, split_processed, ...safeBody } = body
  const result = await PaymentsService.updatePayment(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await PaymentsService.deletePayment(id)
  return noContentResponse()
})
