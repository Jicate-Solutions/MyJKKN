// lib/services/ims/pos-device-admin-service.ts
//
// Administration of IMS counter payment terminals (ims_pos_devices): register a
// Razorpay POS DQR soundbox against a selling counter, save its Ezetap
// credentials, switch it on and off, and send a ₹1 test.
//
// The table is service_role-only (it holds an encrypted appKey), so RLS cannot
// scope anything here. Every call therefore does the scoping itself, BEFORE the
// service-role write:
//   1. the route has already checked ims.settings.pos_devices.manage (withAuth);
//   2. scopeFor() resolves which institutions the caller may touch — all for a
//      super admin, else ims_accessible_institution_ids() (the same set every
//      ims_* RLS policy uses);
//   3. the device / store being touched must sit inside that set, else 404.
//
// Credentials never come back out: rows carry `hasCredentials` only.

import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { errorMessage } from '@/lib/utils/supabase-error';
import type { Paise } from '@/lib/services/payments/amount';
import { EzetapApiError } from '@/lib/services/payments/ezetap/client';
import { PosDeviceVault, type PosDeviceSummary } from '@/lib/services/payments/ezetap/device-vault';
import { getPosDeviceProvider } from '@/lib/services/payments/ezetap/ezetap-pos-provider';
import type {
  ImsPosDeviceListResponse,
  ImsPosDeviceMetaInput,
  ImsPosDeviceRow,
  ImsPosDeviceStoreOption,
  ImsPosDeviceTestResult,
} from '@/types/ims/pos-devices';

/** An error with the HTTP status and the sentence the admin should read. */
export class PosDeviceAdminError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'PosDeviceAdminError';
  }
}

export interface PosDeviceAdminCaller {
  userId: string;
  /** The caller's own (RLS) client — used only to ask who they are. */
  supabase: any;
}

const TEST_AMOUNT_PAISE = 100 as Paise;

const KINDS = ['razorpay_pos_soundbox', 'ezetap_android'] as const;
const ENVIRONMENTS = ['demo', 'live'] as const;

// ─── Scope ───────────────────────────────────────────────────────────────────

/** null = every institution (super admin). */
async function scopeFor(caller: PosDeviceAdminCaller): Promise<string[] | null> {
  const { data: isSA } = await caller.supabase.rpc('is_super_admin');
  if (isSA === true) return null;

  const { data, error } = await caller.supabase.rpc('ims_accessible_institution_ids');
  if (error) throw new PosDeviceAdminError(500, errorMessage(error, 'Could not resolve your institutions'));
  // SETOF uuid: PostgREST returns bare values, but tolerate row objects too.
  return ((data ?? []) as unknown[])
    .map((v) => (typeof v === 'string' ? v : (v as Record<string, string>)?.ims_accessible_institution_ids))
    .filter((v): v is string => !!v);
}

function inScope(scope: string[] | null, institutionId: string): boolean {
  return scope === null || scope.includes(institutionId);
}

async function loadScoped(caller: PosDeviceAdminCaller, deviceId: string): Promise<PosDeviceSummary> {
  const [scope, device] = await Promise.all([scopeFor(caller), PosDeviceVault.getSummary(deviceId)]);
  // Out-of-scope is reported as missing: no confirming that another college's terminal exists.
  if (!device || !inScope(scope, device.institutionId)) {
    throw new PosDeviceAdminError(404, 'Payment terminal not found');
  }
  return device;
}

async function loadScopedPosStore(caller: PosDeviceAdminCaller, storeId: string) {
  const scope = await scopeFor(caller);
  const service = createServiceRoleClient() as any;
  const { data, error } = await service
    .from('ims_stores')
    .select('id, institution_id, is_pos_store, is_active')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw new PosDeviceAdminError(500, errorMessage(error, 'Could not read the store'));
  if (!data || !data.institution_id || !inScope(scope, data.institution_id)) {
    throw new PosDeviceAdminError(404, 'Store not found');
  }
  if (!data.is_pos_store) {
    throw new PosDeviceAdminError(
      400,
      'That store has no selling counter. Turn on "Has a selling counter (POS)" in Settings · Stores first.',
    );
  }
  return data as { id: string; institution_id: string };
}

/** A sale is waiting on the terminal right now. */
async function hasOpenPush(deviceId: string): Promise<boolean> {
  const service = createServiceRoleClient() as any;
  const { count, error } = await service
    .from('ims_gateway_payments')
    .select('id', { count: 'exact', head: true })
    .eq('pos_device_id', deviceId)
    .eq('status', 'initiated');
  if (error) throw new PosDeviceAdminError(500, errorMessage(error, 'Could not check the terminal for open payments'));
  return (count ?? 0) > 0;
}

