// lib/services/whatsapp/whatsapp-connection-pulse.ts
//
// Spec 3 H1.3 + H1.4 — Connection-pulse service.
// Pings each ready connection's Railway /clients/:client_id/status endpoint
// for liveness, computes last_inbound/outbound + 24h counts from
// wa_personal_message_logs, detects stale connections (hours-since-last-activity
// > wa_byow.connection_stale_threshold_hours), upserts wa_byow_connection_health,
// captures Sentry on newly-stale transitions.
//
// Spec: /specs/byow-platform-v2.md §8 (verdict 2026-08-03)

import { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getPolicyInt } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { dispatchByowStaleNotification } from '@/lib/services/notification/byow-notification-service';

interface ConnectionRow {
  id: string;
  department_id: string;
  service_url: string | null;
  client_id: string | null;
  phone_number: string | null;
}

export interface PulseResult {
  connection_id: string;
  pulse_status: 'ok' | 'timeout' | 'error' | 'auth_failed' | 'unknown';
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  inbound_count_24h: number;
  outbound_count_24h: number;
  newly_stale: boolean;
  newly_recovered: boolean;
}

export interface PulseSummary {
  pulsed: number;
  ok: number;
  errored: number;
  newly_stale_count: number;
  newly_recovered_count: number;
  results: PulseResult[];
}

export async function runConnectionPulse(supabase: SupabaseClient): Promise<PulseSummary> {
  const staleThresholdHours = await getPolicyInt(
    POLICY_KEYS.WA_BYOW_CONNECTION_STALE_THRESHOLD_HOURS,
    24
  );
  const probeTimeoutSec = await getPolicyInt(
    POLICY_KEYS.WA_BYOW_HEALTH_PROBE_TIMEOUT_SECONDS,
    10
  );

  // Filter unprocessable rows BEFORE limit per CLAUDE.md cap-policy rule.
  const { data: connections, error: fetchErr } = await supabase
    .from('wa_personal_connections')
    .select('id, department_id, service_url, client_id, phone_number')
    .eq('status', 'ready')
    .not('service_url', 'is', null)
    .not('client_id', 'is', null)
    .limit(100);

  if (fetchErr) throw fetchErr;

  const summary: PulseSummary = {
    pulsed: 0,
    ok: 0,
    errored: 0,
    newly_stale_count: 0,
    newly_recovered_count: 0,
    results: [],
  };

  for (const conn of (connections ?? []) as ConnectionRow[]) {
    summary.pulsed++;
    const result = await pulseOneConnection(
      supabase,
      conn,
      staleThresholdHours,
      probeTimeoutSec
    );
    summary.results.push(result);
    if (result.pulse_status === 'ok') summary.ok++;
    else summary.errored++;
    if (result.newly_stale) summary.newly_stale_count++;
    if (result.newly_recovered) summary.newly_recovered_count++;
  }

  return summary;
}

