import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/worksheets/[id]
export const GET = withAuth(
  async (request, auth, context) => {
    const { id } = await context!.params!
    const worksheet = await FoundationsService.getWorksheet(id)
    if (!worksheet) return errorResponse('Worksheet not found', 404)
    return successApiResponse(worksheet)
  },
  { requiredPermission: 'read' }
)
