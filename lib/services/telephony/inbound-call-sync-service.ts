// lib/services/telephony/inbound-call-sync-service.ts
// CDR sync orchestration: fetch inbound calls from Exotel, upsert to DB, match leads

import { getExotelClient, isExotelConfigured, type ExotelCallRecord } from './exotel-client';
import { TelephonyService } from './telephony-service';
import { CallPipelineService } from './call-pipeline-service';
import { isAdmissionCall } from './exotel-agent-map';
import { resolveCounselorIdForCall } from './call-attribution';
import { exotelTimeToIso } from './exotel-time';
import { logger } from '@/lib/utils/enhanced-logger';
import { getPolicy } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';

const MODULE = 'telephony/inbound-sync';

// Hardcoded fallbacks if the policy row is missing or malformed. Match the
// pre-policy production values so behavior is unchanged at deploy time.
const CDR_SYNC_DEFAULT_LOOKBACK_DAYS = 7;
const CDR_SYNC_CHUNK_MAX_DAYS = 30; // Exotel CDR max is 31 days

interface CdrSyncConfig {
  default_lookback_days: number;
  chunk_max_days: number;
}

/**
 * Resolve the CDR sync windowing config from platform_policies, with
 * defensive fallbacks. Reads `telephony.cdr_sync.config` (object) once per
 * sync invocation. Director-tweakable via admin UI — no deploy needed.
 */
