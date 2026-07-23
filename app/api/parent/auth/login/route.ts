import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/parent-password';
import {
  signParentSession,
  PARENT_SESSION_COOKIE,
  parentSessionCookieOptions,
} from '@/lib/auth/parent-jwt';
import { findLearnerIdsByIdentifier } from '@/lib/utils/parent-identifier';
import type { LoginPayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

// Single generic failure — never reveal which factor was wrong (no enumeration).
const INVALID = NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

/**
 * Per-student login: identifier (admission OR a parent mobile) resolves to the
 * student(s); pp_parent_accounts has ONE row per student with the shared
 * password (father & mother use it). First account whose password matches wins.
 */
export async function POST(req: NextRequest) {
  let body: LoginPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const identifier = (body.identifier ?? '').trim();
  const password = body.password ?? '';
  if (!identifier || !password) return INVALID;

  const db = createServiceRoleClient();

  const learnerIds = await findLearnerIdsByIdentifier(db, identifier);
  if (!learnerIds.length) return INVALID;

  const { data: accounts } = await db
    .from('pp_parent_accounts')
    .select('id, learner_profile_id, password_hash, is_active')
    .in('learner_profile_id', learnerIds)
    .eq('is_active', true);

  const rows = (accounts ?? []) as unknown as Array<{
    id: string;
    learner_profile_id: string;
    password_hash: string;
  }>;

  for (const acct of rows) {
    if (await verifyPassword(password, acct.password_hash)) {
      const token = await signParentSession({
        sub: acct.id,
        learnerProfileId: acct.learner_profile_id,
      });
      const res = NextResponse.json({ ok: true });
      res.cookies.set(PARENT_SESSION_COOKIE, token, parentSessionCookieOptions());
      void db
        .from('pp_parent_accounts')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', acct.id);
      return res;
    }
  }

  return INVALID;
}
