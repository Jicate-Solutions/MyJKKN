// lib/auth/with-auth.ts
// Unified auth middleware for Solutions Hub API routes.
// Handles BOTH session auth (browser users) and API key auth (external consumers).
// RLS is always enforced — never uses SERVICE_ROLE_KEY for data queries.

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createImpersonatedClient } from '@/lib/auth/impersonate'
import { BaseService } from '@/lib/services/base-service'
import { corsHeaders } from '@/lib/api-keys/cors'
import { errorResponse } from '@/lib/api/response'
import { createClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────

/**
 * Unified auth user — NOT the GoTrue User object.
 * For session auth: built from profiles table.
 * For API key auth: built from profiles table lookup on api_keys.created_by.
 */
export interface AuthUser {
  id: string
  email: string
  role: string
  institution_id: string | null
  full_name?: string
}

export interface ApiKeyData {
  id: string
  name: string
  key_value: string
  created_by: string
  expires_at: string | null
  last_used_at: string | null
  is_active: boolean
  permissions: { read?: boolean; write?: boolean } | string[]
  organization_id: string | null
  created_at: string
  updated_at: string
}

export interface AuthContext {
  user: AuthUser
  authMethod: 'session' | 'api_key'
  supabase: any // Server-side client with user's RLS context
  apiKeyData?: ApiKeyData
  institutionId: string | null
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse>

interface AuthOptions {
  /**
   * Permission level needed. 'read' for GET, 'write' for POST/PATCH/DELETE.
   * Defaults to 'write' (safe-by-default).
   */
  requiredPermission?: 'read' | 'write'
  /** Allow API key auth. Defaults to true. Set false for portal routes. */
  allowApiKey?: boolean
  /** Optional role check (e.g., ['admin', 'super_admin']). */
  requireRole?: string[]
}

// ── Postgres Error Mapping ───────────────────────────────────

const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'Resource already exists (unique violation)' },
  '23502': { status: 400, message: 'Required field missing (not-null violation)' },
  '23503': { status: 400, message: 'Referenced resource not found (FK violation)' },
  '42501': { status: 403, message: 'Insufficient privileges' },
  '22P02': { status: 400, message: 'Invalid input syntax' },
}

// ── Permission Check ─────────────────────────────────────────

function hasPermission(permissions: ApiKeyData['permissions'], required: 'read' | 'write'): boolean {
  if (Array.isArray(permissions)) {
    return permissions.includes(required)
  }
  if (typeof permissions === 'object' && permissions !== null) {
    return !!permissions[required]
  }
  return false
}

// ── Service Role Client (for API key lookup only) ────────────

function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// ── Main Middleware ───────────────────────────────────────────

/**
 * Wraps an API route handler with unified authentication.
 *
 * Auth detection order (cookies first, not Bearer first):
 * 1. Check for Supabase session cookie → Session flow
 * 2. If no cookie, check Authorization: Bearer → API key flow
 * 3. Neither → 401
 */
export function withAuth(handler: AuthenticatedHandler, options?: AuthOptions) {
  const requiredPermission = options?.requiredPermission ?? 'write'
  const allowApiKey = options?.allowApiKey ?? true

  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      // ── Step 1: Detect auth method (cookies-first) ──────────

      const cookieStore = await cookies()
      // NOTE: Supabase splits large JWTs into chunked cookies: sb-xxx-auth-token.0, .1, etc.
      // Using .includes('-auth-token') catches BOTH the base cookie AND chunks.
      const hasSessionCookie = cookieStore.getAll().some(
        c => c.name.startsWith('sb-') && c.name.includes('-auth-token')
      )

      let auth: AuthContext

      if (hasSessionCookie) {
        // ── Session Flow ──────────────────────────────────────
        auth = await handleSessionAuth(request, requiredPermission)
      } else {
        // ── API Key Flow ──────────────────────────────────────
        if (!allowApiKey) {
          return errorResponse('This endpoint requires browser session authentication', 401)
        }

        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return errorResponse('Authentication required. Provide session cookie or Bearer API key.', 401)
        }

        auth = await handleApiKeyAuth(request, authHeader, requiredPermission)
      }

      // ── Step 2: Role check (optional) ───────────────────────
      if (options?.requireRole && options.requireRole.length > 0) {
        if (!options.requireRole.includes(auth.user.role)) {
          return errorResponse(
            `Insufficient role. Required: ${options.requireRole.join(' or ')}`,
            403
          )
        }
      }

      // ── Step 3: Structured log (auth success) ───────────────
      console.log(JSON.stringify({
        event: 'auth',
        method: auth.authMethod,
        userId: auth.user.id,
        institutionId: auth.institutionId,
        route: request.nextUrl.pathname,
        status: 'success',
      }))

      // ── Step 4: Run handler with injected client ────────────
      // eslint-disable-next-line no-return-await — INTENTIONAL: errors escape try/catch without await
      return await BaseService.runWithClient(auth.supabase, async () => {
        return handler(request, auth, context)
      })
    } catch (error: any) {
      // ── Error Classification ────────────────────────────────

      // Auth failures (thrown by handleSessionAuth / handleApiKeyAuth)
      if (error instanceof AuthError) {
        console.warn(JSON.stringify({
          event: 'auth_failure',
          reason: error.reason,
          route: request.nextUrl.pathname,
        }))
        return errorResponse(error.message, error.status)
      }

      // JSON parse failure
      if (error instanceof SyntaxError) {
        return errorResponse('Invalid JSON in request body', 400)
      }

      // Postgres constraint violations
      const pgCode = typeof error?.code === 'string' ? error.code : ''
      if (pgCode && PG_ERROR_MAP[pgCode]) {
        const mapped = PG_ERROR_MAP[pgCode]
        return errorResponse(mapped.message, mapped.status)
      }

      // Generic Postgres errors (23xxx range)
      if (/^23\d{3}$/.test(pgCode)) {
        return errorResponse('Data validation failed', 422)
      }

      // Everything else is a genuine server error
      // SECURITY: Never log JWT tokens or API key values
      console.error('[withAuth] Unhandled error:', {
        message: error?.message,
        code: error?.code,
        route: request.nextUrl.pathname,
      })
      return errorResponse('Internal server error', 500)
    }
  }
}

