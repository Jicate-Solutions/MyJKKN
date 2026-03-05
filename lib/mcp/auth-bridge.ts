// lib/mcp/auth-bridge.ts
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { VALID_MODULES, type ApiModule } from '@/lib/api-keys/authenticate';
import type { McpAuthContext, McpUserRole } from '@/lib/mcp/types';

/**
 * Normalizes the `permissions` JSONB from the api_keys table.
 * Handles both legacy `{read: true}` and new `{read: ['module']}` formats.
 */
function normalizePermissions(raw: unknown): McpAuthContext['permissions'] {
  if (!raw || typeof raw !== 'object') {
    return { read: [], write: [] };
  }

  const p = raw as Record<string, unknown>;

  const normalizeField = (field: unknown): ApiModule[] | true => {
    if (field === true) return true;
    if (Array.isArray(field)) return field.filter(
      (m): m is ApiModule => (VALID_MODULES as readonly string[]).includes(m)
    );
    return [];
  };

  return {
    read: normalizeField(p.read),
    write: normalizeField(p.write),
  };
}

/**
 * Validates a user_role string from the database.
 * Defaults to 'admin' for backward compatibility with keys that don't have user_role set.
 */
function parseUserRole(raw: string | null): McpUserRole {
  const valid: McpUserRole[] = ['student', 'faculty', 'admin', 'super_admin'];
  if (raw && (valid as string[]).includes(raw)) return raw as McpUserRole;
  return 'admin'; // Default — existing keys without user_role behave as admin
}

/**
 * Token verifier function compatible with `mcp-handler`'s `withMcpAuth()`.
 *
 * Called on every MCP request. Extracts the Bearer token, hashes it,
 * looks up the api_keys table, and returns an AuthInfo object with
 * McpAuthContext in the `extra` field.
 *
 * Returns `undefined` if the key is invalid/expired/inactive.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<
  | {
      token: string;
      clientId: string;
      scopes: string[];
      extra: McpAuthContext;
    }
  | undefined
> {
  if (!bearerToken) return undefined;

  // SHA-256 hash the raw key (same as authenticate.ts)
  const hashedKey = createHash('sha256').update(bearerToken).digest('hex');
  const supabase = createServiceRoleClient();

  // Look up the key — now also selecting user_id, user_role, department_id, institution_id
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, name, key_value, is_active, expires_at, permissions, institution_id, user_id, user_role, department_id')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) return undefined;

  // Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return undefined;
  }

  // Fire-and-forget: update last_used_at
  void Promise.resolve(
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id)
  ).then(() => {})
    .catch(() => {});

  const permissions = normalizePermissions(keyData.permissions);
  const userRole = parseUserRole(keyData.user_role);

  // institution_id is required for MCP (no super key concept in MCP — too dangerous)
  // If key has no institution binding, reject it for MCP use
  if (!keyData.institution_id) return undefined;

  const mcpContext: McpAuthContext = {
    keyId: keyData.id,
    keyName: keyData.name,
    userId: keyData.user_id ?? null,
    userRole,
    institutionId: keyData.institution_id,
    departmentId: keyData.department_id ?? null,
    permissions,
    supabase,
  };

  return {
    token: bearerToken,
    clientId: keyData.id,
    scopes: [], // We use module permissions, not OAuth scopes
    extra: mcpContext,
  };
}
