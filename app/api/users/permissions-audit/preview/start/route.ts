export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

import {
  mintPreviewToken,
  writePreviewAudit,
  PREVIEW_COOKIE_NAME,
  DIRECTOR_EMAIL,
  canUseWriteMode,
  type PreviewMode,
} from '@/lib/auth/preview-session';

// POST /api/users/permissions-audit/preview/start
// Body: { targetUserId: string, mode?: 'read' | 'write' }
//
// Starts a preview session. Only super admins can call this.
// Write mode is restricted to director@jkkn.ac.in.
//
// On success: sets sb-preview-session httpOnly cookie, returns token metadata.
// Also writes a 'preview_session_started' audit entry.
export async function POST(request: NextRequest) {
  await connection();

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); },
        },
      },
    );

    // ── Auth: must be signed in ────────────────────────────────────────────
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Authorization: caller must be super admin ──────────────────────────
    const { data: callerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !callerProfile ||
      (callerProfile.is_super_admin !== true && callerProfile.role !== 'super_admin')
    ) {
      return NextResponse.json(
        { error: 'Forbidden — only super admins can preview other users' },
        { status: 403 },
      );
    }

    // ── Reject if already previewing (prevent nested sessions) ─────────────
    if (cookieStore.get(PREVIEW_COOKIE_NAME)?.value) {
      return NextResponse.json(
        { error: 'A preview session is already active. Exit it before starting another.' },
        { status: 409 },
      );
    }

    // ── Parse + validate body ──────────────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const { targetUserId, mode: requestedMode } = body as {
      targetUserId?: string;
      mode?: PreviewMode;
    };

    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }

    if (targetUserId === callerProfile.id) {
      return NextResponse.json({ error: 'Cannot preview yourself' }, { status: 400 });
    }

    // ── Mode gate: write is director-only ──────────────────────────────────
    const isWriteRequested = requestedMode === 'write';
    if (isWriteRequested && !canUseWriteMode(callerProfile.email)) {
      return NextResponse.json(
        {
          error: `Write-mode preview is restricted to ${DIRECTOR_EMAIL}. You may preview in read-only mode.`,
        },
        { status: 403 },
      );
    }
    const effectiveMode: PreviewMode = isWriteRequested ? 'write' : 'read';

    // ── Verify target exists (so we fail clearly, not silently) ────────────
    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', targetUserId)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // ── Mint token ─────────────────────────────────────────────────────────
    const sessionId = randomUUID();
    const token = await mintPreviewToken({
      targetUserId: target.id,
      originatorId: callerProfile.id,
      originatorEmail: callerProfile.email ?? '',
      mode: effectiveMode,
      sessionId,
    });

    // ── Audit ──────────────────────────────────────────────────────────────
    const targetLabel = target.full_name || target.email || target.id;
    await writePreviewAudit({
      actionType: 'preview_session_started',
      actorUserId: callerProfile.id,
      actorName: callerProfile.full_name || callerProfile.email || 'Unknown',
      targetUserId: target.id,
      mode: effectiveMode,
      sessionId,
      description: `${callerProfile.full_name || callerProfile.email} started a ${effectiveMode} preview session as ${targetLabel}`,
      extra: { target_email: target.email, target_role: target.role },
    });

    // ── Set cookie + return ────────────────────────────────────────────────
    // 15-min maxAge mirrors the JWT exp. httpOnly prevents JS access.
    // sameSite=lax so it's sent on top-level navigations (the whole point).
    const res = NextResponse.json({
      ok: true,
      sessionId,
      mode: effectiveMode,
      expiresInSeconds: 15 * 60,
      target: {
        id: target.id,
        email: target.email,
        fullName: target.full_name,
        role: target.role,
      },
    });
    res.cookies.set(PREVIEW_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    });
    return res;
  } catch (err) {
    console.error('[preview/start] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
