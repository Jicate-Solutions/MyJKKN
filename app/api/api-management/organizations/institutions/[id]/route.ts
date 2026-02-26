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

  // For institutions table: verify the requested id matches the scoped institution
  if (institutionId && id !== institutionId) {
    return errorResponse('Institution not found', 404)
  }

  const { data, error } = await (auth.supabase as any)
    .from('institutions')
    .select(`
      *,
      departments:departments(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return errorResponse('Institution not found', 404)
    }
    throw error
  }

  if (!data) return errorResponse('Institution not found', 404)

  return NextResponse.json({ data }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
