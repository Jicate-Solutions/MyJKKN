import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuildersService } from '@/lib/services/solutions/builders-service'
import { successApiResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { skillId } = await context!.params!
  const body = await request.json()
  const result = await BuildersService.updateBuilderSkill(skillId, {
    proficiency_level: body.proficiency_level,
  })
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { skillId } = await context!.params!
  await BuildersService.removeBuilderSkill(skillId)
  return noContentResponse()
})
