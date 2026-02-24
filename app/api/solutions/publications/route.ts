import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PublicationsService } from '@/lib/services/solutions/publications-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const search = getStringParam(url, 'search')
  const solution_id = getStringParam(url, 'solution_id')
  const paper_type = getStringParam(url, 'paper_type')
  const journal_type = getStringParam(url, 'journal_type')
  const status = getStringParam(url, 'status')
  const nirf_category = getStringParam(url, 'nirf_category')
  const naac_criterion = getStringParam(url, 'naac_criterion')

  const result = await PublicationsService.getPublications({
    page,
    limit,
    search,
    solution_id,
    paper_type: paper_type as any,
    journal_type: journal_type as any,
    status: status as any,
    nirf_category,
    naac_criterion,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!auth.institutionId && !body.institution_id) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await PublicationsService.createPublication({
    ...body,
    institution_id: body.institution_id ?? auth.institutionId,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
