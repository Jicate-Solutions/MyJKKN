// lib/services/admin/whatsapp-send-limits-service.ts
// Created: 2026-04-29
//
// Director's STANDING RULE — every policy decision = config-table row +
// super_admin UI to write. Zero deploys for tweaks.
// Memory: feedback_policy_decisions_must_be_config_rows.md
//
// Backs:
//   - app/(routes)/admin/whatsapp-limits/page.tsx (super-admin editor)
//   - lib/services/admission/expo-whatsapp-service.ts (consumer — reads via
//     fn_get_whatsapp_daily_limit() RPC for service-role contexts)
//
// Pairs with `whatsapp_send_limits` table (migration
// 20260429_whatsapp_send_limits.sql). Singleton row.
// Read access: any authenticated user (RLS).
// Write access: super_admin only (RLS).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// --- Types ---------------------------------------------------------------

export interface WhatsAppSendLimitRow {
  id: string;
  daily_limit: number;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

/**
 * Fallback used when the singleton row hasn't been seeded yet, RLS blocks
 * the read, or the network fails. Matches the original hardcoded value
 * in expo-whatsapp-service.ts exactly so behaviour is unchanged on day one.
 */
export const WHATSAPP_DAILY_LIMIT_DEFAULT = 950;

const QUERY_KEY = ['admin', 'whatsapp-send-limits'] as const;

// --- Service -------------------------------------------------------------

export class WhatsAppSendLimitsService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Fetch the singleton row. Returns null if the row hasn't been seeded
   * (callers must fall back to WHATSAPP_DAILY_LIMIT_DEFAULT).
   */
  static async get(): Promise<WhatsAppSendLimitRow | null> {
    const { data, error } = await (this.supabase as any)
      .from('whatsapp_send_limits')
      .select('id, daily_limit, notes, updated_by, updated_at, created_at')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[admin/whatsapp-send-limits] get failed:', error);
      return null;
    }
    return (data as WhatsAppSendLimitRow) || null;
  }

  /**
   * Read just the integer cap. Falls back to WHATSAPP_DAILY_LIMIT_DEFAULT
   * if the row is missing or RLS blocks the read.
   */
  static async getDailyLimit(): Promise<number> {
    const row = await this.get();
    return row?.daily_limit ?? WHATSAPP_DAILY_LIMIT_DEFAULT;
  }

  /**
   * Update the singleton row's daily_limit. Super-admin only via RLS.
   * Stamps updated_by from the current auth session for audit.
   */
  static async updateDailyLimit(
    dailyLimit: number,
    notes?: string | null
  ): Promise<{ ok: boolean; error?: string; row?: WhatsAppSendLimitRow }> {
    if (!Number.isInteger(dailyLimit) || dailyLimit <= 0 || dailyLimit > 10000) {
      return {
        ok: false,
        error: 'daily_limit must be an integer between 1 and 10000',
      };
    }

    // Pull current user for the updated_by audit stamp. RLS already enforces
    // super_admin-only writes — this stamp is for the UI's "Last updated by"
    // display.
    const { data: userData, error: userErr } = await this.supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return { ok: false, error: 'Not authenticated' };
    }

    // Locate the singleton row (UNIQUE INDEX on (1) means at most one row).
    const existing = await this.get();
    if (!existing) {
      return {
        ok: false,
        error:
          'whatsapp_send_limits singleton row missing — re-run migration 20260429_whatsapp_send_limits.sql',
      };
    }

    const patch: Record<string, unknown> = {
      daily_limit: dailyLimit,
      updated_by: userData.user.id,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) {
      patch.notes = notes;
    }

    const { data, error } = await (this.supabase as any)
      .from('whatsapp_send_limits')
      .update(patch)
      .eq('id', existing.id)
      .select('id, daily_limit, notes, updated_by, updated_at, created_at')
      .single();

    if (error) {
      console.error('[admin/whatsapp-send-limits] update failed:', error);
      return { ok: false, error: error.message || 'Update failed' };
    }
    return { ok: true, row: data as WhatsAppSendLimitRow };
  }
}

// --- Hooks ---------------------------------------------------------------

/**
 * useWhatsAppSendLimit — TanStack Query hook used by the admin editor.
 * Falls back to WHATSAPP_DAILY_LIMIT_DEFAULT while loading.
 */
export function useWhatsAppSendLimit() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => WhatsAppSendLimitsService.get(),
    // 30s stale: config rarely changes
    staleTime: 30_000,
  });
}

/**
 * Admin-side mutation: update daily_limit, then invalidate.
 * Caller pattern:
 *   const update = useUpdateWhatsAppSendLimit();
 *   update.mutate({ dailyLimit: 980, notes: 'Raised after tier upgrade' });
 */
export function useUpdateWhatsAppSendLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dailyLimit,
      notes,
    }: {
      dailyLimit: number;
      notes?: string | null;
    }) => WhatsAppSendLimitsService.updateDailyLimit(dailyLimit, notes),
    onSuccess: (result) => {
      if (result.ok) {
        qc.invalidateQueries({ queryKey: QUERY_KEY });
      }
    },
  });
}
