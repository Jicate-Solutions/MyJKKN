import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Module Registry ────────────────────────────────────────────────────────

export const VALID_MODULES = [
  'academic',
  'admission', 'attendance', 'billing', 'grievance', 'okr',
  'learners', 'staff', 'organizations', 'campus-living', 'solutions',
  'learners-council', 'competency', 'learning-paths', 'alumni',
  'facilitator', 'industry', 'parent-portal', 'social-media',
  'vac', 'maturity-assessment', 'process-excellence', 'notifications',
  'resource-management', 'bug-reports', 'stakeholder-nps', 'audit-trail',
  'morning-brief',
  // ── InstaSolver — service_request split from grievance.
  //
  // 'requirement' was RETIRED here on 2026-09-14. The requirement track never
  // had a table and now never will: the Director's locked decisions
  // (specs/instasolver-2026-09-14.md) send purchases to Procurement and broken
  // things to Campus Walk, and this PR deletes the route and the MCP tool. A
  // module key that resolves to a deleted endpoint is worse than no module key.
  //
  // No key migration is needed and none is done. normalizeField() below FILTERS
  // a key's permission arrays against this list rather than rejecting the key,
  // so an already-issued key scoped to ['grievance','requirement'] keeps
  // authenticating and simply loses the dead scope. Removing the entry is what
  // retires it — everywhere, at once, including the /api/b2a/manifest listing
  // and any admin UI that offers modules to grant.
  'service_request',
  // ── External AI door (2026-07-16) — ₹0 Max-lane access for trusted first-party
  // callers (the centralized bug reporter). See app/api/b2a/ai/run.
  'ai',
] as const;

export type ApiModule = typeof VALID_MODULES[number];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiKeyContext {
  keyId: string;
  keyName: string;
  institutionId: string | null;   // null = super key (all institutions)
  permissions: {
    read: ApiModule[] | true;     // true = legacy all-access
    write: ApiModule[] | true;
  };
  supabase: SupabaseClient;       // Service role client — bypasses RLS
}

type AuthSuccess = { context: ApiKeyContext };
type AuthError   = { error: NextResponse };
export type AuthResult  = AuthSuccess | AuthError;

// ─── Error helpers ──────────────────────────────────────────────────────────

function unauthorized(message: string): AuthError {
  return {
    error: NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message } },
      { status: 401, headers: corsHeaders }
    ),
  };
}

function forbidden(message: string): AuthError {
  return {
    error: NextResponse.json(
      { error: { code: 'FORBIDDEN', message } },
      { status: 403, headers: corsHeaders }
    ),
  };
}

// ─── Permission helpers ─────────────────────────────────────────────────────

export function hasModuleAccess(
  permissions: ApiModule[] | true,
  module: ApiModule
): boolean {
  if (permissions === true) return true;
  return permissions.includes(module);
}

function normalizePermissions(raw: unknown): ApiKeyContext['permissions'] {
  if (!raw || typeof raw !== 'object') {
    return { read: [], write: [] };
  }

  const p = raw as Record<string, unknown>;

  const normalizeField = (field: unknown): ApiModule[] | true => {
    if (field === true) return true;
    if (Array.isArray(field)) return field.filter(
      (m): m is ApiModule => VALID_MODULES.includes(m as ApiModule)
    );
    return [];
  };

  return {
    read: normalizeField(p.read),
    write: normalizeField(p.write),
  };
}

// ─── Main function ──────────────────────────────────────────────────────────

export async function authenticateApiKey(
  request: NextRequest,
  options?: {
    requiredModule?: ApiModule;
    requireRead?: boolean;   // default: true
    requireWrite?: boolean;  // default: false
  }
): Promise<AuthResult> {
  const { requiredModule, requireRead = true, requireWrite = false } = options ?? {};

  // 1. Extract Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized('API key is required. Use Authorization: Bearer <key>');
  }

  const apiKey = authHeader.substring(7).trim();
  if (!apiKey) {
    return unauthorized('API key is empty');
  }

  // A person's own outside-AI key (made on /ai-query/connect) works ONLY at the
  // MCP door, where it runs as that person. The B2A routes query with the
  // service role, so they never accept one. The row itself also carries
  // permissions {read:false, write:false} by constraint (20270301090000).
  if (apiKey.startsWith('jkkn_pk_')) {
    return unauthorized('This personal key only works with the MyJKKN MCP connection (/api/mcp/mcp)');
  }

  // 2. SHA-256 hash the raw key
  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

  // 3. Create service role client
  const supabase = createServiceRoleClient();

  // 4. Look up key in database
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, name, key_value, is_active, expires_at, permissions')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    return unauthorized('Invalid or inactive API key');
  }

  // 5. Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return unauthorized('API key has expired');
  }

  // 6. Normalize permissions (handles legacy {read:true} and new {read:['module']} formats)
  const permissions = normalizePermissions(keyData.permissions);

  // 7. Check module access
  if (requiredModule) {
    if (requireRead && !hasModuleAccess(permissions.read, requiredModule)) {
      return forbidden(`API key does not have read access to module: ${requiredModule}`);
    }
    if (requireWrite && !hasModuleAccess(permissions.write, requiredModule)) {
      return forbidden(`API key does not have write access to module: ${requiredModule}`);
    }
  }

  // 8. Fire-and-forget: update last_used_at (never block the response)
  void Promise.resolve(
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id)
  ).then(() => {})
    .catch((err: unknown) => {
      console.warn('[api-keys/authenticate] Failed to update last_used_at', {
        keyId: keyData.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  // 9. Return context with service role client ready for queries
  return {
    context: {
      keyId: keyData.id,
      keyName: keyData.name,
      institutionId: null,
      permissions,
      supabase,
    },
  };
}

// ─── Institution resolver ────────────────────────────────────────────────────

export function resolveInstitutionId(
  context: ApiKeyContext,
  request: NextRequest
): string | null {
  const url = new URL(request.url);
  const queryId = url.searchParams.get('institutionId')
    ?? url.searchParams.get('institution_id');

  if (context.institutionId) {
    // Key is bound to a specific institution — reject mismatched query param
    if (queryId && queryId !== context.institutionId) return null;
    return context.institutionId;
  }

  return queryId; // null if not provided — caller should return 400
}
