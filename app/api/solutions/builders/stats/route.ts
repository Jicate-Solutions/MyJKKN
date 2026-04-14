import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuildersService } from '@/lib/services/solutions/builders-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await BuildersService.getBuilderStats()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