// ─── Error mapping ───────────────────────────────────────────────────────────

function mapWriteError(error: unknown, fallback: string): PosDeviceAdminError {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = String(e.message ?? '');
  if (e.code === '23505') {
    if (msg.includes('uq_ims_pos_devices_active_store')) {
      return new PosDeviceAdminError(409, 'This store already has an active terminal. Deactivate that one first.');
    }
    if (msg.includes('uq_ims_pos_devices_active_serial')) {
      return new PosDeviceAdminError(409, 'That serial is already active on another store. Deactivate it there first.');
    }
  }
  if (e.code === '23503') {
    return new PosDeviceAdminError(
      409,
      'This terminal has payments recorded against it — deactivate it instead.',
    );
  }
  if (e.code === '23514' && msg.includes('ims_pos_devices_active_needs_creds')) {
    return new PosDeviceAdminError(400, 'Save the terminal username and app key before activating it.');
  }
  return new PosDeviceAdminError(500, errorMessage(error, fallback));
}

// ─── Input validation ────────────────────────────────────────────────────────

function cleanMeta(input: Partial<ImsPosDeviceMetaInput> | null | undefined): ImsPosDeviceMetaInput {
  const storeId = String(input?.storeId ?? '').trim();
  const label = String(input?.label ?? '').trim();
  const serial = String(input?.serial ?? '').trim();
  const kind = (input?.kind ?? 'razorpay_pos_soundbox') as ImsPosDeviceMetaInput['kind'];
  const environment = (input?.environment ?? 'demo') as ImsPosDeviceMetaInput['environment'];
  const accountLabel = String(input?.accountLabel ?? '').trim() || null;

  if (!storeId) throw new PosDeviceAdminError(400, 'Choose the store this terminal sits on.');
  if (!label || label.length > 80) throw new PosDeviceAdminError(400, 'Enter a label of up to 80 characters.');
  if (!serial || serial.length > 64) throw new PosDeviceAdminError(400, 'Enter the serial number printed on the device.');
  // Ezetap addresses the device as "<serial>|<kind>"; a pipe in the serial would break that.
  if (/[|\s]/.test(serial)) throw new PosDeviceAdminError(400, 'The serial cannot contain spaces or "|".');
  if (!KINDS.includes(kind)) throw new PosDeviceAdminError(400, 'Unknown device type.');
  if (!ENVIRONMENTS.includes(environment)) throw new PosDeviceAdminError(400, 'Environment must be Demo or Live.');
  if (accountLabel && accountLabel.length > 80) throw new PosDeviceAdminError(400, 'Account label is too long.');

  return { storeId, label, serial, kind, accountLabel, environment };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listPosDevices(caller: PosDeviceAdminCaller): Promise<ImsPosDeviceListResponse> {
  const scope = await scopeFor(caller);
  if (scope !== null && scope.length === 0) {
    return { devices: [], stores: [], vaultConfigured: PosDeviceVault.isConfigured() };
  }

  const service = createServiceRoleClient() as any;
  let storeQ = service
    .from('ims_stores')
    .select('id, name, code, institution_id, institution_name, is_pos_store, is_active')
    .order('name');
  if (scope) storeQ = storeQ.in('institution_id', scope);

  const [devices, storesRes] = await Promise.all([
    PosDeviceVault.list({ institutionIds: scope }),
    storeQ,
  ]);
  if (storesRes.error) throw new PosDeviceAdminError(500, errorMessage(storesRes.error, 'Could not list stores'));

  const allStores = (storesRes.data ?? []) as Array<{
    id: string;
    name: string;
    code: string | null;
    institution_id: string;
    institution_name: string | null;
    is_pos_store: boolean;
    is_active: boolean;
  }>;
  const byId = new Map(allStores.map((s) => [s.id, s]));

  const rows: ImsPosDeviceRow[] = devices.map((d) => {
    const s = byId.get(d.storeId);
    return {
      ...d,
      storeName: s?.name ?? null,
      storeCode: s?.code ?? null,
      institutionName: s?.institution_name ?? null,
    };
  });

  const stores: ImsPosDeviceStoreOption[] = allStores
    .filter((s) => s.is_pos_store && s.is_active && s.institution_id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      institutionId: s.institution_id,
      institutionName: s.institution_name,
    }));

  return { devices: rows, stores, vaultConfigured: PosDeviceVault.isConfigured() };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/** Registered switched OFF: it cannot take a sale until it has credentials and is activated. */
