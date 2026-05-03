// lib/services/ims/activity-log-service.ts
// Phase F (2026-04-28): single helper for IMS audit-trail logging.
// Append-only — every state transition in indent / GRN / shipment / adjustment / sale
// flows calls log() to record (entity, action, actor, notes).
//
// The DB has RLS that requires user_has_permission('ims.view') + role_has_institution_access(institution_id),
// plus super_admin/admin bypass. Service-layer is_super_admin/is_admin runs as the authenticated user.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsActivityEntityType,
  ImsActivityAction,
  ImsActivityLogEntry,
} from '@/types/ims/activity-log';

interface LogParams {
  entityType: ImsActivityEntityType;
  entityId: string;
  institutionId: string;
  action: ImsActivityAction;
  actorId: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export class ImsActivityLogService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * Append a row to ims_activity_log. Non-blocking: logs to console on failure
   * but does NOT throw — callers should never lose their primary write because
   * audit logging failed.
   */
  static async log(params: LogParams): Promise<void> {
    try {
      const { error } = await this.supabase.from('ims_activity_log').insert({
        entity_type: params.entityType,
        entity_id: params.entityId,
        institution_id: params.institutionId,
        action: params.action,
        actor_id: params.actorId,
        notes: params.notes?.trim() || null,
        metadata: params.metadata ?? {},
      });

      if (error) {
        const e = error as { message?: string; code?: string; details?: string; hint?: string };
        console.warn(
          '[ImsActivityLogService] Failed to insert activity row (non-fatal):',
          e?.message ?? String(error),
          '| code:', e?.code,
          '| entity:', params.entityType, params.entityId,
          '| action:', params.action
        );
      }
    } catch (err) {
      console.warn('[ImsActivityLogService] log() threw (non-fatal):', err);
    }
  }

  /**
   * Fetch activity history for one entity, joined to actor profile.
   * Returns flat array (not paginated wrapper) — entity histories are small.
   */
  static async list(
    entityType: ImsActivityEntityType,
    entityId: string
  ): Promise<ImsActivityLogEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from('ims_activity_log')
        .select(
          '*, actor:profiles!actor_id(id, full_name, avatar_url, role)'
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true });

      if (error) {
        const e = error as { message?: string; code?: string; details?: string };
        console.warn(
          '[ImsActivityLogService] list() failed:',
          e?.message ?? String(error),
          '| code:', e?.code,
          '| entity:', entityType, entityId
        );
        return [];
      }

      return (data ?? []) as ImsActivityLogEntry[];
    } catch (err) {
      console.warn('[ImsActivityLogService] list() threw:', err);
      return [];
    }
  }
}
