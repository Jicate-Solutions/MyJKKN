// ============================================
// API: Student Widget Data
// Created: 2025-12-27
// Purpose: Fetch student-specific widget data
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentWidgetService } from '@/lib/services/dashboard/student-widget-service';

/**
 * GET /api/dashboard/student-widgets
 * Query params: widget_key (required)
 * Returns widget data based on widget_key
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get widget_key from query params
    const url = new URL(request.url);
    const widgetKey = url.searchParams.get('widget_key');
    const configParam = url.searchParams.get('config');

    if (!widgetKey) {
      return NextResponse.json(
        { error: 'widget_key query parameter is required' },
        { status: 400 }
      );
    }

    // Parse config if provided
    const config: Record<string, any> = configParam ? JSON.parse(configParam) : {};

    // Route to appropriate widget method based on widget_key
    let widgetData;

    switch (widgetKey) {
      case 'student_my_profile':
        widgetData = await StudentWidgetService.getMyProfile(user.id, config);
        break;

      case 'student_my_attendance':
        widgetData = await StudentWidgetService.getMyAttendance(user.id, config);
        break;

      case 'student_my_fees':
        widgetData = await StudentWidgetService.getMyFees(user.id, config);
        break;

      case 'student_my_timetable':
        widgetData = await StudentWidgetService.getMyTimetable(user.id, config);
        break;

      case 'student_my_results':
        widgetData = await StudentWidgetService.getMyResults(user.id, config);
        break;

      case 'student_announcements':
        widgetData = await StudentWidgetService.getAnnouncements(user.id, config);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown student widget: ${widgetKey}` },
          { status: 400 }
        );
    }

    return NextResponse.json(widgetData);
  } catch (error) {
    console.error('[API] Error fetching student widget data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
