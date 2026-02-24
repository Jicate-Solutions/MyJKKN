// lib/auth/impersonate.ts
// JWT impersonation helper for API key auth.
// Creates a Supabase client that carries a JWT for the key owner,
// so PostgREST sets request.jwt.claims automatically on every request.
// All RLS policies (auth.uid(), sh_is_admin(), auth_institution_id())
// evaluate correctly as the impersonated user.

import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

/**
 * Create a Supabase client that impersonates a specific user.
 * Used by withAuth when API key auth is detected.
 *
 * ASYNC because jose uses Web Crypto for signing.
 *
 * SECURITY: Never log the returned client's auth token.
 * The token is server-side only and travels over TLS to Supabase.
 */
export async function createImpersonatedClient(userId: string) {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET is required for API key impersonation')
  }

  const token = await new SignJWT({
    sub: userId,
    role: 'authenticated',
    iss: 'supabase',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60s') // Disposable per-request token
    .sign(new TextEncoder().encode(jwtSecret))

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
