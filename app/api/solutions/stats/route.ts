import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SolutionsService } from '@/lib/services/solutions/solutions-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await SolutionsService.getSolutionStats()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
