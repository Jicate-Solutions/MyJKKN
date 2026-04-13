/**
 * RLS Expression Parser
 *
 * Classifies Supabase RLS policy USING/WITH CHECK SQL expressions into
 * human-readable access types using regex pattern matching (~80% coverage
 * with graceful fallback to 'complex').
 */

export type AccessType =
  | 'role_check'
  | 'permission_based'
  | 'super_admin'
  | 'institution_scoped'
  | 'self_only'
  | 'service_role'
  | 'all_authenticated'
  | 'permissive'
  | 'complex';

export interface ParsedExpression {
  accessType: AccessType;
  /** Human-readable label, e.g. "Roles: admin, faculty" */
  label: string;
  /** Extracted role names (populated when accessType is 'role_check' or 'super_admin') */
  roles: string[];
  /** Permission key string if accessType is 'permission_based', otherwise null */
  permissionKey: string | null;
  /** Whether the expression includes an institution-scoped check */
  hasInstitutionScope: boolean;
  /** Whether the expression includes a self-access check (auth.uid()) */
  hasSelfAccess: boolean;
  /** The original SQL expression */
  rawExpression: string;
  /** Icon hint for UI rendering */
  icon: string;
}

// ── Regex patterns ──────────────────────────────────────────────────────

const TRUE_PATTERN = /^\s*\(?\s*true\s*\)?\s*$/i;
const SERVICE_ROLE_PATTERN = /auth\.jwt\(\)\s*->>?\s*'role'\s*=\s*'service_role'/i;
const PERMISSION_PATTERN = /user_has_permission\(\s*'([^']+)'\s*\)/i;
const SUPER_ADMIN_PATTERN = /is_super_admin\(\)/i;
const ROLE_IN_PATTERN = /get_current_user_role\(\)\s+IN\s*\(\s*([^)]+)\s*\)/i;
const ROLE_EQ_PATTERN = /get_current_user_role\(\)\s*=\s*'([^']+)'/i;
const SELF_ACCESS_PATTERN =
  /(?:user_id|created_by)\s*=\s*auth\.uid\(\)|learner_id\s*=\s*\(\s*SELECT\s+learner_id\s+FROM\s+profiles/i;
const ALL_AUTHENTICATED_PATTERN = /auth\.uid\(\)\s+IS\s+NOT\s+NULL/i;
const INSTITUTION_PATTERN = /institution_id\s*=\s*get_current_user_institution_id\(\)/i;

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Extract role names from `get_current_user_role()` checks and
 * `is_super_admin()` calls within an expression.
 */
function extractRoles(expression: string): string[] {
  const roles: string[] = [];

  // Match IN ('role1', 'role2', ...)
  const inMatch = expression.match(ROLE_IN_PATTERN);
  if (inMatch) {
    const inner = inMatch[1];
    const roleMatches = inner.match(/'([^']+)'/g);
    if (roleMatches) {
      for (const m of roleMatches) {
        roles.push(m.replace(/'/g, ''));
      }
    }
  }

  // Match = 'role'
  const eqMatch = expression.match(ROLE_EQ_PATTERN);
  if (eqMatch && !roles.includes(eqMatch[1])) {
    roles.push(eqMatch[1]);
  }

  // If super_admin function is present, include it as a role
  if (SUPER_ADMIN_PATTERN.test(expression) && !roles.includes('super_admin')) {
    roles.push('super_admin');
  }

  return roles;
}

/**
 * Detect whether the expression contains an institution-scope check.
 */
function hasInstitutionScope(expression: string): boolean {
  return INSTITUTION_PATTERN.test(expression);
}

/**
 * Detect whether the expression contains a self-access check.
 */
function hasSelfAccess(expression: string): boolean {
  return SELF_ACCESS_PATTERN.test(expression);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Parse and classify a Supabase RLS policy SQL expression into a structured
 * {@link ParsedExpression}.
 *
 * Patterns are checked in priority order so the most specific classification
 * wins. Sub-patterns (institution scope, self-access) are always evaluated
 * regardless of the primary classification.
 *
 * @param expression - The raw SQL expression from a policy's USING or
 *   WITH CHECK clause. `null` is treated as a permissive (TRUE) policy.
 * @returns A fully populated {@link ParsedExpression}.
 */
export function parseRlsExpression(expression: string | null): ParsedExpression {
  const raw = expression ?? 'true';
  const instScope = hasInstitutionScope(raw);
  const selfAccess = hasSelfAccess(raw);

  const base = {
    rawExpression: raw,
    hasInstitutionScope: instScope,
    hasSelfAccess: selfAccess,
    permissionKey: null as string | null,
    roles: [] as string[],
  };

  // 1. TRUE / permissive
  if (TRUE_PATTERN.test(raw)) {
    return {
      ...base,
      accessType: 'permissive',
      label: 'Open access (TRUE)',
      icon: 'unlock',
    };
  }

  // 2. Service role
  if (SERVICE_ROLE_PATTERN.test(raw)) {
    return {
      ...base,
      accessType: 'service_role',
      label: 'Service role only',
      icon: 'server',
    };
  }

  // 3. Permission-based
  const permMatch = raw.match(PERMISSION_PATTERN);
  if (permMatch) {
    return {
      ...base,
      accessType: 'permission_based',
      label: `Permission: ${permMatch[1]}`,
      permissionKey: permMatch[1],
      icon: 'key',
    };
  }

  // 4. Super admin
  if (SUPER_ADMIN_PATTERN.test(raw)) {
    const roles = extractRoles(raw);
    return {
      ...base,
      accessType: 'super_admin',
      label:
        roles.length > 1
          ? `Super Admin + Roles: ${roles.filter((r) => r !== 'super_admin').join(', ')}`
          : 'Super Admin',
      roles,
      icon: 'shield',
    };
  }

  // 5. Role check
  const roleInMatch = raw.match(ROLE_IN_PATTERN);
  const roleEqMatch = raw.match(ROLE_EQ_PATTERN);
  if (roleInMatch || roleEqMatch) {
    const roles = extractRoles(raw);
    return {
      ...base,
      accessType: 'role_check',
      label: `Roles: ${roles.join(', ')}`,
      roles,
      icon: 'users',
    };
  }

  // 6. Self only
  if (SELF_ACCESS_PATTERN.test(raw)) {
    return {
      ...base,
      accessType: 'self_only',
      label: 'Own records only',
      icon: 'user',
    };
  }

  // 7. All authenticated
  if (ALL_AUTHENTICATED_PATTERN.test(raw)) {
    return {
      ...base,
      accessType: 'all_authenticated',
      label: 'All authenticated users',
      icon: 'users',
    };
  }

  // 8. Institution scoped (only if not already matched above)
  if (instScope) {
    return {
      ...base,
      accessType: 'institution_scoped',
      label: 'Institution scoped',
      icon: 'building',
    };
  }

  // 9. Complex fallback
  return {
    ...base,
    accessType: 'complex',
    label: 'Complex expression',
    icon: 'code',
  };
}

/**
 * Determine whether a policy would grant access to a given role key,
 * based on the parsed expression and the role's permissions map.
 *
 * @param parsed - The result of {@link parseRlsExpression}.
 * @param roleKey - The role identifier to check (e.g. `"admin"`, `"service_role"`).
 * @param rolePermissions - A map of permission keys to booleans for the role.
 * @returns `true` if access is granted, `false` if denied, or `null` if the
 *   determination requires runtime context (user identity, row data, etc.).
 */
export function wouldPolicyGrantAccess(
  parsed: ParsedExpression,
  roleKey: string,
  rolePermissions: Record<string, boolean>
): boolean | null {
  switch (parsed.accessType) {
    case 'permissive':
    case 'all_authenticated':
      return true;

    case 'service_role':
      return roleKey === 'service_role';

    case 'super_admin':
      return roleKey === 'super_admin' || parsed.roles.includes(roleKey);

    case 'role_check':
      return parsed.roles.includes(roleKey);

    case 'permission_based':
      return parsed.permissionKey ? rolePermissions[parsed.permissionKey] === true : null;

    case 'self_only':
    case 'institution_scoped':
    case 'complex':
      return null;

    default:
      return null;
  }
}

/**
 * Map a PostgreSQL policy command string to a single CRUD letter.
 *
 * @param cmd - The policy command: `"INSERT"`, `"SELECT"`, `"UPDATE"`,
 *   `"DELETE"`, or `"ALL"`.
 * @returns `'C'`, `'R'`, `'U'`, `'D'`, or `null` for `"ALL"` / unknown.
 */
export function opToCrud(cmd: string): 'C' | 'R' | 'U' | 'D' | null {
  switch (cmd.toUpperCase().trim()) {
    case 'INSERT':
      return 'C';
    case 'SELECT':
      return 'R';
    case 'UPDATE':
      return 'U';
    case 'DELETE':
      return 'D';
    default:
      return null;
  }
}
