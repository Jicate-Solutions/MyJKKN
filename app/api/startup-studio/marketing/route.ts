import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MarketingService } from '@/lib/services/startup-studio/marketing-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const type = getStringParam(url, 'type')
  const status = getStringParam(url, 'status')
  const search = getStringParam(url, 'search')

  const result = await MarketingService.getActivities({
    page,
    limit,
    type: type as any,
    status: status as any,
    search,
    institutionId: auth.institutionId,
  })

  return paginatedResponse(result.data, result.metadata?.total ?? 0, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.title) {
    return errorResponse('title is required', 400)
  }
  if (!body.activity_type) {
    return errorResponse('activity_type is required', 400)
  }

  const result = await MarketingService.createActivity({
    ...body,
    institution_id: auth.institutionId,
  })

  return createdResponse(result)
})
