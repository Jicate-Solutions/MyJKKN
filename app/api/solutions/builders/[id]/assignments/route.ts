import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuildersService } from '@/lib/services/solutions/builders-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const builder = await BuildersService.getBuilderById(id)
  const assignments = builder?.assignments ?? []
  return successApiResponse(assignments)
}, { requiredPermission: 'read' })
