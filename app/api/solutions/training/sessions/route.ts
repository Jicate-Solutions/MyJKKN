import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrainingService } from '@/lib/services/solutions/training-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const program_id = getUuidParam(url, 'program_id')
  const status = getStringParam(url, 'status')
  const from_date = getStringParam(url, 'from_date')
  const to_date = getStringParam(url, 'to_date')

  const result = await TrainingService.getSessions({
    page,
    limit,
    program_id,
    status: status as any,
    from_date,
    to_date,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.program_id) {
    return errorResponse('program_id is required', 400)
  }

  const result = await TrainingService.createSession(body)
  return createdResponse(result)
})
