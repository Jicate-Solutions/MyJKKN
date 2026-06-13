export const dynamic = 'force-dynamic';

// /api/cron/meta-leadgen-backfill
// Backfill cron — pulls the last meta.leadgen.backfill_lookback_days days
// of leads for every active meta_lead_forms row that has an institution_id
// resolved. Catches anything the webhook may have dropped (Meta's webhook
// is best-effort and dedupes after-the-fact).
//
// Schedule (recommended): every 30 minutes via vercel.json cron entry.
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
//
// Idempotent:
//   - meta_leagen_events.fb_leadgen_id has a UNIQUE index.
//   - LeadService.captureLead() merges by last-10-digits phone within
//     institution; a re-import of the same lead is a no-op create + a
//     merge-row append to lead_source_captures.
//
// No-op when meta.leadgen.is_enabled=false.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/utils/enhanced-logger';
import { backfillLeads, getLead } from '@/lib/meta/lead-ads-client';
import { importMetaLead } from '@/lib/services/admission/meta-lead-importer';
import type {
  FbLeadgenLead,
  FbLeadgenWebhookValue,
} from '@/lib/meta/lead-ads-types';

const DEFAULT_LOOKBACK_DAYS = 7;
const FORM_HARD_CAP = 50; // total forms processed per cron tick
const PER_FORM_LEAD_CAP = 500; // safety stop per form per tick

/**
 * Standard Meta token env fallback chain — mirrors
 * app/api/admin/social/lead-ads/forms (#1282 follow-up). Previously this
 * cron hard-required META_LEAD_ADS_PAGE_ACCESS_TOKEN and 500'd when only
 * one of the sibling tokens was configured.
 */
function getEnvFallbackToken(): string | undefined {
  return (
    process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN ||
    process.env.META_IG_SYSTEM_USER_TOKEN ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    undefined
  );
}

// ---------------------------------------------------------------------------
// Service-role Supabase client
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Policy helpers
// ---------------------------------------------------------------------------

async function readBackfillLookback(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc('fn_get_policy_int', {
    p_key: 'meta.leadgen.backfill_lookback_days',
    p_default: DEFAULT_LOOKBACK_DAYS,
    p_scope_id: null,
  });
  if (error) return DEFAULT_LOOKBACK_DAYS;
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOOKBACK_DAYS;
}

async function readIsEnabled(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('fn_get_policy_bool', {
    p_key: 'meta.leadgen.is_enabled',
    p_default: false,
    p_scope_id: null,
  });
  if (error) return false;
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// GET — Vercel Cron entry point
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth: Vercel Cron sends Bearer CRON_SECRET in the Authorization header.
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Sentry.startSpan({ op: 'cron.meta_leadgen', name: 'backfill' }, async () => {
    const startedAt = Date.now();
    const db = getServiceClient();

    const isEnabled = await readIsEnabled(db);
    if (!isEnabled) {
      return NextResponse.json({
        ok: true,
        skipped: 'meta.leadgen.is_enabled=false',
        forms: 0,
        leads: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    const pageAccessToken = getEnvFallbackToken();
    if (!pageAccessToken) {
      return NextResponse.json({
        ok: false,
        error:
          'No Meta access token available. Set one of META_LEAD_ADS_PAGE_ACCESS_TOKEN / ' +
          'META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN.',
      }, { status: 500 });
    }

    const lookbackDays = await readBackfillLookback(db);
    const sinceMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    const sinceIso = new Date(sinceMs).toISOString();

    // Active forms with a resolved institution. Use the column-based
    // join — we don't need PostgREST !inner since institution_id is
    // a direct column on meta_lead_forms.
    const { data: forms, error: formsErr } = await db
      .from('meta_lead_forms')
      .select('id, fb_form_id, fb_page_id, institution_id, last_backfilled_at')
      .eq('is_active', true)
      .order('last_backfilled_at', { ascending: true, nullsFirst: true })
      .limit(FORM_HARD_CAP);

    if (formsErr) {
      logger.error('meta/leadgen-backfill', 'forms select failed', {
        error: formsErr.message,
      });
      return NextResponse.json({ ok: false, error: formsErr.message }, { status: 500 });
    }

    let totalLeads = 0;
    let totalImported = 0;
    let totalFailed = 0;
    const formResults: Array<{
      fb_form_id: string;
      fetched: number;
      imported: number;
      merged: number;
      failed: number;
      skipped: number;
    }> = [];

    for (const form of forms ?? []) {
      const fbFormId = form.fb_form_id as string;
      const fbPageId = form.fb_page_id as string;

      let fetched: FbLeadgenLead[];
      try {
        fetched = await backfillLeads(
          fbFormId,
          { accessToken: pageAccessToken },
          { since: sinceIso, limit: 100, maxPages: Math.ceil(PER_FORM_LEAD_CAP / 100) }
        );
      } catch (err) {
        logger.error('meta/leadgen-backfill', 'backfillLeads failed', {
          fbFormId,
          error: err instanceof Error ? err.message : String(err),
        });
        formResults.push({ fb_form_id: fbFormId, fetched: 0, imported: 0, merged: 0, failed: 1, skipped: 0 });
        totalFailed += 1;
        continue;
      }

      const counts = { imported: 0, merged: 0, failed: 0, skipped: 0 };

      for (const lead of fetched.slice(0, PER_FORM_LEAD_CAP)) {
        const event: FbLeadgenWebhookValue = {
          leadgen_id: lead.id,
          form_id: fbFormId,
          page_id: fbPageId,
          created_time: Math.floor(Date.parse(lead.created_time) / 1000) || 0,
          ad_id: lead.ad_id,
        };
        try {
          const result = await importMetaLead(
            { event },
            {
              supabaseService: db,
              // The cron already has the lead body — no need to re-fetch.
              // Still inject the Graph getLead as a safety net for cases
              // where importer wants to retry-hydrate.
              fetchLead: async (leadgenId) =>
                leadgenId === lead.id
                  ? lead
                  : getLead(leadgenId, { accessToken: pageAccessToken }),
            }
          );
          counts[result.status] += 1;
        } catch (err) {
          counts.failed += 1;
          logger.error('meta/leadgen-backfill', 'importMetaLead threw', {
            leadgenId: lead.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await db
        .from('meta_lead_forms')
        .update({ last_backfilled_at: new Date().toISOString() })
        .eq('id', form.id);

      formResults.push({
        fb_form_id: fbFormId,
        fetched: fetched.length,
        ...counts,
      });
      totalLeads += fetched.length;
      totalImported += counts.imported;
      totalFailed += counts.failed;
    }

    const durationMs = Date.now() - startedAt;
    logger.info('meta/leadgen-backfill', 'tick complete', {
      forms: forms?.length ?? 0,
      totalLeads,
      totalImported,
      totalFailed,
      lookbackDays,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      forms: forms?.length ?? 0,
      leads: totalLeads,
      imported: totalImported,
      failed: totalFailed,
      lookbackDays,
      durationMs,
      results: formResults,
    });
  });
}
