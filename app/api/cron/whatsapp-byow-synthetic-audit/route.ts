export const dynamic = 'force-dynamic';

// /api/cron/whatsapp-byow-synthetic-audit
// Spec 3 Phase 2 Task 17 (§8b item 15, §3 Round 3.3): Hourly synthetic audit.
// For each dept with status='ready' BYOW connection, send a synthetic message
// (the connection's own number) so we can detect silent inbound-webhook drops.
// The capture-check side is a follow-up — the inbound webhook updates the row
// to status='captured' on receipt, OR a sweep cron at +5min marks 'timeout'.
//
// CRITICAL GATE: This cron is DISABLED by default. The first non-auth statement
// reads policy `wa_byow.synthetic_audit_enabled` (default false) and short-
// circuits before any send fires. Director flips the flag manually after
// dry-run review. Without this gate, real WA msgs fire on every invocation
// against institutional WhatsApp quota.
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md §8b item 15

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getPolicyBool } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { personalSendMessageAPI } from '@/lib/whatsapp/personal-api-client';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface ReadyConnection {
  id: string;
  department_id: string;
  phone_number: string | null;
  service_url: string | null;
  client_id: string | null;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // CRITICAL GATE: short-circuit if disabled-by-default policy is still false.
  const enabled = await getPolicyBool(POLICY_KEYS.WA_BYOW_SYNTHETIC_AUDIT_ENABLED, false);
  if (!enabled) {
    Sentry.captureMessage('BYOW synthetic audit cron skipped (disabled-by-default)', {
      level: 'info',
      tags: { feature: 'byow_whatsapp', event: 'synthetic_audit_disabled_skip' },
    });
    return NextResponse.json(
      {
        skipped: true,
        reason: 'wa_byow.synthetic_audit_enabled=false',
        ts: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  const start = Date.now();
  const summary = {
    ready_connections: 0,
    sent: 0,
    failed: 0,
    skipped_no_phone: 0,
  };

  try {
    const supabase = getServiceClient();
    const { data: connections, error } = await supabase
      .from('wa_personal_connections')
      .select('id, department_id, phone_number, service_url, client_id')
      .eq('status', 'ready');

    if (error) throw error;
    const readyConns = (connections ?? []) as ReadyConnection[];
    summary.ready_connections = readyConns.length;

    for (const conn of readyConns) {
      // Self-test pattern: send to the connection's own phone so the inbound
      // webhook (running off the same Railway client) confirms round-trip.
      if (!conn.phone_number) {
        summary.skipped_no_phone++;
        continue;
      }

      const auditMsgId = `synth-audit-${conn.id}-${Date.now()}`;
      const message = `[AUDIT ${auditMsgId}] BYOW synthetic round-trip probe — automated, ignore.`;
      const sentAt = new Date().toISOString();

      try {
        const clientId = conn.client_id || `dept-${conn.department_id}`;
        const baseUrl = conn.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';
        const result = await personalSendMessageAPI(conn.phone_number, message, {
          serviceUrl: `${baseUrl}/clients/${clientId}`,
          apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
        });

        if (result.success) {
          await supabase.from('wa_byow_synthetic_audit_log').insert({
            connection_id: conn.id,
            sent_at: sentAt,
            audit_msg_id: auditMsgId,
            status: 'sent',
          });
          // Capture-check side is follow-up — webhook will UPDATE
          // wa_byow_synthetic_audit_log on inbound msg with matching phone,
          // OR a separate sweep cron at +5min.
          summary.sent++;
        } else {
          summary.failed++;
          Sentry.captureMessage(
            `BYOW synthetic audit send failed: dept=${conn.department_id} reason=${result.error ?? 'unknown'}`,
            {
              level: 'warning',
              tags: { feature: 'byow_whatsapp', event: 'synthetic_audit_send_failed' },
              extra: { connection_id: conn.id, audit_msg_id: auditMsgId },
            }
          );
        }
      } catch (sendErr) {
        summary.failed++;
        Sentry.captureException(sendErr, {
          tags: { feature: 'byow_whatsapp', event: 'synthetic_audit_send_exception' },
          extra: { connection_id: conn.id, audit_msg_id: auditMsgId },
        });
      }
    }

    const elapsedMs = Date.now() - start;
    Sentry.captureMessage('BYOW synthetic audit cron run', {
      level: 'info',
      tags: { feature: 'byow_whatsapp', event: 'synthetic_audit_run' },
      extra: { ...summary, elapsed_ms: elapsedMs },
    });

    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsedMs,
      summary,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'byow_whatsapp', event: 'synthetic_audit_cron_failure' },
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    );
  }
}
