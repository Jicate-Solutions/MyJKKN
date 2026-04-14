import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MatlabAnalyticsService } from '@/lib/services/solutions/matlab-analytics-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async () => {
  const snapshots = await MatlabAnalyticsService.getSnapshots()
  return successApiResponse(snapshots)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request) => {
  const body = await request.json()
  const snapshot = await MatlabAnalyticsService.importSnapshot(body)
  return successApiResponse(snapshot)
})
