export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  await connection();
  try {
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

    // Auth check
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Super admin check
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      (profile?.is_super_admin !== true && profile?.role !== 'super_admin')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { sql } = body;

    if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'SQL query is required and must not be empty.' },
        { status: 400 }
      );
    }

    // Safety check — reject dangerous SQL patterns
    const dangerous = [
      /DROP\s+DATABASE/i,
      /DROP\s+SCHEMA/i,
      /DROP\s+OWNED/i,
    ];

    if (dangerous.some(p => p.test(sql))) {
      return NextResponse.json(
        { success: false, error: 'This SQL contains potentially destructive operations that are not allowed.' },
        { status: 400 }
      );
    }

    // Service role client for executing SQL
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Run SQL via RPC
    const { data, error } = await serviceClient.rpc('exec_sql_safe', { query: sql });

    // Audit log
    console.log(JSON.stringify({
      event: 'ai_debug_sql_execution',
      userId: user.id,
      sql: sql.substring(0, 500),
      success: !error && data?.success !== false,
      timestamp: new Date().toISOString(),
    }));

    if (error) {
      // Check if the function doesn't exist
      if (error.message?.includes('function') && error.message?.includes('does not exist')) {
        console.error('[ai-debug/run-sql] exec_sql_safe function not found:', error);
        return NextResponse.json(
          {
            success: false,
            error: 'The exec_sql_safe() database function does not exist. ' +
              'Please create it in supabase/setup/02_functions.sql before using this endpoint.'
          },
          { status: 500 }
        );
      }

      console.error('[ai-debug/run-sql] RPC error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Handle data-level errors
    if (data?.success === false) {
      return NextResponse.json(
        { success: false, error: data.error, code: data.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data?.message || 'SQL executed successfully'
    });
  } catch (error) {
    console.error('Error in POST /api/users/permissions-audit/ai-debug/run-sql:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
