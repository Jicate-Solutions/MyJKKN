import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MentorService } from '@/lib/services/startup-studio/mentor-service'
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
  const mentor_type = getStringParam(url, 'mentor_type')
  const domain = getStringParam(url, 'domain')
  const search = getStringParam(url, 'search')

  const result = await MentorService.getMentors({
    page,
    limit,
    status: status as any,
    mentor_type: mentor_type as any,
    domain,
    search,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.name) {
    return errorResponse('name is required', 400)
  }
  if (!body.mentor_type) {
    return errorResponse('mentor_type is required', 400)
  }
  if (!body.domain_expertise || !Array.isArray(body.domain_expertise)) {
    return errorResponse('domain_expertise (array) is required', 400)
  }

  const result = await MentorService.createMentor(body)
  return createdResponse(result)
})
