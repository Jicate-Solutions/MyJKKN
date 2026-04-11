import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { KpiService } from '@/lib/services/startup-studio/kpi-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { framework } = await context!.params!

  const validFrameworks = ['dst', 'msh', 'moe_innovation_cell', 'nirf', 'internal', 'custom']
  if (!validFrameworks.includes(framework)) {
    return errorResponse(`Invalid framework: ${framework}. Must be one of: ${validFrameworks.join(', ')}`, 400)
  }

  const url = new URL(request.url)
  const institution_id = getStringParam(url, 'institution_id') || auth.institutionId || undefined

  const result = await KpiService.getFrameworkCompliance(framework, institution_id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
