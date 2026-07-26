import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SolutionReposService } from '@/lib/services/solutions/solution-repos-service'
import { successResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Bulk-link many GitHub repos to one solution in a single call.
// Same auth/permission guard as the single-link route (POST /api/solutions/repos):
// withAuth with no options → requiredPermission 'write', API-key auth allowed.
export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.solution_id || !Array.isArray(body.repo_full_names)) {
    return errorResponse('solution_id and repo_full_names (array) are required', 400)
  }

  try {
    const result = await SolutionReposService.bulkLinkRepos(
      auth.supabase,
      body.solution_id,
      body.repo_full_names,
      auth.user.id,
    )
    // { linked, skipped, invalid } — never throws on an already-linked repo.
    return successResponse(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to link repositories'
    return errorResponse(message, 400)
  }
})
