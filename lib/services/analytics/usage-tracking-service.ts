// ============================================
// USAGE TRACKING SERVICE
// ============================================
// Created: 2026-02-06
// Purpose: Fire-and-forget event tracking for lifecycle analytics
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { mapUrlToModule } from '@/lib/middleware/url-module-mapper';
import type {
  TrackFeatureParams,
  TrackEventFromMiddleware,
  UsageEventType,
} from '@/types/usage-analytics';
import { EVENT_WEIGHTS } from '@/types/usage-analytics';

export class UsageTrackingService {
  /**
   * Track a specific feature usage (explicit tracking).
   * Called directly from services for high-value actions.
   *
   * @example
   * UsageTrackingService.trackFeature({
   *   userId: user.id,
   *   module: 'billing/invoices',
   *   feature: 'generate_invoice',
   *   eventType: 'create',
   *   institutionId: invoice.institution_id,
   *   role: 'admin',
   * }).catch(() => {});
   */
  static async trackFeature(params: TrackFeatureParams): Promise<void> {
    try {
      const supabase = await createServiceRoleClient();

      await supabase.from('usage_events').insert({
        user_id: params.userId,
        session_id: params.sessionId || null,
        event_type: params.eventType,
        module: params.module,
        feature: params.feature,
        resource_type: params.resourceType || null,
        weight: EVENT_WEIGHTS[params.eventType] || 1,
        institution_id: params.institutionId || null,
        department_id: params.departmentId || null,
        role: params.role || null,
        source: 'explicit',
        metadata: params.metadata || {},
      });
    } catch {
      // Silently ignore - tracking must never fail the calling operation
    }
  }

  /**
   * Track a batch of events at once.
   * Useful for backfill or bulk operations.
   */
  static async trackBatch(
    events: Array<{
      userId: string;
      eventType: UsageEventType;
      module: string;
      feature?: string;
      institutionId?: string;
      role?: string;
      source?: 'middleware' | 'explicit' | 'backfill';
      createdAt?: string;
    }>
  ): Promise<void> {
    try {
      const supabase = await createServiceRoleClient();

      const rows = events.map((e) => ({
        user_id: e.userId,
        event_type: e.eventType,
        module: e.module,
        feature: e.feature || null,
        weight: EVENT_WEIGHTS[e.eventType] || 1,
        institution_id: e.institutionId || null,
        role: e.role || null,
        source: e.source || 'explicit',
        created_at: e.createdAt || new Date().toISOString(),
      }));

      // Insert in batches of 500 to avoid payload limits
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await supabase.from('usage_events').insert(batch);
      }
    } catch {
      // Silently ignore
    }
  }

  /**
   * Track from middleware (automatic tracking).
   * Maps the URL to a module and determines event type from HTTP method.
   */
  static async trackFromMiddleware(
    params: TrackEventFromMiddleware
  ): Promise<void> {
    try {
      const mapping = mapUrlToModule(params.url, params.method);
      if (!mapping) return;

      const supabase = await createServiceRoleClient();

      await supabase.from('usage_events').insert({
        user_id: params.userId,
        session_id: params.sessionId || null,
        event_type: mapping.eventType,
        module: mapping.module,
        feature: mapping.feature,
        weight: mapping.weight,
        institution_id: params.institutionId || null,
        department_id: params.departmentId || null,
        role: params.role || null,
        request_method: params.method,
        source: 'middleware',
      });
    } catch {
      // Silently ignore
    }
  }

  /**
   * Track a client-side page visit.
   * Called from the browser via POST /api/analytics/usage/events.
   */
  static async trackPageVisit(params: {
    userId: string;
    url: string;
    institutionId?: string;
    departmentId?: string;
    role?: string;
    sessionId?: string;
  }): Promise<void> {
    try {
      const mapping = mapUrlToModule(params.url, 'GET');
      if (!mapping) return;

      const supabase = await createServiceRoleClient();

      await supabase.from('usage_events').insert({
        user_id: params.userId,
        session_id: params.sessionId || null,
        event_type: 'page_visit',
        module: mapping.module,
        feature: mapping.feature,
        weight: EVENT_WEIGHTS.page_visit,
        institution_id: params.institutionId || null,
        department_id: params.departmentId || null,
        role: params.role || null,
        source: 'explicit',
        metadata: { page_url: params.url },
      });
    } catch {
      // Silently ignore
    }
  }
}
