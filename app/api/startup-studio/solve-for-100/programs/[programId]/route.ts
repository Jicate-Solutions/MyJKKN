import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { programId } = await context!.params!
  const program = await SF100Service.getProgram(programId)

  if (!program) {
    return errorResponse('Program not found', 404)
  }

  return successApiResponse(program)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { programId } = await context!.params!
  const body = await request.json()

  const program = await SF100Service.updateProgram(programId, body)
  return successApiResponse(program)
})
