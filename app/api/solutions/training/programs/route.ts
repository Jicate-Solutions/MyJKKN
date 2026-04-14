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
  const program_type = getStringParam(url, 'program_type')
  const track = getStringParam(url, 'track')
  const location_preference = getStringParam(url, 'location_preference')
  const solution_id = getUuidParam(url, 'solution_id')

  const result = await TrainingService.getPrograms({
    page,
    limit,
    program_type: program_type as any,
    track: track as any,
    location_preference: location_preference as any,
    solution_id,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.solution_id) {
    return errorResponse('solution_id is required', 400)
  }

  const result = await TrainingService.createProgram(body)
  return createdResponse(result)
})
