import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DeploymentsService } from '@/lib/services/solutions/deployments-service'
import { RETIRED_DELIVERY_SURFACE_MESSAGE } from '@/lib/services/solutions/types'
import { paginatedResponse, errorResponse } from '@/lib/api/response'
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

/**
 * Creating a deployment is retired (2026-08-14 boundary ruling): the Solutions
 * Hub's own delivery tables are retired in place and delivery is tracked in the
 * Projects module. This endpoint never actually worked — the insert referenced
 * `version` and `deployed_date`, neither of which exists on the table, so every
 * POST returned an opaque 500. It now refuses explicitly with 410 Gone.
 */
export const POST = withAuth(async () => {
  return errorResponse(RETIRED_DELIVERY_SURFACE_MESSAGE, 410)
})
