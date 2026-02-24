import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductsService } from '@/lib/services/solutions/products-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await ProductsService.getPrerequisites()
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.prerequisite_key) {
    return errorResponse('prerequisite_key is required', 400)
  }

  const { prerequisite_key, ...updateData } = body
  const result = await ProductsService.updatePrerequisite(prerequisite_key, {
    ...updateData,
    updated_by: auth.user.id,
  })

  return successApiResponse(result)
})
