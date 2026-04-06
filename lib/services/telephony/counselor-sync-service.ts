// lib/services/telephony/counselor-sync-service.ts
// Syncs admission counselors from the Exotel agent map into the admission_counselors table.
// Runs on cron (piggybacked on the 5-minute call sync) + manual trigger from dashboard.

import { type SupabaseClient } from '@supabase/supabase-js';
import { getAdmissionCounselors } from './exotel-agent-map';
import { logger } from '@/lib/utils/enhanced-logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CounselorSyncResult {
  synced: number;     // Total counselors processed
  created: number;    // New counselors inserted
  updated: number;    // Existing counselors updated
  deactivated: number; // Counselors marked inactive (in DB but not in agent map)
  errors: string[];   // Any errors encountered
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class CounselorSyncService {
  /**
   * Default institution ID — JKKN College of Pharmacy (production default).
   * Admission counselors handle all colleges via a shared ExoPhone,
   * but Pharmacy is the default institution for Exotel routing.
   */
  private static getDefaultInstitutionId(): string {
    return (
      process.env.EXOTEL_DEFAULT_INSTITUTION_ID ||
      '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'
    );
  }

  /**
   * Sync counselors from the static Exotel agent map to admission_counselors table.
   *
   * Logic:
   * 1. Read all admission counselors from exotel-agent-map.ts
   * 2. Fetch current admission_counselors from DB
   * 3. For each agent-map counselor:
   *    - If exists in DB (by email): UPDATE name, phone, is_active=true
   *    - If not exists: INSERT with auto-generated UUID
   * 4. For counselors in DB but NOT in agent map: mark is_active=false (soft delete)
   * 5. Return counts of created, updated, deactivated
   */
  static async syncFromExotel(supabase: SupabaseClient): Promise<CounselorSyncResult> {
    const result: CounselorSyncResult = {
      synced: 0,
      created: 0,
      updated: 0,
      deactivated: 0,
      errors: [],
    };

    try {
      // 1. Get counselors from the static agent map
      const agentMapCounselors = getAdmissionCounselors();
      const institutionId = this.getDefaultInstitutionId();

      logger.info('counselor-sync', 'Starting sync', {
        agentMapCount: agentMapCounselors.length,
        institutionId,
      });

      // 2. Fetch all current counselors from DB
      const { data: dbCounselors, error: fetchError } = await supabase
        .from('admission_counselors')
        .select('id, email, name, phone, is_active');

      if (fetchError) {
        const msg = `Failed to fetch existing counselors: ${fetchError.message}`;
        logger.error('counselor-sync', msg);
        result.errors.push(msg);
        return result;
      }

      // Build a map of existing counselors by email (lowercased)
      const dbByEmail = new Map<string, { id: string; name: string; phone: string | null; is_active: boolean }>();
      for (const c of dbCounselors || []) {
        dbByEmail.set(c.email.toLowerCase(), c);
      }

      // 3. Upsert each agent-map counselor
      const agentEmails = new Set<string>();

      for (const agent of agentMapCounselors) {
        const email = agent.email.toLowerCase();
        agentEmails.add(email);

        const existing = dbByEmail.get(email);

        if (existing) {
          // UPDATE if name, phone, or is_active changed
          const needsUpdate =
            existing.name !== agent.name ||
            existing.phone !== agent.phone ||
            !existing.is_active;

          if (needsUpdate) {
            const { error: updateError } = await supabase
              .from('admission_counselors')
              .update({
                name: agent.name,
                phone: agent.phone,
                is_active: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (updateError) {
              const msg = `Failed to update counselor ${email}: ${updateError.message}`;
              logger.warn('counselor-sync', msg);
              result.errors.push(msg);
            } else {
              result.updated++;
            }
          }
        } else {
          // INSERT new counselor
          const { error: insertError } = await supabase
            .from('admission_counselors')
            .insert({
              institution_id: institutionId,
              name: agent.name,
              email: agent.email, // Preserve original casing from agent map
              phone: agent.phone,
              is_active: true,
              max_leads: 100,
              current_leads: 0,
              specializations: [],
            });

          if (insertError) {
            const msg = `Failed to insert counselor ${email}: ${insertError.message}`;
            logger.warn('counselor-sync', msg);
            result.errors.push(msg);
          } else {
            result.created++;
          }
        }

        result.synced++;
      }

      // 4. Deactivate counselors in DB that are NOT in the agent map
      //    Skip test/dummy records (check for real JKKN emails)
      for (const [email, dbCounselor] of dbByEmail) {
        if (!agentEmails.has(email) && dbCounselor.is_active) {
          const { error: deactivateError } = await supabase
            .from('admission_counselors')
            .update({
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dbCounselor.id);

          if (deactivateError) {
            const msg = `Failed to deactivate counselor ${email}: ${deactivateError.message}`;
            logger.warn('counselor-sync', msg);
            result.errors.push(msg);
          } else {
            result.deactivated++;
          }
        }
      }

      logger.info('counselor-sync', 'Sync complete', {
        synced: result.synced,
        created: result.created,
        updated: result.updated,
        deactivated: result.deactivated,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown sync error';
      logger.error('counselor-sync', 'Sync failed', error);
      result.errors.push(msg);
      return result;
    }
  }

  /**
   * Get the last sync metadata (count of active counselors).
   * Used by the GET endpoint to report current state.
   */
  static async getSyncStatus(supabase: SupabaseClient): Promise<{
    totalCounselors: number;
    activeCounselors: number;
    lastUpdated: string | null;
  }> {
    const { data, error } = await supabase
      .from('admission_counselors')
      .select('is_active, updated_at')
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return { totalCounselors: 0, activeCounselors: 0, lastUpdated: null };
    }

    return {
      totalCounselors: data.length,
      activeCounselors: data.filter(c => c.is_active).length,
      lastUpdated: data[0]?.updated_at || null,
    };
  }
}
