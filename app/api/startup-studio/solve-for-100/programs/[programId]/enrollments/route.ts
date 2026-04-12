import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { programId } = await context!.params!
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const phase = getStringParam(url, 'phase')
  const status = getStringParam(url, 'status')
  const institution_id = getStringParam(url, 'institution_id')
  const search = getStringParam(url, 'search')

  const result = await SF100Service.listEnrollments(programId, {
    phase,
    status,
    institution_id,
    search,
    page,
    limit,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { programId } = await context!.params!
  const body = await request.json()

  if (!body.registration_id) {
    return errorResponse('registration_id is required', 400)
  }

  const result = await SF100Service.enrollTeam(programId, body.registration_id, auth.user.id)
  return createdResponse(result)
})
