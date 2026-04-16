// app/api/okr/compliance/route.ts
// Internal API for OKR Compliance & Blocking (session-based auth)

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
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

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const badge = url.searchParams.get('badge');
    const isBlocked = url.searchParams.get('is_blocked');
    const teamView = url.searchParams.get('team') === 'true';

    // Get user profile to check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    // If requesting own status only
    if (!teamView && !userId) {
      const { data: status, error } = await (supabase as any)
        .from('okr_user_status')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      // If no status exists, create default
      if (!status) {
        const defaultStatus = {
          user_id: user.id,
          current_badge: 'green',
          consecutive_missed: 0,
          consecutive_completed: 0,
          total_check_ins: 0
        };

        const { data: newStatus } = await (supabase as any)
          .from('okr_user_status')
          .insert([defaultStatus])
          .select()
          .single();

        return NextResponse.json({
          data: newStatus || defaultStatus,
          is_blocked: false
        });
      }

      return NextResponse.json({
        data: status,
        is_blocked: status.current_badge === 'blocked'
      });
    }

    // Team view - requires manager or admin role
    const isManager = ['super_admin', 'administrator', 'hod'].includes(profile?.role || '');
    if (!isManager) {
      return NextResponse.json(
        { error: 'Only managers can view team compliance' },
        { status: 403 }
      );
    }

    // Build query for team compliance
    let query = (supabase as any)
      .from('okr_user_status')
      .select(`
        *,
        user:profiles!user_id(id, full_name, email, avatar_url, role, department_id)
      `);

    // Filter by user if specified
    if (userId) {
      query = query.eq('user_id', userId);
    }

    // Filter by badge
    if (badge) {
      query = query.eq('current_badge', badge);
    }

    // Filter by blocked status
    if (isBlocked !== null) {
      if (isBlocked === 'true') {
        query = query.eq('current_badge', 'blocked');
      } else {
        query = query.neq('current_badge', 'blocked');
      }
    }

    // Filter by institution/department for non-super_admin
    if (profile?.role !== 'super_admin' && profile?.institution_id) {
      query = query.eq('user.institution_id', profile.institution_id);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    // Calculate summary
    const summary = {
      total: data?.length || 0,
      green: 0,
      yellow: 0,
      red: 0,
      blocked: 0
    };

    if (data) {
      data.forEach((status: any) => {
        switch (status.current_badge) {
          case 'green': summary.green++; break;
          case 'yellow': summary.yellow++; break;
          case 'red': summary.red++; break;
          case 'blocked': summary.blocked++; break;
        }
      });
    }

    return NextResponse.json({
      data: data || [],
      summary
    });

  } catch (error) {
    console.error('[OKR Compliance API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Unblock a user (manager action)
export async function POST(request: NextRequest) {
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

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check manager permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!['super_admin', 'administrator', 'hod'].includes(profile?.role || '')) {
      return NextResponse.json(
        { error: 'Only managers can unblock users' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, action, reason } = body;

    if (!user_id || !action) {
      return NextResponse.json(
        { error: 'user_id and action are required' },
        { status: 400 }
      );
    }

    if (action === 'unblock') {
      // Unblock user
      const { data, error } = await (supabase as any)
        .from('okr_user_status')
        .update({
          current_badge: 'yellow', // Set to yellow after unblock (needs attention)
          consecutive_missed: 0,
          unblocked_by: user.id,
          unblocked_at: new Date().toISOString(),
          unblock_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id)
        .select()
        .single();

      if (error) throw error;

      // Log the unblock action
      await (supabase as any)
        .from('okr_compliance_logs')
        .insert({
          user_id: user_id,
          action: 'unblock',
          performed_by: user.id,
          reason: reason,
          previous_badge: 'blocked',
          new_badge: 'yellow'
        });

      return NextResponse.json({
        data,
        message: 'User unblocked successfully'
      });
    }

    if (action === 'escalate') {
      // Send escalation
      const { data: targetUser } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user_id)
        .single();

      // Log escalation
      await (supabase as any)
        .from('okr_compliance_logs')
        .insert({
          user_id: user_id,
          action: 'escalation',
          performed_by: user.id,
          reason: reason,
          metadata: {
            escalation_type: body.escalation_type || 'manager',
            target_email: targetUser?.email
          }
        });

      return NextResponse.json({
        message: 'Escalation logged successfully',
        data: { user_id, escalated_at: new Date().toISOString() }
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "unblock" or "escalate"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[OKR Compliance API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
