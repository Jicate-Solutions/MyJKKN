import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio/sf100-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const type = getStringParam(url, 'type')

  const result = await SF100Service.listCheckIns(enrollmentId, {
    type,
    page,
    limit,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { enrollmentId } = await context!.params!
  const body = await request.json()

  if (!body.type) {
    return errorResponse('type is required (weekly or micro)', 400)
  }

  const result = await SF100Service.submitCheckIn(enrollmentId, {
    type: body.type,
    what_did_you_do: body.what_did_you_do,
    blockers: body.blockers,
    next_steps: body.next_steps,
    wins: body.wins,
    micro_update: body.micro_update,
    metric_snapshot: body.metric_snapshot,
  }, auth.user.id)

  return createdResponse(result)
})
