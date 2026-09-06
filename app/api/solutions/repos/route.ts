import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SolutionReposService } from '@/lib/services/solutions/solution-repos-service'
import { successResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request) => {
  const url = new URL(request.url)
  const solution_id = getUuidParam(url, 'solution_id')

  if (!solution_id) {
    return errorResponse('solution_id is required', 400)
  }

  const repos = await SolutionReposService.getRepos(solution_id)
  return successResponse(repos)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.solution_id || !body.repo_full_name) {
    return errorResponse('solution_id and repo_full_name are required', 400)
  }

  try {
    const result = await SolutionReposService.linkRepo({
      solution_id: body.solution_id,
      repo_full_name: body.repo_full_name,
      linked_by: auth.user.id,
    })
    return createdResponse(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to link repository'
    return errorResponse(message, 400)
  }
})

export const DELETE = withAuth(async (request) => {
  const url = new URL(request.url)
  const id = getUuidParam(url, 'id')

  if (!id) {
    return errorResponse('id is required', 400)
  }

  await SolutionReposService.unlinkRepo(id)
  return successResponse({ id })
})
