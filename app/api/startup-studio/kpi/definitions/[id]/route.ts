import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { KpiService } from '@/lib/services/startup-studio/kpi-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await KpiService.getKpiDefinition(id)
  if (!result) return errorResponse('KPI definition not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, ...safeBody } = body
  const result = await KpiService.updateKpiDefinition(id, safeBody)
  return successApiResponse(result)
})
