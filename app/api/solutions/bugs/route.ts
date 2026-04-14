import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BugsService } from '@/lib/services/solutions/bugs-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const search = getStringParam(url, 'search')
  const iteration_id = getUuidParam(url, 'iteration_id')
  const phase_id = getUuidParam(url, 'phase_id')
  const severity = getStringParam(url, 'severity') as any
  const status = getStringParam(url, 'status') as any
  const reported_by = getStringParam(url, 'reported_by')

  const result = await BugsService.getBugs({
    page,
    limit,
    search,
    iteration_id,
    phase_id,
    severity,
    status,
    reported_by,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.iteration_id || !body.description) {
    return errorResponse('iteration_id and description are required', 400)
  }

  const result = await BugsService.createBug({
    iteration_id: body.iteration_id,
    reported_by: body.reported_by ?? auth.user.id,
    description: body.description,
    severity: body.severity,
    screenshots_urls: body.screenshots_urls,
  })

  return createdResponse(result)
})
