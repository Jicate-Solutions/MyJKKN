// lib/services/telephony/inbound-call-sync-service.ts
// CDR sync orchestration: fetch inbound calls from Exotel, upsert to DB, match leads

import { getExotelClient, isExotelConfigured, type ExotelCallRecord } from './exotel-client';
import { TelephonyService } from './telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'telephony/inbound-sync';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SyncOptions {
  /** Override start date (YYYY-MM-DD). Defaults to last sync date or 7 days ago. */
  fromDate?: string;
  /** Override end date (YYYY-MM-DD). Defaults to today. */
  toDate?: string;
  /** Full sync ignores last_synced_call_date and uses fromDate/default. */
  fullSync?: boolean;
}

export interface SyncResult {
  synced: number;
  matched: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class InboundCallSyncService {
  /**
   * Sync inbound call records from Exotel CDR API to admission_call_logs.
   * Uses incremental sync by default (from last_synced_call_date).
   * Upserts on call_sid to handle duplicates safely.
   */
  static async syncInboundCalls(
    institutionId: string,
    supabase: any,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = { synced: 0, matched: 0, skipped: 0, errors: [], durationMs: 0 };

    if (!isExotelConfigured()) {
      result.errors.push('Exotel is not configured');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    try {
      // Mark sync as running
      await InboundCallSyncService.updateSyncMetadata(institutionId, supabase, {
        status: 'running',
        error_message: null,
      });

      // Determine date range
      const { fromDate, toDate } = await InboundCallSyncService.resolveDateRange(
        institutionId,
        supabase,
        options
      );

      logger.info(MODULE, 'Starting inbound CDR sync', {
        institutionId,
        fromDate,
        toDate,
        fullSync: options.fullSync || false,
      });

      // Chunk into 30-day windows (Exotel max is 31 days)
      const chunks = InboundCallSyncService.dateChunks(fromDate, toDate, 30);
      let latestCallDate: string | null = null;

      for (const [chunkFrom, chunkTo] of chunks) {
        try {
          const chunkResult = await InboundCallSyncService.syncDateRange(
            institutionId,
            chunkFrom,
            chunkTo,
            supabase
          );

          result.synced += chunkResult.synced;
          result.matched += chunkResult.matched;
          result.skipped += chunkResult.skipped;
          result.errors.push(...chunkResult.errors);

          if (chunkResult.latestCallDate) {
            if (!latestCallDate || chunkResult.latestCallDate > latestCallDate) {
              latestCallDate = chunkResult.latestCallDate;
            }
          }
        } catch (chunkError) {
          const errMsg = `Chunk ${chunkFrom}–${chunkTo} failed: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`;
          logger.error(MODULE, errMsg);
          result.errors.push(errMsg);
          // Continue with next chunk — partial success is better than total failure
        }
      }

      // Update sync metadata
      await InboundCallSyncService.updateSyncMetadata(institutionId, supabase, {
        status: result.errors.length > 0 ? 'partial' : 'success',
        last_synced_call_date: latestCallDate,
        records_synced: result.synced,
        error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
      });

      logger.info(MODULE, 'Inbound CDR sync completed', {
        institutionId,
        synced: result.synced,
        matched: result.matched,
        skipped: result.skipped,
        errors: result.errors.length,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(MODULE, 'Inbound CDR sync failed', { institutionId, error: errMsg });
      result.errors.push(errMsg);

      await InboundCallSyncService.updateSyncMetadata(institutionId, supabase, {
        status: 'failed',
        error_message: errMsg,
      }).catch(() => {}); // Don't fail on metadata update
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Match unmatched inbound calls to admission leads by phone number.
   * Operates only on calls where lead_id IS NULL and direction = 'inbound'.
   */
  static async matchUnmatchedLeads(
    institutionId: string,
    supabase: any
  ): Promise<number> {
    // Get unmatched inbound calls
    const { data: unmatched, error } = await supabase
      .from('admission_call_logs')
      .select('id, from_number')
      .eq('institution_id', institutionId)
      .eq('direction', 'inbound')
      .is('lead_id', null)
      .limit(500);

    if (error || !unmatched?.length) return 0;

    let matchCount = 0;

    for (const call of unmatched) {
      const leadId = await TelephonyService.matchLeadByPhone(
        call.from_number,
        institutionId,
        supabase
      );

      if (leadId) {
        await supabase
          .from('admission_call_logs')
          .update({ lead_id: leadId, updated_at: new Date().toISOString() })
          .eq('id', call.id);
        matchCount++;
      }
    }

    return matchCount;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sync a single date range chunk from Exotel CDR API.
   */
  private static async syncDateRange(
    institutionId: string,
    fromDate: string,
    toDate: string,
    supabase: any
  ): Promise<{ synced: number; matched: number; skipped: number; errors: string[]; latestCallDate: string | null }> {
    const client = getExotelClient();
    let synced = 0;
    let matched = 0;
    let skipped = 0;
    const errors: string[] = [];
    let latestCallDate: string | null = null;

    const pages = client.fetchCallRecords({
      direction: 'inbound',
      dateFrom: fromDate,
      dateTo: toDate,
      status: 'completed,no-answer,busy,failed',
      pageSize: 100,
    });

    for await (const page of pages) {
      for (const record of page) {
        try {
          const upsertResult = await InboundCallSyncService.upsertCallRecord(
            record,
            institutionId,
            supabase
          );

          if (upsertResult.inserted) {
            synced++;
            if (upsertResult.leadMatched) matched++;
          } else {
            skipped++;
          }

          // Track latest call date for sync cursor
          const callDate = record.StartTime || record.DateCreated;
          if (callDate && (!latestCallDate || callDate > latestCallDate)) {
            latestCallDate = callDate;
          }
        } catch (recordError) {
          const msg = `Record ${record.Sid}: ${recordError instanceof Error ? recordError.message : String(recordError)}`;
          errors.push(msg);
          logger.warn(MODULE, 'Failed to upsert CDR record', { sid: record.Sid, error: msg });
        }
      }
    }

    return { synced, matched, skipped, errors, latestCallDate };
  }

  /**
   * Upsert a single Exotel CDR record into admission_call_logs.
   * Returns whether the record was newly inserted and if a lead was matched.
   */
  private static async upsertCallRecord(
    record: ExotelCallRecord,
    institutionId: string,
    supabase: any
  ): Promise<{ inserted: boolean; leadMatched: boolean }> {
    // Check if record already exists
    const { data: existing } = await supabase
      .from('admission_call_logs')
      .select('id, lead_id')
      .eq('call_sid', record.Sid)
      .maybeSingle();

    if (existing) {
      // Update existing record with latest data (status, duration, recording may have changed)
      await supabase
        .from('admission_call_logs')
        .update({
          status: InboundCallSyncService.mapExotelStatus(record.Status),
          duration_seconds: record.Duration ? parseInt(record.Duration, 10) || 0 : null,
          recording_url: record.RecordingUrl || record.PreSignedRecordingUrl || null,
          cost_amount: record.Price ? parseFloat(record.Price) || 0 : null,
          ended_at: record.EndTime || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      return { inserted: false, leadMatched: false };
    }

    // Match lead by phone number
    const leadId = await TelephonyService.matchLeadByPhone(
      record.From,
      institutionId,
      supabase
    );

    // Insert new record
    const { error } = await supabase
      .from('admission_call_logs')
      .insert({
        call_sid: record.Sid,
        institution_id: institutionId,
        direction: 'inbound',
        from_number: record.From || '',
        to_number: record.To || '',
        status: InboundCallSyncService.mapExotelStatus(record.Status),
        duration_seconds: record.Duration ? parseInt(record.Duration, 10) || 0 : null,
        recording_url: record.RecordingUrl || record.PreSignedRecordingUrl || null,
        cost_amount: record.Price ? parseFloat(record.Price) || 0 : null,
        cost_currency: 'INR',
        started_at: record.StartTime || null,
        answered_at: null,
        ended_at: record.EndTime || null,
        created_at: record.StartTime || new Date().toISOString(),
        lead_id: leadId,
        counselor_id: null,
      });

    if (error) {
      // Handle unique constraint violation (race with webhook)
      if (error.code === '23505') {
        return { inserted: false, leadMatched: false };
      }
      throw new Error(error.message);
    }

    return { inserted: true, leadMatched: !!leadId };
  }

  /**
   * Map Exotel status string to our internal status.
   */
  private static mapExotelStatus(
    exotelStatus: string
  ): 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'cancelled' {
    const map: Record<string, any> = {
      'queued': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'failed': 'failed',
      'canceled': 'cancelled',
      'cancelled': 'cancelled',
    };
    return map[exotelStatus?.toLowerCase()] || 'failed';
  }

  /**
   * Resolve the sync date range based on options and last sync state.
   */
  private static async resolveDateRange(
    institutionId: string,
    supabase: any,
    options: SyncOptions
  ): Promise<{ fromDate: string; toDate: string }> {
    const toDate = options.toDate || new Date().toISOString().substring(0, 10);

    if (options.fromDate) {
      return { fromDate: options.fromDate, toDate };
    }

    if (!options.fullSync) {
      // Check last sync state
      const { data: syncMeta } = await supabase
        .from('telephony_sync_metadata')
        .select('last_synced_call_date')
        .eq('institution_id', institutionId)
        .eq('sync_type', 'inbound_cdr')
        .maybeSingle();

      if (syncMeta?.last_synced_call_date) {
        // Overlap by 1 hour to catch late-arriving CDRs
        const lastDate = new Date(syncMeta.last_synced_call_date);
        lastDate.setHours(lastDate.getHours() - 1);
        return { fromDate: lastDate.toISOString().substring(0, 10), toDate };
      }
    }

    // Default: last 7 days for first sync
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 7);
    return { fromDate: defaultFrom.toISOString().substring(0, 10), toDate };
  }

  /**
   * Chunk a date range into windows of maxDays each (Exotel max is 31 days).
   */
  private static *dateChunks(
    fromStr: string,
    toStr: string,
    maxDays: number = 30
  ): Generator<[string, string]> {
    let cursor = new Date(fromStr);
    const to = new Date(toStr);

    while (cursor < to) {
      const chunkEnd = new Date(
        Math.min(cursor.getTime() + maxDays * 86400000, to.getTime())
      );
      yield [
        cursor.toISOString().substring(0, 10),
        chunkEnd.toISOString().substring(0, 10),
      ];
      cursor = new Date(chunkEnd.getTime() + 86400000); // next day
    }
  }

  /**
   * Update or create sync metadata for an institution.
   */
  private static async updateSyncMetadata(
    institutionId: string,
    supabase: any,
    updates: Record<string, any>
  ): Promise<void> {
    const { error: upsertError } = await supabase
      .from('telephony_sync_metadata')
      .upsert(
        {
          institution_id: institutionId,
          sync_type: 'inbound_cdr',
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...updates,
        },
        { onConflict: 'institution_id,sync_type' }
      );

    if (upsertError) {
      logger.warn(MODULE, 'Failed to update sync metadata', {
        institutionId,
        error: upsertError.message,
      });
    }
  }
}
