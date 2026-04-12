import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GovernanceService } from '@/lib/services/startup-studio/governance-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const institution_id = getStringParam(url, 'institution_id')

  const data = await GovernanceService.getComplianceDashboard(institution_id)
  return successApiResponse(data)
}, { requiredPermission: 'read' })