async function pulseOneConnection(
  supabase: SupabaseClient,
  conn: ConnectionRow,
  staleThresholdHours: number,
  probeTimeoutSec: number
): Promise<PulseResult> {
  // Step 1: Liveness probe against Railway /clients/<client_id>/status.
  const pulseStatus = await probeRailway(conn, probeTimeoutSec);

  // Step 2: Compute last_inbound/outbound + 24h counts from message logs
  // (source of truth — independent of Railway state).
  const cutoff24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [lastInb, lastOut, inb24, out24] = await Promise.all([
    supabase
      .from('wa_personal_message_logs')
      .select('sent_at')
      .eq('connection_id', conn.id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('wa_personal_message_logs')
      .select('sent_at')
      .eq('connection_id', conn.id)
      .eq('direction', 'outbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('wa_personal_message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', conn.id)
      .eq('direction', 'inbound')
      .gte('sent_at', cutoff24h),
    supabase
      .from('wa_personal_message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', conn.id)
      .eq('direction', 'outbound')
      .gte('sent_at', cutoff24h),
  ]);

  const lastInbAt = (lastInb.data?.sent_at as string | undefined) ?? null;
  const lastOutAt = (lastOut.data?.sent_at as string | undefined) ?? null;
  const inb24Count = inb24.count ?? 0;
  const out24Count = out24.count ?? 0;

  // Step 3: Determine staleness from MAX(last_inbound, last_outbound).
  const lastActivityMs = [lastInbAt, lastOutAt]
    .filter((s): s is string => Boolean(s))
    .map((s) => new Date(s).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  const hoursSinceLastActivity =
    lastActivityMs === 0 ? Infinity : (Date.now() - lastActivityMs) / 3_600_000;

  const isStale = hoursSinceLastActivity > staleThresholdHours;

  // Step 4: Read prior health row to detect newly-stale transition (H1.4 guard)
  // and stale→ready recovery transition (H3.1).
  const { data: priorHealth } = await supabase
    .from('wa_byow_connection_health')
    .select('stale_detected_at, consecutive_pulse_failures, recovery_window_started_at')
    .eq('connection_id', conn.id)
    .maybeSingle();

  const wasStale = !!priorHealth?.stale_detected_at;
  const newlyStale = isStale && !wasStale;
  const newlyRecovered = !isStale && wasStale; // H3.1: stale → ready transition
  const priorFails = priorHealth?.consecutive_pulse_failures ?? 0;

  const nowIso = new Date().toISOString();

  // Step 5: Upsert health row with all rolling metrics.
  // H3.1: on stale→ready transition, start a fresh 24h recovery window
  // (reset count to 0). On any other state, preserve the prior window.
  const { error: upsertErr } = await supabase
    .from('wa_byow_connection_health')
    .upsert(
      {
        connection_id: conn.id,
        last_inbound_at: lastInbAt,
        last_outbound_at: lastOutAt,
        last_pulse_at: nowIso,
        inbound_count_24h: inb24Count,
        outbound_count_24h: out24Count,
        consecutive_pulse_failures: pulseStatus === 'ok' ? 0 : priorFails + 1,
        last_pulse_status: pulseStatus,
        stale_detected_at: isStale
          ? priorHealth?.stale_detected_at ?? nowIso
          : null,
        recovery_window_started_at: newlyRecovered
          ? nowIso
          : priorHealth?.recovery_window_started_at ?? null,
        ...(newlyRecovered ? { recovery_inbound_count: 0 } : {}),
        updated_at: nowIso,
      },
      { onConflict: 'connection_id' }
    );

  if (upsertErr) throw upsertErr;

  // Step 6: H1.4 Sentry capture only on newly-stale transitions (no per-iteration
  // duplicates — newlyStale guard prevents Sentry quota burn).
  if (newlyStale) {
    Sentry.captureMessage(
      `BYOW connection stale: dept=${conn.department_id} client=${conn.client_id} hours_since_activity=${hoursSinceLastActivity.toFixed(1)}`,
      {
        level: 'warning',
        tags: { feature: 'byow', subtype: 'stale_connection' },
        extra: {
          connection_id: conn.id,
          last_inbound_at: lastInbAt,
          last_outbound_at: lastOutAt,
          stale_threshold_hours: staleThresholdHours,
        },
      }
    );

    // Step 6b: H4 — dispatch in-app notifications to senior_learner_advisor +
    // hod within the dept's institution. Look up dept name + institution_id,
    // then fan out via byow-notification-service. Wrapped defensively — a
    // notification failure must NOT abort pulse processing for sibling
    // connections. Per-recipient errors are captured inside the dispatcher.
    try {
      const { data: dept, error: deptErr } = await supabase
        .from('departments')
        .select('id, name, institution_id')
        .eq('id', conn.department_id)
        .maybeSingle();

      if (deptErr) {
        Sentry.captureException(deptErr, {
          tags: { feature: 'byow_whatsapp', subtype: 'department_lookup_failure' },
          extra: { connection_id: conn.id, department_id: conn.department_id },
        });
      } else if (dept?.institution_id) {
        await dispatchByowStaleNotification({
          supabase,
          institutionId: dept.institution_id as string,
          departmentId: dept.id as string,
          departmentName: (dept.name as string) ?? 'department',
          phoneNumber: conn.phone_number,
          hoursSinceInbound: hoursSinceLastActivity,
        });
      }
    } catch (e) {
      Sentry.captureException(e, {
        tags: { feature: 'byow_whatsapp', subtype: 'stale_notification_dispatch_failure' },
        extra: { connection_id: conn.id, department_id: conn.department_id },
      });
    }
  }

  return {
    connection_id: conn.id,
    pulse_status: pulseStatus,
    last_inbound_at: lastInbAt,
    last_outbound_at: lastOutAt,
    inbound_count_24h: inb24Count,
    outbound_count_24h: out24Count,
    newly_stale: newlyStale,
    newly_recovered: newlyRecovered,
  };
}

async function probeRailway(
  conn: ConnectionRow,
  probeTimeoutSec: number
): Promise<PulseResult['pulse_status']> {
  const apiKey = process.env.WHATSAPP_PERSONAL_API_KEY;
  if (!apiKey) return 'auth_failed';
  if (!conn.service_url || !conn.client_id) return 'unknown';

  try {
    const url = `${conn.service_url}/clients/${conn.client_id}/status`;
    const resp = await fetch(url, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(probeTimeoutSec * 1000),
    });
    if (resp.ok) {
      const body = (await resp.json()) as { status?: string };
      return body?.status === 'ready' ? 'ok' : 'error';
    }
    if (resp.status === 401 || resp.status === 403) return 'auth_failed';
    return 'error';
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      return 'timeout';
    }
    return 'error';
  }
}
