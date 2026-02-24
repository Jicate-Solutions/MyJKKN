import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientsService } from '@/lib/services/solutions/clients-service'
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
  const partner_status = getStringParam(url, 'partner_status')
  const industry = getStringParam(url, 'industry')
  const source_type = getStringParam(url, 'source_type')
  const is_active = getStringParam(url, 'is_active')

  const result = await ClientsService.getClients({
    institution_id: auth.institutionId ?? undefined,
    page,
    limit,
    search,
    partner_status: partner_status as any,
    industry,
    source_type: source_type as any,
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const institutionId = auth.institutionId ?? body.institution_id
  if (!institutionId) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await ClientsService.createClient({
    ...body,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
