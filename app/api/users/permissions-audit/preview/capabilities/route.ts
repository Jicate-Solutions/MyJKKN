export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';

import { DIRECTOR_EMAIL } from '@/lib/auth/preview-session';

// GET /api/users/permissions-audit/preview/capabilities
// Returns what the current caller is allowed to do with preview:
//   { isSuperAdmin: boolean, canUseWriteMode: boolean }
// Used by the See As User dialog to decide whether to enable Write mode.
export async function GET() {
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { isSuperAdmin: false, canUseWriteMode: false },
        { status: 401 },
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, email')
      .eq('id', user.id)
      .single();

    const isSuperAdmin =
      profile?.is_super_admin === true || profile?.role === 'super_admin';
    const canUseWriteMode =
      isSuperAdmin &&
      DIRECTOR_EMAIL.includes((profile?.email || '').toLowerCase());

    return NextResponse.json({
      isSuperAdmin,
      canUseWriteMode,
    });
  } catch (err) {
    console.error('[preview/capabilities] error:', err);
    return NextResponse.json({ isSuperAdmin: false, canUseWriteMode: false }, { status: 500 });
  }
}
