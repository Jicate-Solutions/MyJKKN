import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MarketingService } from '@/lib/services/startup-studio/marketing-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await MarketingService.getMarketingDashboard(auth.institutionId)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
