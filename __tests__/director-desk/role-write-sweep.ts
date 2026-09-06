/**
 * "Which permission keys can be used to REWRITE SOMEBODY'S ROLE?"
 *
 * Answered by reading the SQL, not by reading the key names.
 *
 * WHY THIS EXISTS.
 * `fn_handover_key_is_blocked` walls keys by NAME, and a name does not tell you
 * what a key does. `organizations.leadership.manage` is named after its module.
 * What it authorises is `fn_set_college_leadership`, which DELETEs the sitting
 * Principal's `user_roles` row and INSERTs the caller's with `is_primary = true`,
 * firing `sync_primary_role_trigger`, which writes `profiles.role = 'principal'`.
 * The handover expires on day 8. The role assignment does not. That key passed
 * every name-shaped wall, and no amount of staring at wall clauses would have
 * caught it.
 *
 * So this module derives the answer from the function bodies: every function
 * definition in supabase/, kept if it is SECURITY DEFINER and its body writes
 * user_roles / custom_roles / profiles.role / profiles.is_super_admin /
 * user_institution_access, then the `user_has_permission('…')` keys that
 * authorise it — following one level of `fn_…can_manage`-style helper, because
 * that is how the leadership function is gated.
 *
 * It is a static reader, and it is honest about its limits (see LIMITS below).
 * Its job is to make a NEW role-writing function impossible to add silently, not
 * to be a theorem prover.
 *
 * LIMITS, stated so nobody mistakes a pass for a proof:
 *  - It reads the repo, not production. A function created by hand through the
 *    Management API is invisible to it (feedback_ci_guard_cannot_see_hand_run_sql).
 *  - It resolves permission keys through at most 3 levels of helper call.
 *  - A function gated on a role_key (`cr.role_key = 'induction_lead'`) rather
 *    than a permission key is correctly reported with zero keys: a handover
 *    cannot grant a role_key, so it cannot reach such a function.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const SQL_ROOTS = ['supabase/migrations', 'supabase/setup'];

export type FunctionDef = {
  name: string;
  file: string;
  secdef: boolean;
  body: string;
};

export type RoleWriter = {
  name: string;
  file: string;
  writes: string[];
  keys: string[];
};

/** Strip `-- …` line comments so prose about a table is not read as a write. */
export function stripLineComments(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

function sqlFiles(): string[] {
  const out: string[] = [];
  for (const root of SQL_ROOTS) {
    if (!existsSync(root)) continue;
    for (const f of readdirSync(root)) {
      if (f.endsWith('.sql')) out.push(join(root, f));
    }
  }
  return out.sort();
}

const FN_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi;

/**
 * Every function definition in supabase/, keyed by name. Files are visited in
 * sorted order, so for a function replaced several times the LAST definition
 * wins — the same order the migrations are applied in.
 */
export function loadFunctionDefs(): Map<string, FunctionDef> {
  const defs = new Map<string, FunctionDef>();
  for (const file of sqlFiles()) {
    const sql = readFileSync(file, 'utf8');
    FN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FN_RE.exec(sql)) !== null) {
      const tail = sql.slice(m.index);
      const tagMatch = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(tail);
      if (!tagMatch) continue;
      const tag = tagMatch[0];
      const bodyStart = m.index + tagMatch.index + tag.length;
      const bodyEnd = sql.indexOf(tag, bodyStart);
      if (bodyEnd === -1) continue;
      const header = sql.slice(m.index, m.index + tagMatch.index);
      defs.set(m[1], {
        name: m[1],
        file,
        secdef: /SECURITY\s+DEFINER/i.test(header),
        body: sql.slice(bodyStart, bodyEnd)
      });
      FN_RE.lastIndex = bodyEnd;
    }
  }
  return defs;
}

/**
 * The tables whose contents ARE somebody's access, and therefore whose writes
 * outlive any time-boxed grant.
 */
export const ROLE_WRITE_PATTERNS: ReadonlyArray<{ table: string; re: RegExp }> = [
  { table: 'user_roles', re: /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?user_roles\b/i },
  { table: 'custom_roles', re: /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?custom_roles\b/i },
  {
    table: 'profiles.role',
    re: /\bUPDATE\s+(?:public\.)?profiles\b[\s\S]{0,600}?\bSET\b[\s\S]{0,600}?(^|[^_a-zA-Z.])role\s*=/im
  },
  {
    table: 'profiles.is_super_admin',
    re: /\bUPDATE\s+(?:public\.)?profiles\b[\s\S]{0,600}?\bSET\b[\s\S]{0,600}?is_super_admin\s*=/i
  },
  {
    table: 'user_institution_access',
    re: /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?user_institution_access\b/i
  }
];

const PERM_RE = /user_has_permission\s*\(\s*'([^']+)'/gi;
const CALL_RE = /\b(?:public\.)?(fn_[A-Za-z0-9_]+|is_[A-Za-z0-9_]+|can_[A-Za-z0-9_]+)\s*\(/gi;

/** Permission keys that authorise `name`, following helper calls up to `maxDepth`. */
export function permissionKeysAuthorising(
  name: string,
  defs: Map<string, FunctionDef>,
  depth = 0,
  seen = new Set<string>()
): string[] {
  if (depth > 3 || seen.has(name)) return [];
  seen.add(name);
  const def = defs.get(name);
  if (!def) return [];
  const body = stripLineComments(def.body);
  const keys: string[] = [];
  PERM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERM_RE.exec(body)) !== null) keys.push(m[1]);
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(body)) !== null) {
    if (m[1] === name) continue;
    keys.push(...permissionKeysAuthorising(m[1], defs, depth + 1, seen));
  }
  return keys;
}

/** Every SECURITY DEFINER function that writes an access table, with its keys. */
export function findRoleWriters(defs: Map<string, FunctionDef>): RoleWriter[] {
  const out: RoleWriter[] = [];
  for (const [name, def] of defs) {
    if (!def.secdef) continue;
    const body = stripLineComments(def.body);
    const writes = ROLE_WRITE_PATTERNS.filter((p) => p.re.test(body)).map((p) => p.table);
    if (writes.length === 0) continue;
    out.push({
      name,
      file: def.file,
      writes,
      keys: [...new Set(permissionKeysAuthorising(name, defs))].sort()
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
