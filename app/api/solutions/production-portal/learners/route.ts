import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse, createdResponse, paginatedResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url.searchParams)
  const division = getStringParam(url.searchParams, 'division')
  const skill_level = getStringParam(url.searchParams, 'skill_level')
  const is_active = getStringParam(url.searchParams, 'is_active')
  const search = getStringParam(url.searchParams, 'search')

  const filters: Record<string, any> = { page, limit }
  if (division) filters.division = division
  if (skill_level) filters.skill_level = skill_level
  if (is_active !== undefined) filters.is_active = is_active === 'true'
  if (search) filters.search = search

  const result = await ProductionService.getLearners(filters)
  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.name) {
    return errorResponse('name is required', 400)
  }

  const result = await ProductionService.createLearner(body)
  return createdResponse(result)
})
