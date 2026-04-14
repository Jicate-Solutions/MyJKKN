export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  await connection();
  try {
    // ── Auth check (same pattern as ai-debug/route.ts) ──
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow super_admin or administrator
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      (profile?.is_super_admin !== true &&
        profile?.role !== 'super_admin' &&
        profile?.role !== 'administrator')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Parse and validate question ──
    const body = await request.json();
    const question: string = body.question || body.query || '';

    if (!question || question.trim().length < 5) {
      return NextResponse.json(
        { error: 'question must be at least 5 characters' },
        { status: 400 }
      );
    }

    // ── Forward to ai-debug with who-can-do mode ──
    const aiRes = await fetch(
      `${request.nextUrl.origin}/api/users/permissions-audit/ai-debug`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: request.headers.get('cookie') || ''
        },
        body: JSON.stringify({
          query: question,
          mode: 'who-can-do',
          includeUsers: true
        })
      }
    );

    const data = await aiRes.json();
    return NextResponse.json(data, { status: aiRes.status });
  } catch (error) {
    console.error('Error in POST /api/users/permissions-audit/ask:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
