// lib/services/events/marathon/marathon-certificate-service.ts
// Marathon Certificate service — generate, verify, and retrieve certificate data.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// Return Types
// ============================================================================

export interface GenerateCertificatesResult {
  generated: number;
  skipped: number;
}

export interface CertificateData {
  valid: boolean;
  participant_name?: string;
  event_name?: string;
  event_date?: string;
  category?: string;
  finish_time?: string;
  rank_overall?: number;
  rank_category?: number;
  certificate_id?: string;
  generated_at?: string;
}

// ============================================================================
// Service
// ============================================================================

export class MarathonCertificateService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Certificate ID Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a certificate ID in format: CERT-{EVENT_CODE}-{YEAR}-{SEQUENCE}
   * e.g. CERT-MRT2025-2025-00042
   */
  private static buildCertId(
    eventCode: string,
    year: number,
    sequence: number
  ): string {
    const seqStr = String(sequence).padStart(5, '0');
    return `CERT-${eventCode.toUpperCase()}-${year}-${seqStr}`;
  }

  // --------------------------------------------------------------------------
  // Generate Certificates
  // --------------------------------------------------------------------------

  /**
   * Generate certificate IDs for all finishers (non-DNF, non-DQ) that don't
   * already have one.
   */
  static async generateCertificates(
    eventId: string
  ): Promise<GenerateCertificatesResult> {
    try {
      // Fetch the event for name/code
      const { data: event, error: eventError } = await (this.supabase as any)
        .from('events')
        .select('id, name, event_date, slug')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError || !event) {
        logger.error('events/marathon-certificates', 'Failed to fetch event', eventError);
        throw eventError ?? new Error('Event not found');
      }

      // Build a short code from event name/slug
      const rawCode =
        (event.slug as string | null) ??
        (event.name as string).replace(/\s+/g, '').toUpperCase().slice(0, 10);
      const eventCode = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      const year = event.event_date
        ? new Date(event.event_date as string).getFullYear()
        : new Date().getFullYear();

      // Fetch results without a certificate yet
      const { data: results, error: resultsError } = await (this.supabase as any)
        .from('marathon_results')
        .select('id, bib_number')
        .eq('event_id', eventId)
        .eq('is_dnf', false)
        .eq('is_disqualified', false)
        .is('certificate_id', null);

      if (resultsError) {
        logger.error('events/marathon-certificates', 'Failed to fetch results', resultsError);
        throw resultsError;
      }

      const pending = (results ?? []) as Array<{ id: string; bib_number: string }>;

      if (pending.length === 0) {
        logger.info('events/marathon-certificates', 'No pending certificates', { eventId });
        return { generated: 0, skipped: 0 };
      }

      // Count existing certificates to determine starting sequence
      const { count: existingCount, error: countError } = await (this.supabase as any)
        .from('marathon_results')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .not('certificate_id', 'is', null);

      if (countError) {
        logger.warn('events/marathon-certificates', 'Failed to count existing certs', countError);
      }

      const startSequence = (existingCount ?? 0) + 1;
      const now = new Date().toISOString();

      // Build updates
      const updates = pending.map((result, idx) => ({
        id: result.id,
        certificate_id: this.buildCertId(eventCode, year, startSequence + idx),
        certificate_generated_at: now,
      }));

      // Apply updates in batches of 50
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

      logger.info('events/marathon-certificates', 'Certificates generated', {
        eventId,
        generated,
      });

      return { generated, skipped: 0 };
    } catch (error) {
      logger.error('events/marathon-certificates', 'Unexpected error in generateCertificates', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Certificate Data / Verification
  // --------------------------------------------------------------------------

  /**
   * Get certificate data for a given certificate ID (public verification endpoint).
   */
  static async getCertificateData(certId: string): Promise<CertificateData | null> {
    try {
      const { data: result, error: resultError } = await (this.supabase as any)
        .from('marathon_results')
        .select(
          `id, finish_time, rank_overall, rank_category, certificate_id, certificate_generated_at,
           registration:events_registrations(
             participant_name,
             category:event_categories(name),
             event:events(name, event_date)
           )`
        )
        .eq('certificate_id', certId)
        .maybeSingle();

      if (resultError) {
        logger.warn('events/marathon-certificates', 'Failed to fetch certificate', {
          certId,
          error: resultError,
        });
        return null;
      }

      if (!result) {
        return { valid: false };
      }

      const reg = (result as any).registration;
      const event = reg?.event;
      const category = reg?.category;

      return {
        valid: true,
        participant_name: reg?.participant_name ?? undefined,
        event_name: event?.name ?? undefined,
        event_date: event?.event_date ?? undefined,
        category: category?.name ?? undefined,
        finish_time: (result as any).finish_time ?? undefined,
        rank_overall: (result as any).rank_overall ?? undefined,
        rank_category: (result as any).rank_category ?? undefined,
        certificate_id: (result as any).certificate_id,
        generated_at: (result as any).certificate_generated_at ?? undefined,
      };
    } catch (error) {
      logger.error('events/marathon-certificates', 'Unexpected error in getCertificateData', error);
      return null;
    }
  }

  /**
   * Quickly verify a certificate exists and is valid.
   */
  static async verifyCertificate(certId: string): Promise<boolean> {
    try {
      const { count, error } = await (this.supabase as any)
        .from('marathon_results')
        .select('id', { count: 'exact', head: true })
        .eq('certificate_id', certId)
        .eq('is_dnf', false)
        .eq('is_disqualified', false);

      if (error) {
        logger.warn('events/marathon-certificates', 'Failed to verify certificate', { certId });
        return false;
      }

      return (count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  /** Get certificate generation stats for an event. */
  static async getCertificateStats(eventId: string): Promise<{
    total_finishers: number;
    generated: number;
    pending: number;
  }> {
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
      logger.error('events/marathon-certificates', 'Failed to fetch certificate stats', error);
      return { total_finishers: 0, generated: 0, pending: 0 };
    }
  }

  /** Fetch all results with certificates for a given event. */
  static async getCertificateList(eventId: string) {
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
        logger.error('events/marathon-certificates', 'Failed to fetch certificate list', error);
        throw error;
      }

      return (data ?? []) as Array<{
        id: string;
        bib_number: string;
        finish_time: string | null;
        rank_overall: number | null;
        certificate_id: string;
        certificate_generated_at: string | null;
        registration: { participant_name: string } | null;
      }>;
    } catch (error) {
      logger.error('events/marathon-certificates', 'Unexpected error in getCertificateList', error);
      throw error;
    }
  }
}
