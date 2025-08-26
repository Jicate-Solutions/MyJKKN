import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(request: Request) {
  try {
    // Check if user is super_admin
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can reset driver passwords' },
        { status: 403 }
      );
    }

    // Get all driver users
    const { data: drivers } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('role', 'driver');

    if (!drivers || drivers.length === 0) {
      return NextResponse.json(
        { message: 'No driver users found' },
        { status: 200 }
      );
    }

    const results = {
      success: [],
      failed: []
    } as { success: string[]; failed: Array<{ email: string; error: string }> };

    // Reset password for each driver
    for (const driver of drivers) {
      try {
        // Update the user's password using admin API
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          driver.id,
          {
            password: 'Driver@123',
            email_confirm: true
          }
        );
        
        if (updateError) {
          throw updateError;
        }
        
        results.success.push(driver.email);
      } catch (error) {
        results.failed.push({
          email: driver.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      message: 'Password reset completed',
      total: drivers.length,
      success: results.success.length,
      failed: results.failed.length,
      details: results
    });

  } catch (error) {
    console.error('Error resetting driver passwords:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}