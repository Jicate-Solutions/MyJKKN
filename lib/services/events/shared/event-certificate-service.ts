// lib/services/events/shared/event-certificate-service.ts
// Shared certificate service for ANY event type (Events Platform Promotion PR6).
// Generalizes the marathon certificate flow: generate certificate IDs for finishers, list issued
// certificates, and read the public verification payload through the event-agnostic
// fn_verify_event_certificate RPC.
//
// Decision #6 ("winners-photo split"): the public verify payload includes a photo ONLY for winners
// (award tier gold/silver/bronze). That gate is enforced SERVER-SIDE inside the RPC — this service
// never decides photo visibility; it just renders whatever the RPC returns.
//
// Cert data lives inline on marathon_results today (no table rename in PR6). The public-verify RPC is
// the canonical read path so callers don't depend on that physical table name.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/certificates';

// ============================================================================
// Return Types
// ============================================================================

export interface GenerateCertificatesResult {
  generated: number;
  skipped: number;
}

export interface CertificateStats {
  total_finishers: number;
  generated: number;
  pending: number;
}

export interface CertificateListRow {
  id: string;
  bib_number: string;
  finish_time: string | null;
  rank_overall: number | null;
  certificate_id: string;
  certificate_generated_at: string | null;
  registration: { participant_name: string } | null;
}

/** Public verification payload — mirrors fn_verify_event_certificate exactly. */
export interface EventCertificateVerification {
  valid: boolean;
  certificate_id?: string;
  participant_name?: string;
  /** 'gold' | 'silver' | 'bronze' | 'participant' */
  award_tier?: string;
  rank_overall?: number | null;
  event_name?: string;
  event_date?: string | null;
  venue?: string | null;
  category?: string | null;
  finish_time?: string | null;
  generated_at?: string | null;
  /** Present ONLY for winners — the RPC returns null for participants (server-side gate). */
  photo_url?: string | null;
}

const WINNER_TIERS = new Set(['gold', 'silver', 'bronze']);

export function isWinnerTier(tier?: string | null): boolean {
  return !!tier && WINNER_TIERS.has(tier);
}

/** Public no-login verification link for a certificate. */
export function certificateVerifyUrl(certId: string): string {
  return `/p/verify/${encodeURIComponent(certId)}`;
}

// ============================================================================
// Service
// ============================================================================

