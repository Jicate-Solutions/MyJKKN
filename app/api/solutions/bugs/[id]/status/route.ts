import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BugsService } from '@/lib/services/solutions/bugs-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { status } = body

  if (!status) {
    return errorResponse('status is required', 400)
  }

  let result
  switch (status) {
    case 'resolved':
      result = await BugsService.resolveBug(
        id,
        body.resolved_by ?? auth.user.id,
        body.resolution_notes
      )
      break
    case 'closed':
      result = await BugsService.closeBug(id)
      break
    case 'open':
      result = await BugsService.reopenBug(id)
      break
    default:
      result = await BugsService.updateBug(id, { status })
  }

  return successApiResponse(result)
})
