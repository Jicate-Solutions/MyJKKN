import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/progress — the caller's Level-0 completion + graduation
export const GET = withAuth(
  async (request, auth) => {
    const progress = await FoundationsService.getProgress(auth.user.id)
    return successApiResponse(progress)
  },
  { requiredPermission: 'read' }
)
