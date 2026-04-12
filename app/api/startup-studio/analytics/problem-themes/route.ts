import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { AnalyticsService } from '@/lib/services/startup-studio/analytics-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await AnalyticsService.getProblemThemeDistribution()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
