import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientPortalService } from '@/lib/services/solutions/client-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const url = new URL(request.url)
  const view = getStringParam(url, 'view')

  if (view === 'summary') {
    const summary = await ClientPortalService.getPaymentSummary(profile.id)
    return successApiResponse(summary)
  }

  const payments = await ClientPortalService.getClientPayments(profile.id)
  return successApiResponse(payments)
}, { requiredPermission: 'read', allowApiKey: false })
