import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PublicationsService } from '@/lib/services/solutions/publications-service'
import { successApiResponse, createdResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await PublicationsService.getContributors(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  const result = await PublicationsService.addContributor({
    ...body,
    publication_id: id,
  })

  return createdResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const url = new URL(request.url)
  const contributorId = url.searchParams.get('contributor_id')
  if (!contributorId) {
    return errorResponse('contributor_id query parameter is required', 400)
  }

  await PublicationsService.removeContributor(contributorId)
  return noContentResponse()
})
