import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { AnalyticsService } from '@/lib/services/startup-studio/analytics-service'
import { successApiResponse } from '@/lib/api/response'
import { getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const event_id = getUuidParam(url, 'event_id')

  const result = await AnalyticsService.getDashboardStats(event_id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