async function resolveCdrSyncConfig(): Promise<CdrSyncConfig> {
  const raw = await getPolicy<Partial<CdrSyncConfig>>(
    POLICY_KEYS.TELEPHONY_CDR_SYNC_CONFIG,
    null
  );
  const lookback =
    raw && typeof raw.default_lookback_days === 'number' && raw.default_lookback_days > 0
      ? raw.default_lookback_days
      : CDR_SYNC_DEFAULT_LOOKBACK_DAYS;
  const chunk =
    raw && typeof raw.chunk_max_days === 'number' && raw.chunk_max_days > 0 && raw.chunk_max_days <= 31
      ? raw.chunk_max_days
      : CDR_SYNC_CHUNK_MAX_DAYS;
  return { default_lookback_days: lookback, chunk_max_days: chunk };
}

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

      // Read CDR sync windowing once per invocation (Director-tunable via
      // platform_policies row `telephony.cdr_sync.config`). Falls back to the
      // pre-policy hardcoded defaults (7-day lookback, 30-day chunks) if the
      // row is missing or malformed.
      const cdrConfig = await resolveCdrSyncConfig();

      // Determine date range
      const { fromDate, toDate } = await InboundCallSyncService.resolveDateRange(
        institutionId,
        supabase,
        options,
        cdrConfig.default_lookback_days
      );

      logger.info(MODULE, 'Starting inbound CDR sync', {
        institutionId,
        fromDate,
        toDate,
        fullSync: options.fullSync || false,
        defaultLookbackDays: cdrConfig.default_lookback_days,
        chunkMaxDays: cdrConfig.chunk_max_days,
      });

      // Chunk into N-day windows (Exotel max is 31 days). Default 30 from policy.
      const chunks = InboundCallSyncService.dateChunks(fromDate, toDate, cdrConfig.chunk_max_days);
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

          // Persist cursor per-chunk so a mid-run timeout doesn't lose progress.
          // Next invocation's resolveDateRange() will pick up from this cursor
          // instead of restarting the full historical backfill.
          if (latestCallDate) {
            await InboundCallSyncService.updateSyncMetadata(institutionId, supabase, {
              status: 'running',
              last_synced_call_date: latestCallDate,
              records_synced: result.synced,
            }).catch(() => {}); // Don't fail the chunk loop on metadata write errors
          }
        } catch (chunkError) {
          const errMsg = `Chunk ${chunkFrom}–${chunkTo} failed: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`;
          logger.error(MODULE, errMsg);
          result.errors.push(errMsg);
          // Continue with next chunk — partial success is better than total failure
        }
      }

      // Update sync metadata. Preserve the existing cursor when no records
      // were processed this run — overwriting with `null` would make the next
      // run fall back to the 7-day default window, replaying the same records
      // and hitting the 300s function timeout. See: 2026-04-22 regression.
      const finalUpdates: Record<string, any> = {
        status: result.errors.length > 0 ? 'partial' : 'success',
        records_synced: result.synced,
        error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
      };
      if (latestCallDate) {
        finalUpdates.last_synced_call_date = latestCallDate;
      }
      await InboundCallSyncService.updateSyncMetadata(institutionId, supabase, finalUpdates);

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

    // NOTE: Do NOT pass multi-value Status filter — Exotel's /Calls.json rejects
    // comma-separated Status with HTTP 400 ("Invalid parameter"). Broke CDR sync
    // silently 2026-04-11 → 2026-04-21 (10 days of missed webhooks). Exotel's
    // CDR API only returns terminal-state calls anyway, so this filter is redundant.
    const pages = client.fetchCallRecords({
      direction: 'inbound',
      dateFrom: fromDate,
      dateTo: toDate,
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

      // Persist cursor after every page (~100 records) so a mid-chunk timeout
      // still saves progress. The per-chunk save above only fires after the
      // whole chunk completes; for a 7-day window that is ONE chunk, so
      // without this, a timeout anywhere in the page loop wipes all progress.
      if (latestCallDate) {
        await InboundCallSyncService.updateSyncMetadata(institutionId, supabase, {
          status: 'running',
          last_synced_call_date: latestCallDate,
          records_synced: synced,
        }).catch(() => {});
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
          ended_at: exotelTimeToIso(record.EndTime),
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

    // Classify as admission or not, using the same rules the webhook uses
    // (see exotel-agent-map.isAdmissionCall). Without this, CDR-sourced records
    // have is_admission_call=null and are invisible to dashboards that filter on
    // `is_admission_call = true`.
    const exoPhone = record.PhoneNumber || record.PhoneNumberSid || '';
    const isAdm = isAdmissionCall(record.To || '', exoPhone);

    // Attribution: resolve counselor_id via lead.assigned_counselor_id first,
    // then agent-phone → AGENT_MAP → profiles.email. Used to be hardcoded null.
    const counselorId = await resolveCounselorIdForCall(
      { leadId, dialWhomNumber: record.To || '' },
      supabase
    );

    // Insert new record
    const { data: insertedCall, error } = await supabase
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
        started_at: exotelTimeToIso(record.StartTime),
        answered_at: null,
        ended_at: exotelTimeToIso(record.EndTime),
        created_at: exotelTimeToIso(record.StartTime) || new Date().toISOString(),
        lead_id: leadId,
        counselor_id: counselorId,
        is_admission_call: isAdm,
        // TODO(Signal 4): dial_whom_number intentionally omitted here.
        // Exotel CDR API (/Calls.json) does not expose a per-leg DialWhomNumber
        // field — the CDR record only has To (the ExoPhone DID, e.g. 04446313503)
        // and From (caller). The actual agent dialled is only available in the
        // real-time Passthru webhook payload (persisted by the webhook path above).
        // Follow-up PR will back-match webhook rows to CDR rows via call_sid and
        // copy dial_whom_number across where it exists. See: feat/telephony-preserve-dial-whom-number.
      })
      .select('id')
      .single();

    if (error) {
      // Handle unique constraint violation (race with webhook)
      if (error.code === '23505') {
        return { inserted: false, leadMatched: false };
      }
      throw new Error(error.message);
    }

    // Run the call pipeline (intelligence submit + auto-SMS + callback queue)
    // on the newly-inserted row. Pre-fix, only the real-time StatusCallback
    // webhook path triggered the pipeline — cron-path inserts skipped it
    // entirely, leaving 475 recordings without intelligence rows over the
    // 2026-04-11 → 2026-05-02 window. Pipeline is idempotent (early-returns
    // if intelligence_id is already set) and non-blocking via .catch().
    if (insertedCall?.id) {
      const recordingUrl = record.RecordingUrl || record.PreSignedRecordingUrl || undefined;
      const durationSec = record.Duration ? parseInt(record.Duration, 10) || 0 : 0;
      const costAmount = record.Price ? parseFloat(record.Price) || 0 : 0;
      const status = InboundCallSyncService.mapExotelStatus(record.Status);

      CallPipelineService.runPipeline({
        callLogId: insertedCall.id,
        callSid: record.Sid,
        institutionId,
        direction: 'inbound',
        status,
        fromNumber: record.From || '',
        toNumber: record.To || '',
        durationSeconds: durationSec,
        costAmount,
        recordingUrl,
        leadId: leadId ?? undefined,
        counselorId: counselorId ?? undefined,
      }, supabase).catch((err) =>
        logger.warn(MODULE, 'Cron-path pipeline invocation failed', {
          callSid: record.Sid,
          error: err instanceof Error ? err.message : String(err),
        })
      );
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
   * The default-lookback window (used when no last_synced_call_date cursor
   * exists) is supplied by the caller from the `telephony.cdr_sync.config`
   * platform_policies row, with a hardcoded fallback of 7 days at the call site.
   */
  private static async resolveDateRange(
    institutionId: string,
    supabase: any,
    options: SyncOptions,
    defaultLookbackDays: number = CDR_SYNC_DEFAULT_LOOKBACK_DAYS
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

    // Default: lookback window (policy-driven, default 7 days) for first sync
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - defaultLookbackDays);
    return { fromDate: defaultFrom.toISOString().substring(0, 10), toDate };
  }

  /**
   * Chunk a date range into windows of maxDays each (Exotel max is 31 days).
   *
   * The range is INCLUSIVE of toStr. Previously used `cursor < to`, which silently
   * yielded zero chunks when fromStr === toStr — a same-UTC-calendar-day cursor
   * would cause the cron to report records_synced=0, status=success while Exotel
   * had unpulled calls. Detected 2026-04-23 after cursor caught up within a single
   * day (~6h silent run, 43 Apr-23 calls missing). Using `<=` ensures the loop
   * body runs at least once; Exotel's CDR filter is already inclusive of the
   * end day (gte:X 00:00:00 ; lte:X 23:59:59 in exotel-client.ts).
   */
  private static *dateChunks(
    fromStr: string,
    toStr: string,
    maxDays: number = 30
  ): Generator<[string, string]> {
    let cursor = new Date(fromStr);
    const to = new Date(toStr);

    while (cursor <= to) {
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
