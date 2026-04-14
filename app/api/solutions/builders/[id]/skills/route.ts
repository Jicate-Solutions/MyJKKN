import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuildersService } from '@/lib/services/solutions/builders-service'
import { successApiResponse, createdResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await BuildersService.getBuilderSkills(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  const result = await BuildersService.addBuilderSkill({
    builder_id: id,
    skill_name: body.skill_name,
    proficiency_level: body.proficiency_level,
    assessed_date: body.assessed_date,
  })

  return createdResponse(result)
})