export async function createPosDevice(
  caller: PosDeviceAdminCaller,
  input: Partial<ImsPosDeviceMetaInput>,
): Promise<{ id: string }> {
  const meta = cleanMeta(input);
  const store = await loadScopedPosStore(caller, meta.storeId);

  const service = createServiceRoleClient() as any;
  const { data, error } = await service
    .from('ims_pos_devices')
    .insert({
      // Overwritten by trg_ims_pos_devices_sync_institution; passed so the row is valid as sent.
      institution_id: store.institution_id,
      store_id: meta.storeId,
      device_label: meta.label,
      device_serial: meta.serial,
      device_kind: meta.kind,
      account_label: meta.accountLabel,
      environment: meta.environment,
      is_active: false,
      created_by: caller.userId,
      updated_by: caller.userId,
    })
    .select('id')
    .single();
  if (error) throw mapWriteError(error, 'Could not register the terminal');
  return { id: data.id };
}

export async function updatePosDeviceMeta(
  caller: PosDeviceAdminCaller,
  deviceId: string,
  input: Partial<ImsPosDeviceMetaInput>,
): Promise<void> {
  const device = await loadScoped(caller, deviceId);
  const meta = cleanMeta(input);

  // Store, serial, type and environment decide WHERE a push goes and which Ezetap
  // host a pending payment is polled on. Changing them under an active terminal
  // (or an open sale) would strand that payment, so it must be switched off first.
  const identityChanged =
    meta.storeId !== device.storeId ||
    meta.serial !== device.serial ||
    meta.kind !== device.kind ||
    meta.environment !== device.environment;
  if (identityChanged) {
    if (device.isActive) {
      throw new PosDeviceAdminError(
        409,
        'Deactivate the terminal before changing its store, serial, type or environment.',
      );
    }
    if (await hasOpenPush(deviceId)) {
      throw new PosDeviceAdminError(409, 'A sale is still waiting on this terminal. Finish or cancel it first.');
    }
  }
  if (meta.storeId !== device.storeId) await loadScopedPosStore(caller, meta.storeId);

  const patch: Record<string, unknown> = {
    store_id: meta.storeId,
    device_label: meta.label,
    device_serial: meta.serial,
    device_kind: meta.kind,
    account_label: meta.accountLabel,
    environment: meta.environment,
    updated_by: caller.userId,
    updated_at: new Date().toISOString(),
  };
  // Demo and production issue different appKeys. Keeping the old one across the
  // switch would let a terminal be activated with a key the new host rejects.
  if (meta.environment !== device.environment) {
    patch.username = null;
    patch.app_key_encrypted = null;
  }

  const service = createServiceRoleClient() as any;
  const { error } = await service.from('ims_pos_devices').update(patch).eq('id', deviceId);
  if (error) throw mapWriteError(error, 'Could not update the terminal');
}

export async function setPosDeviceCredentials(
  caller: PosDeviceAdminCaller,
  deviceId: string,
  input: { username?: unknown; appKey?: unknown },
): Promise<void> {
  assertVaultConfigured();
  await loadScoped(caller, deviceId);

  const username = String(input?.username ?? '').trim();
  const appKey = String(input?.appKey ?? '').trim();
  if (!username || !appKey) throw new PosDeviceAdminError(400, 'Enter both the username and the app key.');
  if (username.length > 120 || appKey.length > 500) throw new PosDeviceAdminError(400, 'Username or app key is too long.');

  try {
    await PosDeviceVault.setCredentials({ deviceId, username, appKey, actor: caller.userId });
  } catch (e) {
    throw new PosDeviceAdminError(500, errorMessage(e, 'Could not save the terminal credentials'));
  }
}

export async function setPosDeviceActive(
  caller: PosDeviceAdminCaller,
  deviceId: string,
  active: boolean,
): Promise<void> {
  const device = await loadScoped(caller, deviceId);
  if (active && !device.hasCredentials) {
    throw new PosDeviceAdminError(400, 'Save the terminal username and app key before activating it.');
  }
  if (active) await loadScopedPosStore(caller, device.storeId);

  const service = createServiceRoleClient() as any;
  const { error } = await service
    .from('ims_pos_devices')
    .update({ is_active: active, updated_by: caller.userId, updated_at: new Date().toISOString() })
    .eq('id', deviceId);
  if (error) throw mapWriteError(error, active ? 'Could not activate the terminal' : 'Could not deactivate the terminal');
}

