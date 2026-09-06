// lib/services/health/program-consent-service.ts
// Service for the LIGHT, per-program consent on Health → Wellness Programs.
// Decoupled from the heavy health-data consent (health_consents): a person can
// VIEW a program freely; we only ask this consent before RECORDING their
// participation (markWatched / submitQuiz / rateUsefulness).
// Director decision 2026-06-15: "light program consent, then track".
//
// NOTE: health_program_consents isn't in types/supabase.ts yet → (supabase as any)
// casts, matching the existing wellness-programs-service.ts pattern (avoids
// TS2589 on untyped tables).

import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();

export class ProgramConsentService {
  /**
   * Has this person given (and not withdrawn) consent for this program?
   * Returns false on any missing row.
   */
  static async hasProgramConsent(
    userId: string,
    programId: string
  ): Promise<boolean> {
    const { data } = await (supabase as any)
      .from('health_program_consents')
      .select('id, withdrawn_at')
      .eq('user_id', userId)
      .eq('program_id', programId)
      .maybeSingle();

    return !!data && data.withdrawn_at == null;
  }

  /**
   * Record the light program consent. Idempotent — upserts on (user_id, program_id)
   * and clears any prior withdrawal so re-consenting works.
   */
  static async giveProgramConsent(
    userId: string,
    programId: string,
    learnerId?: string | null
  ): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_program_consents')
      .upsert(
        {
          user_id: userId,
          program_id: programId,
          learner_id: learnerId ?? null,
          consented_at: new Date().toISOString(),
          withdrawn_at: null,
        },
        { onConflict: 'user_id,program_id' }
      );
    if (error) throw error;
  }
}
