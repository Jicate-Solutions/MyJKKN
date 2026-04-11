import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio/sf100-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { paidUserId } = await context!.params!
  const body = await request.json()

  await SF100Service.markChurned(paidUserId, {
    churn_reason: body.churn_reason,
    refund_amount: body.refund_amount,
    refund_date: body.refund_date,
  })

  return successApiResponse({ message: 'Paid user marked as churned successfully' })
})