/** Fails (FK, ON DELETE RESTRICT) once any payment names the terminal — deactivate instead. */
export async function deletePosDevice(caller: PosDeviceAdminCaller, deviceId: string): Promise<void> {
  await loadScoped(caller, deviceId);
  const service = createServiceRoleClient() as any;
  const { error } = await service.from('ims_pos_devices').delete().eq('id', deviceId);
  if (error) throw mapWriteError(error, 'Could not delete the terminal');
}

// ─── Test ────────────────────────────────────────────────────────────────────

/**
 * Push ₹1.00 to the terminal and withdraw it straight away. Proves serial,
 * credentials, environment and network in one go without booking anything —
 * no ims_gateway_payments row is written.
 *
 * On a LIVE terminal the QR is real: a customer who scans before the cancel
 * lands pays a real rupee. Refused unless the caller confirms that.
 */
export async function testPosDevice(
  caller: PosDeviceAdminCaller,
  deviceId: string,
  opts: { confirmLive?: boolean } = {},
): Promise<ImsPosDeviceTestResult> {
  assertVaultConfigured();
  const device = await loadScoped(caller, deviceId);

  if (!device.hasCredentials) {
    throw new PosDeviceAdminError(400, 'Save the terminal username and app key before testing it.');
  }
  if (device.environment === 'live' && opts.confirmLive !== true) {
    throw new PosDeviceAdminError(
      409,
      'This is a LIVE terminal: the test QR can take a real ₹1. Confirm to send it.',
      'confirm_live',
    );
  }
  // The DB guard against a second push (uq_ims_pos_device_inflight) only sees
  // payment rows; a test writes none, so check here instead of interrupting a sale.
  if (await hasOpenPush(deviceId)) {
    throw new PosDeviceAdminError(409, 'A sale is waiting on this terminal right now. Test it once the counter is free.');
  }

  // No purpose:'push' — a test must work before activation, and a DEMO terminal
  // is exactly what an admin tests in production.
  let provider;
  try {
    provider = await getPosDeviceProvider(deviceId);
  } catch (e) {
    return { ok: false, code: null, message: errorMessage(e, 'Could not load the terminal') };
  }

  let p2pRequestId: string;
  try {
    ({ p2pRequestId } = await provider.push({
      externalRef: `IMSDQR-TEST-${Date.now()}`,
      amountPaise: TEST_AMOUNT_PAISE,
      description: 'MyJKKN terminal test',
    }));
  } catch (e) {
    const code = e instanceof EzetapApiError ? e.code : null;
    const message = errorMessage(e, 'The terminal did not accept the test');
    await PosDeviceVault.recordHealth(deviceId, { ok: false, code, message });
    return { ok: false, code, message: `${device.label}: ${message}${code ? ` (${code})` : ''}` };
  }

  await PosDeviceVault.recordHealth(deviceId, { ok: true });

  try {
    const cancel = await provider.cancel(p2pRequestId);
    if (cancel.cancelled) {
      return {
        ok: true,
        p2pRequestId,
        cancelled: true,
        message: `${device.label} received the ₹1.00 test and it was withdrawn. The terminal is reachable.`,
      };
    }
    if (cancel.reason === 'payment_initiated') {
      return {
        ok: true,
        p2pRequestId,
        cancelled: false,
        code: cancel.code,
        message:
          `${device.label} received the ₹1.00 test, but someone had already started paying it, so it could not be withdrawn.` +
          (device.environment === 'live' ? ' That rupee is real; it will appear in the Razorpay POS portal.' : ''),
      };
    }
    return {
      ok: true,
      p2pRequestId,
      cancelled: false,
      code: cancel.code,
      message: `${device.label} received the ₹1.00 test, but withdrawing it failed (${cancel.message}). Clear it on the terminal.`,
    };
  } catch (e) {
    return {
      ok: true,
      p2pRequestId,
      cancelled: false,
      message: `${device.label} received the ₹1.00 test, but withdrawing it failed (${errorMessage(e, 'no answer')}). Clear it on the terminal.`,
    };
  }
}

function assertVaultConfigured() {
  if (!PosDeviceVault.isConfigured()) {
    throw new PosDeviceAdminError(
      503,
      'Payment terminal credentials are not available: RAZORPAY_CREDENTIALS_MASTER_SECRET is not set on the server.',
      'vault_not_configured',
    );
  }
}
