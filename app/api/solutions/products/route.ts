import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductsService } from '@/lib/services/solutions/products-service'
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
  const status = getStringParam(url, 'status')
  const domain = getStringParam(url, 'domain')
  const sector = getStringParam(url, 'sector')
  const patent_status = getStringParam(url, 'patent_status')
  const lead_department_id = getStringParam(url, 'lead_department_id')
  const min_trl = getStringParam(url, 'min_trl')
  const max_trl = getStringParam(url, 'max_trl')

  const result = await ProductsService.getProducts({
    page,
    limit,
    search,
    status: status as any,
    domain: domain as any,
    sector: sector as any,
    patent_status: patent_status as any,
    lead_department_id,
    min_trl: min_trl ? parseInt(min_trl, 10) : undefined,
    max_trl: max_trl ? parseInt(max_trl, 10) : undefined,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!auth.institutionId && !body.institution_id) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await ProductsService.createProduct({
    ...body,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
