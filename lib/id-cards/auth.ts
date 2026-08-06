// lib/id-cards/auth.ts
// Phase 1C — auth helpers for the id-card subsystem.
//
// AGENT_PRINT_TOKEN was provisioned in Vercel production on 2026-07-23; this
// comment exists to carry that env change into a build (env-only changes are
// skipped by ignoreCommand).
// Two distinct auth paths:
//   1. requireUser(roles) — Supabase session + role check (super_admin / registrar / admission).
//   2. requireAgentToken() — `Authorization: Bearer ${AGENT_PRINT_TOKEN}` header. Fail-closed if env unset.
//
// Both return a discriminated union so route handlers can early-return with the right status.

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type AuthFailure = {
  ok: false;
  status: 401 | 403 | 500;
  message: string;
};

export type UserAuthSuccess = {
  ok: true;
  kind: 'user';
  userId: string;
  role: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export type AgentAuthSuccess = {
  ok: true;
  kind: 'agent';
};

/**
 * Type guard so callers can narrow with one helper instead of relying on
 * inline discriminant checks (which were occasionally not narrowing in
 * single-line returns under our tsconfig).
 */
export function isAuthFailure(
  result: { ok: boolean }
): result is AuthFailure {
  return result.ok === false;
}

export type UserAuthResult = UserAuthSuccess | AuthFailure;
export type AgentAuthResult = AgentAuthSuccess | AuthFailure;
export type EitherAuthResult = UserAuthSuccess | AgentAuthSuccess | AuthFailure;

/**
 * Enforce a Supabase session AND that the user's `profiles.role` is in `allowedRoles`.
 */
export async function requireUser(
  allowedRoles: readonly string[]
): Promise<UserAuthResult> {
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
 * Fail-closed: if `AGENT_PRINT_TOKEN` env var is unset, EVERY request is rejected with 500.
 */
export function requireAgentToken(request: NextRequest): AgentAuthResult {
  // Reject header-less callers with a plain 401 BEFORE the env check — a
  // probing client must not learn config state, and an unset env var must
  // not turn anonymous probes into 500s.
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return { ok: false, status: 401, message: 'Unauthorized: missing Bearer token' };
  }
  const expected = process.env.AGENT_PRINT_TOKEN;
  if (!expected || expected.trim() === '') {
    return {
      ok: false,
      status: 500,
      message:
        'Server misconfiguration: AGENT_PRINT_TOKEN env var is not set. Refusing all agent requests.'
    };
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
): Promise<EitherAuthResult> {
  const userAuth: UserAuthResult = await requireUser(allowedRoles);
  if (!isAuthFailure(userAuth)) return userAuth;

  const agentAuth: AgentAuthResult = requireAgentToken(request);
  if (!isAuthFailure(agentAuth)) return agentAuth;

  // Both paths failed. Surface the agent-side misconfig 500 ONLY when the
  // caller actually attempted agent auth (sent a Bearer header). A plain
  // browser session must get the user-path 401/403 — otherwise an unset
  // AGENT_PRINT_TOKEN turns every browser request into a 500 and the
  // print-queue UI silently falls back to stub data.
  const attemptedAgentAuth = /^Bearer\s+/i.test(
    request.headers.get('authorization') ?? ''
  );
  if (agentAuth.status === 500 && attemptedAgentAuth) return agentAuth;
  return userAuth;
}
