import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SolutionReposService } from '@/lib/services/solutions/solution-repos-service'
import { getSolutionRepoActivity } from '@/lib/services/solutions/repo-activity-service'
import { successResponse, errorResponse } from '@/lib/api/response'
import { getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Live GitHub activity for every repo linked to a solution.
// Read-only; visible to anyone who can open the solution (decision 4) — the
// same withAuth 'read' gate as the sibling solutions endpoints.
export const GET = withAuth(async (request) => {
  const url = new URL(request.url)
  const solution_id = getUuidParam(url, 'solution_id')

  if (!solution_id) {
    return errorResponse('solution_id is required', 400)
  }

  const links = await SolutionReposService.getRepos(solution_id)
  const activity = await getSolutionRepoActivity(links.map((l) => l.repo_full_name))
  return successResponse(activity)
}, { requiredPermission: 'read' })
