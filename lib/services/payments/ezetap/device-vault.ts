// lib/services/payments/ezetap/device-vault.ts
//
// Storage for IMS counter terminals (ims_pos_devices) and their Ezetap appKey.
// Migration: 20260921100000_ims_pos_devices.sql
//
//   Write → ims_pos_device_set_credentials → pgp_sym_encrypt(appKey)
//   Read  → ims_pos_device_get_credentials → pgp_sym_decrypt(appKey)
//
// Master secret: RAZORPAY_CREDENTIALS_MASTER_SECRET — the same one the Razorpay
// vault uses. Same vendor, same sensitivity; two secrets would only be two things
// to rotate and get out of step.
//
// SECURITY RULES (same as razorpay/account-vault.ts):
//   - NEVER import this from a client component.
//   - NEVER log or return a decrypted appKey. Summaries carry `hasCredentials` only.

import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { EzetapDeviceCredentials, EzetapDeviceKind, EzetapEnvironment } from './types';

const MASTER_SECRET_ENV = 'RAZORPAY_CREDENTIALS_MASTER_SECRET';

function masterSecret(): string {
  const s = process.env[MASTER_SECRET_ENV];
  if (!s || s.trim().length === 0) {
    throw new Error(
      `${MASTER_SECRET_ENV} is not set, so payment terminal credentials cannot be read or saved.`,
    );
  }
  return s;
}

/** Everything about a device that is safe to show an administrator. */
export interface PosDeviceSummary {
  id: string;
  institutionId: string;
  storeId: string;
  label: string;
  serial: string;
  kind: EzetapDeviceKind;
  username: string | null;
  hasCredentials: boolean;
  accountLabel: string | null;
  environment: EzetapEnvironment;
  isActive: boolean;
  lastPushAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Non-secret columns. app_key_encrypted is only ever tested for presence. */
const SUMMARY_COLUMNS =
  'id, institution_id, store_id, device_label, device_serial, device_kind, username, ' +
  'account_label, environment, is_active, last_push_at, last_error_code, ' +
  'last_error_message, last_error_at, created_at, updated_at, has_key:app_key_encrypted';


function toSummary(r: any): PosDeviceSummary {
  return {
    id: r.id,
    institutionId: r.institution_id,
    storeId: r.store_id,
    label: r.device_label,
    serial: r.device_serial,
    kind: r.device_kind,
    username: r.username ?? null,
    hasCredentials: !!r.username && r.has_key !== null && r.has_key !== undefined,
    accountLabel: r.account_label ?? null,
    environment: r.environment === 'live' ? 'live' : 'demo',
    isActive: !!r.is_active,
    lastPushAt: r.last_push_at ?? null,
    lastErrorCode: r.last_error_code ?? null,
    lastErrorMessage: r.last_error_message ?? null,
    lastErrorAt: r.last_error_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PosDeviceVault {
  static isConfigured(): boolean {
    const s = process.env[MASTER_SECRET_ENV];
    return !!s && s.trim().length > 0;
  }

  /** Decrypted credentials for one device, pinned by id. Null if it does not exist. */
  static async getById(deviceId: string): Promise<EzetapDeviceCredentials | null> {
    const service = createServiceRoleClient() as any;
    const { data, error } = await service.rpc('ims_pos_device_get_credentials', {
      p_device_id: deviceId,
      p_master_secret: masterSecret(),
    });
    if (error) throw new Error(`Could not read the payment terminal: ${error.message}`);
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return {
      deviceId: r.id,
      institutionId: r.institution_id,
      storeId: r.store_id,
      label: r.device_label,
      serial: r.device_serial,
      kind: r.device_kind,
      username: r.username ?? '',
      appKey: r.app_key ?? '',
      accountLabel: r.account_label ?? null,
      environment: r.environment === 'live' ? 'live' : 'demo',
      isActive: !!r.is_active,
    };
  }

  /** The store's active terminal (summary only), or null when the counter has none. */
  static async activeSummaryForStore(storeId: string): Promise<PosDeviceSummary | null> {
    const service = createServiceRoleClient() as any;
    const { data, error } = await service
      .from('ims_pos_devices')
      .select(SUMMARY_COLUMNS)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(`Could not read the payment terminal: ${error.message}`);
    return data ? toSummary(data) : null;
  }

  static async list(filter: { institutionIds?: string[] | null } = {}): Promise<PosDeviceSummary[]> {
    const service = createServiceRoleClient() as any;
    let q = service.from('ims_pos_devices').select(SUMMARY_COLUMNS).order('created_at');
    if (filter.institutionIds) q = q.in('institution_id', filter.institutionIds);
    const { data, error } = await q;
    if (error) throw new Error(`Could not list payment terminals: ${error.message}`);
    return (data ?? []).map(toSummary);
  }

  static async getSummary(deviceId: string): Promise<PosDeviceSummary | null> {
    const service = createServiceRoleClient() as any;
    const { data, error } = await service
      .from('ims_pos_devices')
      .select(SUMMARY_COLUMNS)
      .eq('id', deviceId)
      .maybeSingle();
    if (error) throw new Error(`Could not read the payment terminal: ${error.message}`);
    return data ? toSummary(data) : null;
  }

  /** Save or rotate the Ezetap username + appKey. The key is never read back. */
  static async setCredentials(args: {
    deviceId: string;
    username: string;
    appKey: string;
    actor: string | null;
  }): Promise<void> {
    const service = createServiceRoleClient() as any;
    const { error } = await service.rpc('ims_pos_device_set_credentials', {
      p_device_id: args.deviceId,
      p_username: args.username,
      p_app_key: args.appKey,
      p_master_secret: masterSecret(),
      p_actor: args.actor,
    });
    if (error) throw new Error(error.message);
  }

  /**
   * Health, written by the push path. Informational only — a terminal that was
   * offline a minute ago may be online now, so this never blocks a push.
   * Best-effort: a failed health write must not fail a payment.
   */
  static async recordHealth(
    deviceId: string,
    result: { ok: true } | { ok: false; code: string | null; message: string },
  ): Promise<void> {
    const service = createServiceRoleClient() as any;
    const now = new Date().toISOString();
    // `'code' in` rather than `result.ok ?`: strictNullChecks is off in this repo,
    // so a boolean discriminant does not narrow the union.
    const patch = !('code' in result)
      ? { last_push_at: now, last_error_code: null, last_error_message: null, last_error_at: null }
      : { last_error_code: result.code, last_error_message: result.message.slice(0, 500), last_error_at: now };
    await service.from('ims_pos_devices').update(patch).eq('id', deviceId).then(
      () => undefined,
      () => undefined,
    );
  }
}