// ── Auth Error Class ─────────────────────────────────────────

class AuthError extends Error {
  status: number
  reason: string

  constructor(message: string, status: number, reason: string) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.reason = reason
  }
}

// ── Session Auth Handler ─────────────────────────────────────

async function handleSessionAuth(
  request: NextRequest,
  _requiredPermission: string
): Promise<AuthContext> {
  const serverClient = await createServerSupabaseClient()

  const { data: { user }, error: userError } = await serverClient.auth.getUser()
  if (userError || !user) {
    throw new AuthError(
      'Session authentication failed. If using API key auth, clear cookies and retry.',
      401,
      'no_session'
    )
  }

  // Fetch profile for AuthUser fields
  const { data: profile, error: profileError } = await (serverClient as any)
    .from('profiles')
    .select('id, email, role, institution_id, full_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new AuthError('User profile not found', 401, 'missing_profile')
  }

  const authUser: AuthUser = {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    institution_id: profile.institution_id,
    full_name: profile.full_name,
  }

  return {
    user: authUser,
    authMethod: 'session',
    supabase: serverClient,
    institutionId: profile.institution_id,
  }
}

// ── API Key Auth Handler ─────────────────────────────────────

async function handleApiKeyAuth(
  request: NextRequest,
  authHeader: string,
  requiredPermission: string
): Promise<AuthContext> {
  const apiKey = authHeader.substring(7)
  const hashedKey = createHash('sha256').update(apiKey).digest('hex')

  // Use SERVICE_ROLE_KEY client ONLY for the api_keys + profile lookup
  const serviceClient = createServiceRoleClient()

  // Look up API key
  const { data: keyData, error: keyError } = await (serviceClient as any)
    .from('api_keys')
    .select('*')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single()

  if (keyError || !keyData) {
    throw new AuthError('Invalid API key', 401, 'invalid_key')
  }

  // Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    throw new AuthError('API key has expired', 401, 'expired_key')
  }

  // Check permission
  if (!hasPermission(keyData.permissions, requiredPermission as 'read' | 'write')) {
    throw new AuthError(
      `API key does not have '${requiredPermission}' permission`,
      403,
      'permission_denied'
    )
  }

  // Fetch key owner's profile
  const { data: profile, error: profileError } = await (serviceClient as any)
    .from('profiles')
    .select('id, email, role, institution_id, full_name')
    .eq('id', keyData.created_by)
    .single()

  if (profileError || !profile) {
    throw new AuthError('API key owner account not found', 401, 'missing_profile')
  }

  // Create impersonated client — RLS will evaluate as the key owner
  const impersonatedClient = await createImpersonatedClient(keyData.created_by)

  // Update last_used_at (fire-and-forget)
  ;(serviceClient as any)
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyData.id)
    .then(() => {})
    .catch(() => {})

  const authUser: AuthUser = {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    institution_id: profile.institution_id,
    full_name: profile.full_name,
  }

  return {
    user: authUser,
    authMethod: 'api_key',
    supabase: impersonatedClient,
    apiKeyData: keyData as ApiKeyData,
    institutionId: profile.institution_id,
  }
}
