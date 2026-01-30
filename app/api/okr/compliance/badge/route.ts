// app/api/okr/compliance/badge/route.ts
// API endpoint for smart badge calculation

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  BadgeCalculator,
  getCurrentWeek,
  isCheckInOverdue,
  getDaysUntilDeadline
} from '@/lib/services/okr';

/**
 * GET /api/okr/compliance/badge
 * Get current user's badge calculation with detailed breakdown
 *
 * Query params:
 * - user_id: Optional, for managers to view another user's badge
 */
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
    const targetUserId = url.searchParams.get('user_id') || user.id;

    // If requesting another user's badge, check permissions
    if (targetUserId !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!['super_admin', 'administrator', 'hod'].includes(profile?.role || '')) {
        return NextResponse.json(
          { error: 'Permission denied to view other users\' badges' },
          { status: 403 }
        );
      }
    }

    // Get user status
    const { data: userStatus, error: statusError } = await (supabase as any)
      .from('okr_user_status')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (statusError && statusError.code !== 'PGRST116') {
      throw statusError;
    }

    // Get user's active objectives with key results
    const { data: objectives, error: objError } = await (supabase as any)
      .from('okr_objectives')
      .select(`
        id,
        title,
        tier,
        level,
        status,
        start_date,
        end_date,
        overall_progress,
        key_results:okr_key_results(
          id,
          title,
          start_value,
          target_value,
          current_value,
          progress_percentage,
          status,
          deadline
        )
      `)
      .eq('owner_id', targetUserId)
      .eq('status', 'active');

    if (objError) throw objError;

    // Get compliance history
    const now = new Date();
    const year = now.getFullYear();
    const { data: complianceHistory } = await (supabase as any)
      .from('okr_check_ins')
      .select('id, week_number, year, is_completed, check_in_date')
      .eq('user_id', targetUserId)
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(4);

    // Count consecutive missed weeks
    let consecutiveMissed = 0;
    if (complianceHistory) {
      for (const record of complianceHistory) {
        if (!record.is_completed) {
          consecutiveMissed++;
        } else {
          break;
        }
      }
    }

    // Calculate badge
    const result = BadgeCalculator.calculate({
      lastCheckInDate: userStatus?.last_check_in_date
        ? new Date(userStatus.last_check_in_date)
        : null,
      objectives: objectives || [],
      consecutiveMissedWeeks: consecutiveMissed
    });

    // Get display info
    const displayInfo = BadgeCalculator.getDisplayInfo(result.badge);
    const weekInfo = getCurrentWeek();

    return NextResponse.json({
      badge: result.badge,
      reason: result.reason,
      details: {
        ...result.details,
        consecutiveMissedWeeks: consecutiveMissed,
        totalActiveObjectives: objectives?.length || 0
      },
      display: displayInfo,
      week: {
        weekNumber: weekInfo.weekNumber,
        year: weekInfo.year,
        deadline: weekInfo.checkInDeadline.toISOString(),
        isDeadlinePassed: weekInfo.isDeadlinePassed,
        daysUntilDeadline: result.details.daysUntilDeadline
      },
      userStatus: userStatus || null
    });

  } catch (error) {
    console.error('[OKR Badge API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/okr/compliance/badge/recalculate
 * Force recalculate and update user's badge
 */
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

    const body = await request.json().catch(() => ({}));
    const targetUserId = body.user_id || user.id;

    // If recalculating another user's badge, check permissions
    if (targetUserId !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!['super_admin', 'administrator', 'hod'].includes(profile?.role || '')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }
    }

    // Get user status
    const { data: currentStatus } = await (supabase as any)
      .from('okr_user_status')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    // Get objectives
    const { data: objectives } = await (supabase as any)
      .from('okr_objectives')
      .select(`
        *,
        key_results:okr_key_results(*)
      `)
      .eq('owner_id', targetUserId)
      .eq('status', 'active');

    // Get compliance history
    const { data: complianceHistory } = await (supabase as any)
      .from('okr_check_ins')
      .select('id, week_number, year, is_completed, check_in_date')
      .eq('user_id', targetUserId)
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(4);

    let consecutiveMissed = 0;
    if (complianceHistory) {
      for (const record of complianceHistory) {
        if (!record.is_completed) {
          consecutiveMissed++;
        } else {
          break;
        }
      }
    }

    // Calculate new badge
    const result = BadgeCalculator.calculate({
      lastCheckInDate: currentStatus?.last_check_in_date
        ? new Date(currentStatus.last_check_in_date)
        : null,
      objectives: objectives || [],
      consecutiveMissedWeeks: consecutiveMissed
    });

    const previousBadge = currentStatus?.current_badge || 'green';

    // Update or create user status
    if (currentStatus) {
      await (supabase as any)
        .from('okr_user_status')
        .update({
          current_badge: result.badge,
          consecutive_missed: consecutiveMissed,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId);
    } else {
      await (supabase as any)
        .from('okr_user_status')
        .insert({
          user_id: targetUserId,
          current_badge: result.badge,
          consecutive_missed: consecutiveMissed,
          consecutive_completed: 0,
          total_check_ins: 0
        });
    }

    // Log badge change if changed
    if (previousBadge !== result.badge) {
      await (supabase as any)
        .from('okr_compliance_logs')
        .insert({
          user_id: targetUserId,
          action: 'badge_change',
          performed_by: user.id,
          reason: result.reason,
          previous_badge: previousBadge,
          new_badge: result.badge,
          metadata: {
            recalculated: true,
            details: result.details
          }
        });
    }

    return NextResponse.json({
      success: true,
      previousBadge,
      newBadge: result.badge,
      changed: previousBadge !== result.badge,
      reason: result.reason,
      details: result.details
    });

  } catch (error) {
    console.error('[OKR Badge API] Recalculate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
