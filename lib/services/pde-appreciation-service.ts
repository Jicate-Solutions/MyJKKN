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
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

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

    // created_by must be a valid, NOT-NULL profiles.id. The caller is the
    // learner (browser session); fall back to the first validator recipient.
    const { data: { user: authUser } } = await this.supabase.auth.getUser();
    const createdBy = authUser?.id ?? validatorIds[0];

    // One notifications row + one user_notifications link per validator
    // (canonical helper builds the correct columns + fan-out).
    await fanoutNotification(this.supabase as any, {
      title: 'A learner thanked you for your validation',
      body: params.skillName
        ? `Your feedback on the "${params.skillName}" demonstration was appreciated by the learner.`
        : 'Your feedback on a PDE demonstration was appreciated by the learner.',
      category: 'pde',
      userIds: validatorIds,
      createdBy,
      targeting: { type: 'user', user_ids: validatorIds },
      metadata: {
        source: 'pde_thanks',
        demonstration_id: params.demonstrationId,
      },
    });
  }
}
