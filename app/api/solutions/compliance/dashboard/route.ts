import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ComplianceService } from '@/lib/services/solutions/compliance-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const departmentId = getStringParam(url, 'department_id')
  const clearanceStatus = getStringParam(url, 'clearance_status')
  const searchQuery = getStringParam(url, 'search')

  const result = await ComplianceService.getDashboardData({
    institutionId: auth.institutionId ?? undefined,
    departmentId,
    clearanceStatus: clearanceStatus as any,
    searchQuery,
  })

  return successApiResponse(result)
}, { requiredPermission: 'read' })
