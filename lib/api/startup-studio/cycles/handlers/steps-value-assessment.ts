import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CyclesService } from '@/lib/services/startup-studio/cycles-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const result = await CyclesService.upsertValueAssessment(id, body)
  return successApiResponse(result)
})
