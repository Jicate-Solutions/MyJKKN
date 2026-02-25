// app/api/crm/api-key/route.ts
// Returns the CRM_API_KEY for authenticated super_admin users only.
// SECURITY: This route exposes a sensitive environment variable.
// It is restricted to super_admin role to prevent unauthorized access.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth/with-auth'

export const GET = withAuth(
  async (_request: NextRequest, auth: AuthContext) => {
    const apiKey = process.env.CRM_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured on server' },
        { status: 500 }
      )
    }

    console.info(`[crm/api-key] API key retrieved by user ${auth.user.id} (${auth.user.email})`)

    return NextResponse.json({ apiKey })
  },
  {
    allowApiKey: false,
    requireRole: ['super_admin'],
    requiredPermission: 'read',
  }
)
