import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const status = getStringParam(url, 'status')
  const institution_id = getStringParam(url, 'institution_id')

  const result = await SF100Service.listPrograms({
    status,
    institution_id,
    page,
    limit,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.name) {
    return errorResponse('name is required', 400)
  }
  if (!body.hard_deadline) {
    return errorResponse('hard_deadline is required', 400)
  }

  const result = await SF100Service.createProgram(body, auth.user.id)
  return createdResponse(result)
})
