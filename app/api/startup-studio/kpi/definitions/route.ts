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
  const framework = getStringParam(url, 'framework')
  const category = getStringParam(url, 'category')
  const search = getStringParam(url, 'search')
  const institution_id = getStringParam(url, 'institution_id') || auth.institutionId || undefined

  const result = await KpiService.getKpiDefinitions({
    framework: framework as any,
    category: category as any,
    search,
    institutionId: institution_id,
  })

  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.name) return errorResponse('name is required', 400)
  if (!body.code) return errorResponse('code is required', 400)
  if (!body.framework) return errorResponse('framework is required', 400)
  if (!body.category) return errorResponse('category is required', 400)
  if (!body.data_type) return errorResponse('data_type is required', 400)

  const result = await KpiService.createKpiDefinition({
    ...body,
    institution_id: body.institution_id || auth.institutionId || undefined,
  })

  return createdResponse(result)
})
