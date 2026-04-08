// lib/services/admission/form-analytics-service.ts
// Analytics queries for form builder dashboard
// Added: 2026-04-08

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  FormAnalyticsSummary,
  FieldDropOff,
  FormTrafficSource,
  FormDeviceBreakdown,
} from '@/types/admission';

export class FormAnalyticsService {
  static async getFormSummary(formId: string): Promise<FormAnalyticsSummary> {
    const supabase = createClientSupabaseClient();

    const { data: events } = await (supabase as any)
      .from('admission_form_events')
      .select('event_type')
      .eq('form_id', formId);

    const viewed = (events ?? []).filter((e: any) => e.event_type === 'form_viewed').length;
    const started = (events ?? []).filter((e: any) => e.event_type === 'form_started').length;
    const submitted = (events ?? []).filter((e: any) => e.event_type === 'form_submitted').length;

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: todayCount } = await (supabase as any)
      .from('admission_form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .gte('submitted_at', today);

    const { count: weekCount } = await (supabase as any)
      .from('admission_form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .gte('submitted_at', weekAgo);

    return {
      form_id: formId,
      total_views: viewed,
      total_starts: started,
      total_submissions: submitted,
      view_to_start_rate: viewed > 0 ? Math.round((started / viewed) * 1000) / 10 : 0,
      start_to_submit_rate: started > 0 ? Math.round((submitted / started) * 1000) / 10 : 0,
      overall_conversion_rate: viewed > 0 ? Math.round((submitted / viewed) * 1000) / 10 : 0,
      avg_completion_time_seconds: null,
      submissions_today: todayCount ?? 0,
      submissions_this_week: weekCount ?? 0,
    };
  }

  static async getFieldDropOff(formId: string): Promise<FieldDropOff[]> {
    const supabase = createClientSupabaseClient();

    const { data: events } = await (supabase as any)
      .from('admission_form_events')
      .select('event_type, field_key')
      .eq('form_id', formId)
      .in('event_type', ['field_focused', 'field_completed']);

    const { data: fields } = await (supabase as any)
      .from('admission_form_fields')
      .select('field_key, field_label, display_order')
      .eq('form_id', formId)
      .order('display_order');

    if (!fields || !events) return [];

    return fields.map((field: any) => {
      const focused = events.filter(
        (e: any) => e.field_key === field.field_key && e.event_type === 'field_focused'
      ).length;
      const completed = events.filter(
        (e: any) => e.field_key === field.field_key && e.event_type === 'field_completed'
      ).length;
      return {
        field_key: field.field_key,
        field_label: field.field_label,
        started: focused,
        completed: completed,
        drop_off_rate:
          focused > 0 ? Math.round(((focused - completed) / focused) * 1000) / 10 : 0,
      };
    });
  }

  static async getTrafficSources(formId: string): Promise<FormTrafficSource[]> {
    const supabase = createClientSupabaseClient();
    const { data: submissions } = await (supabase as any)
      .from('admission_form_submissions')
      .select('utm_source')
      .eq('form_id', formId);

    if (!submissions || submissions.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const s of submissions) {
      const source = s.utm_source || 'direct';
      counts[source] = (counts[source] || 0) + 1;
    }

    const total = submissions.length;
    return Object.entries(counts)
      .map(([source, count]) => ({
        source,
        count,
        percentage: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  static async getDeviceBreakdown(formId: string): Promise<FormDeviceBreakdown[]> {
    const supabase = createClientSupabaseClient();
    const { data: submissions } = await (supabase as any)
      .from('admission_form_submissions')
      .select('device_type')
      .eq('form_id', formId);

    if (!submissions || submissions.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const s of submissions) {
      const device = s.device_type || 'unknown';
      counts[device] = (counts[device] || 0) + 1;
    }

    const total = submissions.length;
    return Object.entries(counts)
      .map(([device_type, count]) => ({
        device_type,
        count,
        percentage: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  static async getSubmissionsOverTime(
    formId: string,
    days: number = 30
  ): Promise<{ date: string; count: number }[]> {
    const supabase = createClientSupabaseClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: submissions } = await (supabase as any)
      .from('admission_form_submissions')
      .select('submitted_at')
      .eq('form_id', formId)
      .gte('submitted_at', since)
      .order('submitted_at');

    if (!submissions) return [];

    const dayCounts: Record<string, number> = {};
    for (const s of submissions) {
      const date = s.submitted_at.split('T')[0];
      dayCounts[date] = (dayCounts[date] || 0) + 1;
    }

    return Object.entries(dayCounts).map(([date, count]) => ({ date, count }));
  }

  // ─── Event Tracking ─────────────────────────────────────────

  static async trackEvent(
    formId: string,
    eventType: string,
    fieldKey: string | null,
    sessionId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    await (supabase as any).from('admission_form_events').insert({
      form_id: formId,
      event_type: eventType,
      field_key: fieldKey,
      session_id: sessionId,
      metadata,
    });
  }

  // ─── Counts for forms list ──────────────────────────────────

  static async getSubmissionCounts(formIds: string[]): Promise<Record<string, number>> {
    if (formIds.length === 0) return {};
    const supabase = createClientSupabaseClient();
    const counts: Record<string, number> = {};

    for (const formId of formIds) {
      const { count } = await (supabase as any)
        .from('admission_form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', formId);
      counts[formId] = count ?? 0;
    }

    return counts;
  }

  static async getViewCounts(formIds: string[]): Promise<Record<string, number>> {
    if (formIds.length === 0) return {};
    const supabase = createClientSupabaseClient();
    const counts: Record<string, number> = {};

    for (const formId of formIds) {
      const { count } = await (supabase as any)
        .from('admission_form_events')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', formId)
        .eq('event_type', 'form_viewed');
      counts[formId] = count ?? 0;
    }

    return counts;
  }
}
