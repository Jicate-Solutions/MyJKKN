// =====================================================================
// PDE Appreciation Service — learner → validator "thanks" action
// =====================================================================
// CARE audit 2026-06-12 corrective move A (A5 scored 0: no sanctioned
// learner→validator appreciation channel anywhere in PDE).
//
// A "thanks" is an in-app notification to each validator on the
// demonstration — two-table shape copied from
// lib/services/startup-studio/notification-service.ts:
// one `notifications` row + one `user_notifications` link per validator
// (the shape the bell reads).
//
// v1 dedupe is UI-level (button disables after send). A duplicate thanks
// across sessions produces a second harmless notification.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export class PDEAppreciationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Send a thanks notification to every validator on a demonstration.
   * Caller is the learner who owns the row (client session).
   */
  static async sendThanks(params: {
    demonstrationId: string;
    validatorIds: string[];
    skillName?: string | null;
  }): Promise<void> {
    const validatorIds = [...new Set(params.validatorIds)].filter(Boolean);
    if (validatorIds.length === 0) {
      throw new Error('No validators recorded on this demonstration yet.');
    }

    const { data: notification, error: insertError } = await (this.supabase as any)
      .from('notifications')
      .insert({
        type: 'pde_appreciation',
        title: 'A learner thanked you for your validation',
        message: params.skillName
          ? `Your feedback on the "${params.skillName}" demonstration was appreciated by the learner.`
          : 'Your feedback on a PDE demonstration was appreciated by the learner.',
        metadata: {
          source: 'pde_thanks',
          demonstration_id: params.demonstrationId,
        },
      })
      .select('id')
      .single();

    if (insertError || !notification) {
      throw insertError ?? new Error('Notification insert returned no data');
    }

    const links = validatorIds.map((userId) => ({
      notification_id: notification.id,
      user_id: userId,
    }));

    const { error: linkError } = await (this.supabase as any)
      .from('user_notifications')
      .insert(links);

    if (linkError) throw linkError;
  }
}
