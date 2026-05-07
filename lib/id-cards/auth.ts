// lib/id-cards/auth.ts
// Phase 1C — auth helpers for the id-card subsystem.
//
// Two distinct auth paths:
//   1. requireUser(roles) — Supabase session + role check (super_admin / registrar / admission_admin).
//   2. requireAgentToken() — `Authorization: Bearer ${AGENT_PRINT_TOKEN}` header. Fail-closed if env unset.
//
// Both return a discriminated result so route handlers can early-return with the right status.

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type AuthFailure = { ok: false; status: 401 | 403 | 500; message: string };
export type UserAuthSuccess = {
  ok: true;
  kind: 'user';
  userId: string;
  role: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};
export type AgentAuthSuccess = { ok: true; kind: 'agent' };
export type EitherAuthSuccess = UserAuthSuccess | AgentAuthSuccess;

/**
 * Enforce a Supabase session AND that the user's `profiles.role` is in `allowedRoles`.
 *
 * Returns a discriminated union — call sites do `if (!auth.ok) return jsonError(...)`.
 */
export async function requireUser(
  allowedRoles: readonly string[]
): Promise<UserAuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: 'Unauthorized: sign-in required' };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (!role || !allowedRoles.includes(role)) {
    return {
      ok: false,
      status: 403,
      message: `Forbidden: requires one of [${allowedRoles.join(', ')}]`
    };
  }
  return { ok: true, kind: 'user', userId: user.id, role, supabase };
}

/**
 * Validate the agent print-station bearer token.
 *
 * Fail-closed: if `AGENT_PRINT_TOKEN` env var is unset, EVERY request is rejected
 * with 500. We do not silently grant access on a missing-secret config.
 */
export function requireAgentToken(request: NextRequest): AgentAuthSuccess | AuthFailure {
  const expected = process.env.AGENT_PRINT_TOKEN;
  if (!expected || expected.trim() === '') {
    return {
      ok: false,
      status: 500,
      message:
        'Server misconfiguration: AGENT_PRINT_TOKEN env var is not set. Refusing all agent requests.'
    };
  }
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return { ok: false, status: 401, message: 'Unauthorized: missing Bearer token' };
  }
  const provided = match[1].trim();
  if (provided !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized: invalid agent token' };
  }
  return { ok: true, kind: 'agent' };
}

/**
 * Try user-session auth first; if that fails, try the agent-token path.
 * Used by endpoints that ANY of [registrar UI, super_admin UI, agent print-station] may hit.
 */
export async function requireUserOrAgent(
  request: NextRequest,
  allowedRoles: readonly string[]
): Promise<EitherAuthSuccess | AuthFailure> {
  const userAuth = await requireUser(allowedRoles);
  if (userAuth.ok) return userAuth;

  // Only fall back to agent-token if the failure was an auth failure (401/403),
  // not a server misconfiguration (500). Surface 500 from agent path if present.
  const agentAuth = requireAgentToken(request);
  if (agentAuth.ok) return agentAuth;

  // Both paths failed. Return the more informative failure.
  // Prefer 500 (server misconfig) over 401/403 because it actually requires action.
  if (agentAuth.status === 500) return agentAuth;
  return userAuth;
}
