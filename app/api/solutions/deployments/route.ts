import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DeploymentsService } from '@/lib/services/solutions/deployments-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const phase_id = getUuidParam(url, 'phase_id')
  const environment = getStringParam(url, 'environment') as any
  const status = getStringParam(url, 'status') as any
  const deployed_by = getStringParam(url, 'deployed_by')

  const result = await DeploymentsService.getDeployments({
    page,
    limit,
    phase_id,
    environment,
    status,
    deployed_by,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.phase_id || !body.environment || !body.deployed_date) {
    return errorResponse('phase_id, environment, and deployed_date are required', 400)
  }

  const result = await DeploymentsService.createDeployment({
    phase_id: body.phase_id,
    environment: body.environment,
    version: body.version,
    vercel_url: body.vercel_url,
    supabase_project_id: body.supabase_project_id,
    custom_domain: body.custom_domain,
    deployed_date: body.deployed_date,
    deployed_by: body.deployed_by ?? auth.user.id,
    notes: body.notes,
  })

  return createdResponse(result)
})