export class EventCertificateService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Certificate ID Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a certificate ID in format: CERT-{EVENT_CODE}-{YEAR}-{SEQUENCE}
   * e.g. CERT-MRT2025-2025-00042
   */
  private static buildCertId(eventCode: string, year: number, sequence: number): string {
    const seqStr = String(sequence).padStart(5, '0');
    return `CERT-${eventCode.toUpperCase()}-${year}-${seqStr}`;
  }

  /**
   * Generate certificate IDs for all finishers (non-DNF, non-DQ) that don't already have one.
   */
  static async generateCertificates(eventId: string): Promise<GenerateCertificatesResult> {
    try {
      const { data: event, error: eventError } = await (this.supabase as any)
        .from('events')
        .select('id, name, event_date, slug')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError || !event) {
        logger.error(MOD, 'Failed to fetch event', eventError);
        throw eventError ?? new Error('Event not found');
      }

      const rawCode =
        (event.slug as string | null) ??
        (event.name as string).replace(/\s+/g, '').toUpperCase().slice(0, 10);
      const eventCode = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      const year = event.event_date
        ? new Date(event.event_date as string).getFullYear()
        : new Date().getFullYear();

      const { data: results, error: resultsError } = await (this.supabase as any)
        .from('marathon_results')
        .select('id, bib_number')
        .eq('event_id', eventId)
        .eq('is_dnf', false)
        .eq('is_disqualified', false)
        .is('certificate_id', null);

      if (resultsError) {
        logger.error(MOD, 'Failed to fetch results', resultsError);
        throw resultsError;
      }

      const pending = (results ?? []) as Array<{ id: string; bib_number: string }>;
      if (pending.length === 0) {
        logger.info(MOD, 'No pending certificates', { eventId });
        return { generated: 0, skipped: 0 };
      }

      const { count: existingCount, error: countError } = await (this.supabase as any)
        .from('marathon_results')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .not('certificate_id', 'is', null);

      if (countError) {
        logger.warn(MOD, 'Failed to count existing certs', countError);
      }

      const startSequence = (existingCount ?? 0) + 1;
      const now = new Date().toISOString();

      const updates = pending.map((result, idx) => ({
        id: result.id,
        certificate_id: this.buildCertId(eventCode, year, startSequence + idx),
        certificate_generated_at: now,
      }));

      let generated = 0;
      const chunkSize = 50;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(({ id, certificate_id, certificate_generated_at }) =>
            (this.supabase as any)
              .from('marathon_results')
              .update({ certificate_id, certificate_generated_at })
              .eq('id', id)
          )
        );
        generated += chunk.length;
      }

      logger.info(MOD, 'Certificates generated', { eventId, generated });
      return { generated, skipped: 0 };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in generateCertificates', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Public verification (winners-photo split — decision #6)
  // --------------------------------------------------------------------------

  /**
   * Read the public verification payload for a certificate via fn_verify_event_certificate.
   * The photo gate is enforced server-side: participants come back with photo_url = null.
   * Works with the anon client too (the RPC is GRANTed to anon).
   */
  static async verify(
    certId: string,
    client?: { rpc: (fn: string, args: Record<string, unknown>) => any }
  ): Promise<EventCertificateVerification> {
    try {
      const supabase = client ?? (this.supabase as any);
      const { data, error } = await supabase.rpc('fn_verify_event_certificate', {
        p_cert_id: certId,
      });

      if (error) {
        logger.warn(MOD, 'Verify RPC failed', { certId, error });
        return { valid: false };
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { valid: false };

      return {
        valid: true,
        certificate_id: row.certificate_id ?? undefined,
        participant_name: row.participant_name ?? undefined,
        award_tier: row.award_tier ?? undefined,
        rank_overall: row.rank_overall ?? null,
        event_name: row.event_name ?? undefined,
        event_date: row.event_date ?? null,
        venue: row.venue ?? null,
        category: row.category ?? null,
        finish_time: row.finish_time ?? null,
        generated_at: row.generated_at ?? null,
        photo_url: row.photo_url ?? null,
      };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in verify', error);
      return { valid: false };
    }
  }

  // --------------------------------------------------------------------------
  // Stats + List (management surface)
  // --------------------------------------------------------------------------

  static async getCertificateStats(eventId: string): Promise<CertificateStats> {
    try {
      const [finishersResult, generatedResult] = await Promise.all([
        (this.supabase as any)
          .from('marathon_results')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('is_dnf', false)
          .eq('is_disqualified', false),
        (this.supabase as any)
          .from('marathon_results')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('is_dnf', false)
          .eq('is_disqualified', false)
          .not('certificate_id', 'is', null),
      ]);

      const totalFinishers = finishersResult.count ?? 0;
      const generated = generatedResult.count ?? 0;
      return {
        total_finishers: totalFinishers,
        generated,
        pending: totalFinishers - generated,
      };
    } catch (error) {
      logger.error(MOD, 'Failed to fetch certificate stats', error);
      return { total_finishers: 0, generated: 0, pending: 0 };
    }
  }

  static async getCertificateList(eventId: string): Promise<CertificateListRow[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .select(
          `id, bib_number, finish_time, rank_overall, certificate_id, certificate_generated_at,
           registration:events_registrations(participant_name)`
        )
        .eq('event_id', eventId)
        .eq('is_dnf', false)
        .eq('is_disqualified', false)
        .not('certificate_id', 'is', null)
        .order('rank_overall', { ascending: true, nullsFirst: false });

      if (error) {
        logger.error(MOD, 'Failed to fetch certificate list', error);
        throw error;
      }
      return (data ?? []) as CertificateListRow[];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getCertificateList', error);
      throw error;
    }
  }
}
