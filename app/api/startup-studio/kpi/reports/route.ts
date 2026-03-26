import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { KpiService } from '@/lib/services/startup-studio/kpi-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const status = getStringParam(url, 'status')
  const report_type = getStringParam(url, 'report_type')
  const institution_id = getStringParam(url, 'institution_id') || auth.institutionId || undefined

  const result = await KpiService.getImpactReports({
    status: status as any,
    report_type: report_type as any,
    institutionId: institution_id,
  })

  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.report_title) return errorResponse('report_title is required', 400)
  if (!body.report_type) return errorResponse('report_type is required', 400)
  if (!body.target_audience) return errorResponse('target_audience is required', 400)

  const result = await KpiService.createImpactReport({
    ...body,
    institution_id: body.institution_id || auth.institutionId || undefined,
  })

  return createdResponse(result)
})
