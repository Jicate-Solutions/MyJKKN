import { NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/api-keys/cors'
import { withAuth } from '@/lib/auth/with-auth'
import { errorResponse } from '@/lib/api-keys/response-helpers'

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders })

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const institutionId = auth.institutionId

  if (auth.authMethod === 'api_key' && !institutionId) {
    return errorResponse('API key must be associated with an organization', 400)
  }

  let query = (auth.supabase as any)
    .from('sections')
    .select('*')
    .eq('id', id)

  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('Section not found', 404)
    }
    throw error
  }

  if (!data) return errorResponse('Section not found', 404)

  return NextResponse.json({ data }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
