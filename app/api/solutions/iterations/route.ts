import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { IterationsService } from '@/lib/services/solutions/iterations-service'
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
  const client_approved_raw = getStringParam(url, 'client_approved')
  const client_approved = client_approved_raw !== undefined ? client_approved_raw === 'true' : undefined

  const result = await IterationsService.getIterations({
    page,
    limit,
    phase_id,
    client_approved,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.phase_id) {
    return errorResponse('phase_id is required', 400)
  }

  const result = await IterationsService.createIteration({
    phase_id: body.phase_id,
    prototype_url: body.prototype_url,
    changes_made: body.changes_made,
    demo_date: body.demo_date,
  })

  return createdResponse(result)
})
