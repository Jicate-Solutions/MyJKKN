import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RDIFService } from '@/lib/services/solutions/rdif-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await RDIFService.calculateRDIFScore()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
