// lib/services/payments/razorpay/account-vault.ts
//
// PgCrypto-based vault for per-institution Razorpay merchant credentials.
// Mirrors lib/services/integrations/cal-api-key-vault.ts.
//
// Master key env var: RAZORPAY_CREDENTIALS_MASTER_SECRET (32+ byte hex recommended).
// Migration: 20260603130000_razorpay_institution_accounts.sql
//
//   Write → fn_set_razorpay_account(...) → pgp_sym_encrypt(...) stored as bytea
//   Read  → fn_get_razorpay_account / _by_id / _by_webhook_ref → pgp_sym_decrypt(...)
//
// All DB calls use the service-role Supabase client (RLS on razorpay_accounts is
// service_role-only; the RPCs are GRANTed to service_role only).
//
// SECURITY RULES:
//   - NEVER import this file in client components or client bundles.
//   - NEVER log a decrypted keySecret / webhookSecret.
//   - NEVER return keySecret / webhookSecret to the browser (key_id is public).

import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { RazorpayCredentials } from './credentials';

const MASTER_SECRET_ENV = 'RAZORPAY_CREDENTIALS_MASTER_SECRET';

function getMasterSecret(): string {
  const s = process.env[MASTER_SECRET_ENV];
  if (!s || s.trim().length === 0) {
    throw new Error(
      `[razorpay-account-vault] ${MASTER_SECRET_ENV} env var is not set. ` +
        'Configure it in Vercel (production + preview) before any per-institution Razorpay call.',
    );
  }
  return s;
}

function toMode(raw: string | null | undefined): 'test' | 'live' {
  return raw === 'test' ? 'test' : 'live';
}

export type RazorpayAccountStatus = 'draft' | 'active' | 'inactive';

export interface RazorpayAccountSummary {
  id: string;
  /** null = GLOBAL account (common to all institutions for its fee head). */
  institutionId: string | null;
  /** null for a draft (keys not added yet). */
  keyId: string | null;
  accountLabel: string | null;
  mode: 'test' | 'live';
  isActive: boolean;
  /** null for a draft (webhook URL only exists once activated). */
  webhookRef: string | null;
  createdAt: string;
  /** billing_categories.kind this account settles; null = institution default. */
  feeHead: string | null;
  /** HDFC reconciliation references (no secrets). */
  mid: string | null;
  tid: string | null;
  dbaName: string | null;
  /** draft = staged, no keys yet; active = routing; inactive = rotated/deactivated. */
  status: RazorpayAccountStatus;
}

export interface CreateRazorpayDraftInput {
  /** null = GLOBAL account; a global draft must target a specific fee head. */
  institutionId: string | null;
  feeHead?: string | null;
  label?: string | null;
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
  mode?: 'test' | 'live';
  actor?: string | null;
}

export interface ActivateRazorpayAccountInput {
  accountId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  webhookRef?: string | null;
  actor?: string | null;
}

export interface UpdateRazorpayMetaInput {
  accountId: string;
  label?: string | null;
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
  mode?: 'test' | 'live';
  /** Slot (institution/fee-head) is changed only when changeSlot=true AND the row is a draft. */
  institutionId?: string | null;
  feeHead?: string | null;
  changeSlot?: boolean;
  actor?: string | null;
}

export interface SetRazorpayAccountInput {
  /** null = GLOBAL account; a global account must target a specific fee head. */
  institutionId: string | null;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  label?: string | null;
  mode?: 'test' | 'live';
  /** Optional fixed webhook_ref; omit to auto-generate. */
  webhookRef?: string | null;
  actor?: string | null;
  /** Fee head (billing_categories.kind) this account settles; null/omit = institution default. */
  feeHead?: string | null;
  /** HDFC reconciliation references. */
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
}

export class RazorpayAccountVault {
  /**
   * True when RAZORPAY_CREDENTIALS_MASTER_SECRET is configured. When false, the
   * per-institution vault is unavailable — no per-institution accounts can have
   * been written — so callers should fall back to the common env account instead
   * of invoking a vault method (which would throw on the missing master secret).
   */
  static isConfigured(): boolean {
    const s = process.env[MASTER_SECRET_ENV];
    return !!s && s.trim().length > 0;
  }

  /**
   * Active account credentials for an institution + fee head, or null if none.
   * Resolves the most specific active account: exact fee_head -> institution
   * default (fee_head NULL). A null/omitted feeHead returns only the default.
   */
  static async getForInstitution(
    institutionId: string,
    feeHead?: string | null,
  ): Promise<RazorpayCredentials | null> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_get_razorpay_account', {
      p_institution_id: institutionId,
      p_master_secret: getMasterSecret(),
      p_fee_head: feeHead ?? null,
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_get_razorpay_account failed for institution ${institutionId}: ${error.message}`,
      );
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    if (!row) return null;
    return {
      keyId: row.key_id,
      keySecret: row.key_secret,
      webhookSecret: row.webhook_secret,
      mode: toMode(row.mode),
      source: 'institution',
      accountId: row.id,
      institutionId,
      webhookRef: row.webhook_ref,
    };
  }

  /**
   * Active GLOBAL account credentials for a fee head (institution-agnostic), or null.
   * Used by the admin Test action to validate a global account's keys — the normal
   * router (getForInstitution) needs an institution and won't resolve a pure-global slot.
   */
  static async getGlobal(feeHead: string): Promise<RazorpayCredentials | null> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_get_razorpay_account_global', {
      p_master_secret: getMasterSecret(),
      p_fee_head: feeHead,
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_get_razorpay_account_global failed for feeHead ${feeHead}: ${error.message}`,
      );
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    if (!row) return null;
    return {
      keyId: row.key_id,
      keySecret: row.key_secret,
      webhookSecret: row.webhook_secret,
      mode: toMode(row.mode),
      source: 'institution',
      accountId: row.id,
      webhookRef: row.webhook_ref,
    };
  }

  /** Credentials for a specific account row (incl. deactivated) — pinned-account resolution. */
  static async getById(accountId: string): Promise<RazorpayCredentials | null> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_get_razorpay_account_by_id', {
      p_account_id: accountId,
      p_master_secret: getMasterSecret(),
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_get_razorpay_account_by_id failed for ${accountId}: ${error.message}`,
      );
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    if (!row) return null;
    return {
      keyId: row.key_id,
      keySecret: row.key_secret,
      webhookSecret: row.webhook_secret,
      mode: toMode(row.mode),
      source: 'institution',
      accountId: row.id,
      webhookRef: row.webhook_ref,
    };
  }

  /**
   * Resolve the webhook secret for an incoming webhook by its URL-path ref.
   * Ignores is_active so in-flight payments on a rotated-out account still verify.
   */
  static async getByWebhookRef(
    webhookRef: string,
  ): Promise<{ accountId: string; institutionId: string; webhookSecret: string } | null> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_get_razorpay_account_by_webhook_ref', {
      p_webhook_ref: webhookRef,
      p_master_secret: getMasterSecret(),
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_get_razorpay_account_by_webhook_ref failed: ${error.message}`,
      );
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    if (!row) return null;
    return {
      accountId: row.id,
      institutionId: row.institution_id,
      webhookSecret: row.webhook_secret,
    };
  }

  /** Create (or rotate) an institution's active account. Returns id + webhook_ref. */
  static async set(input: SetRazorpayAccountInput): Promise<{ id: string; webhookRef: string }> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_set_razorpay_account', {
      p_institution_id: input.institutionId ?? null,
      p_key_id: input.keyId,
      p_key_secret: input.keySecret,
      p_webhook_secret: input.webhookSecret,
      p_label: input.label ?? null,
      p_mode: input.mode ?? 'live',
      p_webhook_ref: input.webhookRef ?? null,
      p_master_secret: getMasterSecret(),
      p_actor: input.actor ?? null,
      p_fee_head: input.feeHead ?? null,
      p_mid: input.mid ?? null,
      p_tid: input.tid ?? null,
      p_dba_name: input.dbaName ?? null,
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_set_razorpay_account failed for institution ${input.institutionId}: ${error.message}`,
      );
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    if (!row) {
      throw new Error('[razorpay-account-vault] fn_set_razorpay_account returned no row');
    }
    return { id: row.id, webhookRef: row.webhook_ref };
  }

  /** List all accounts WITHOUT secrets (audit / admin UI). */
  static async list(): Promise<RazorpayAccountSummary[]> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_list_razorpay_accounts');
    if (error) {
      throw new Error(`[razorpay-account-vault] fn_list_razorpay_accounts failed: ${error.message}`);
    }
    return ((data as Array<Record<string, any>> | null) ?? []).map((row) => ({
      id: row.id,
      institutionId: row.institution_id,
      keyId: row.key_id,
      accountLabel: row.account_label,
      mode: toMode(row.mode),
      isActive: row.is_active,
      webhookRef: row.webhook_ref ?? null,
      createdAt: row.created_at,
      feeHead: row.fee_head ?? null,
      mid: row.mid ?? null,
      tid: row.tid ?? null,
      dbaName: row.dba_name ?? null,
      status: (row.status ??
        (row.key_id ? (row.is_active ? 'active' : 'inactive') : 'draft')) as RazorpayAccountStatus,
    }));
  }

  /**
   * Deactivate a SPECIFIC account by id (idempotent). Preferred over the
   * institution-wide deactivate now that an institution may hold several
   * accounts (one per fee head) — deactivating "the institution" is ambiguous.
   */
  static async deactivateById(accountId: string, actor?: string | null): Promise<void> {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc('fn_deactivate_razorpay_account_by_id', {
      p_account_id: accountId,
      p_actor: actor ?? null,
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_deactivate_razorpay_account_by_id failed for ${accountId}: ${error.message}`,
      );
    }
  }

  /** Deactivate an institution's active DEFAULT account (legacy; idempotent). */
  static async deactivate(institutionId: string, actor?: string | null): Promise<void> {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc('fn_deactivate_razorpay_account', {
      p_institution_id: institutionId,
      p_actor: actor ?? null,
    });
    if (error) {
      throw new Error(
        `[razorpay-account-vault] fn_deactivate_razorpay_account failed for ${institutionId}: ${error.message}`,
      );
    }
  }

  /**
   * Create (or update) a DRAFT account for an (institution, fee_head) slot — no
   * keys. A draft is inert (the resolver skips key_id IS NULL rows) so the
   * institution keeps using the env fallback until the draft is activated.
   * Does NOT require the master secret (nothing to encrypt yet).
   */
  static async createDraft(input: CreateRazorpayDraftInput): Promise<{ id: string }> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_create_razorpay_draft', {
      p_institution_id: input.institutionId,
      p_fee_head: input.feeHead ?? null,
      p_label: input.label ?? null,
      p_mid: input.mid ?? null,
      p_tid: input.tid ?? null,
      p_dba_name: input.dbaName ?? null,
      p_mode: input.mode ?? 'live',
      p_actor: input.actor ?? null,
    });
    if (error) {
      throw new Error(`[razorpay-account-vault] fn_create_razorpay_draft failed: ${error.message}`);
    }
    return { id: data as unknown as string };
  }

  /**
   * Activate a draft (or rotate a row in place) by adding encrypted keys. Returns
   * the webhook_ref to paste into the account's Razorpay dashboard. Deactivates any
   * other active account in the same (institution, fee_head) slot.
   */
  static async activate(input: ActivateRazorpayAccountInput): Promise<{ id: string; webhookRef: string }> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_activate_razorpay_account', {
      p_account_id: input.accountId,
      p_key_id: input.keyId,
      p_key_secret: input.keySecret,
      p_webhook_secret: input.webhookSecret,
      p_master_secret: getMasterSecret(),
      p_webhook_ref: input.webhookRef ?? null,
      p_actor: input.actor ?? null,
    });
    if (error) {
      throw new Error(`[razorpay-account-vault] fn_activate_razorpay_account failed for ${input.accountId}: ${error.message}`);
    }
    const row = (data as Array<Record<string, any>> | null)?.[0];
    if (!row) {
      throw new Error('[razorpay-account-vault] fn_activate_razorpay_account returned no row');
    }
    return { id: row.id, webhookRef: row.webhook_ref };
  }

  /**
   * Edit reconciliation/display metadata (label/MID/TID/DBA/mode). The routing slot
   * (institution/fee-head) changes only when changeSlot=true AND the row is a draft.
   */
  static async updateMeta(input: UpdateRazorpayMetaInput): Promise<void> {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc('fn_update_razorpay_account_meta', {
      p_account_id: input.accountId,
      p_label: input.label ?? null,
      p_mid: input.mid ?? null,
      p_tid: input.tid ?? null,
      p_dba_name: input.dbaName ?? null,
      p_mode: input.mode ?? null,
      p_institution_id: input.institutionId ?? null,
      p_fee_head: input.feeHead ?? null,
      p_change_slot: input.changeSlot ?? false,
      p_actor: input.actor ?? null,
    });
    if (error) {
      throw new Error(`[razorpay-account-vault] fn_update_razorpay_account_meta failed for ${input.accountId}: ${error.message}`);
    }
  }

  /** Hard-delete an account (blocked by the RPC when transactions pin it). */
  static async deleteById(accountId: string, actor?: string | null): Promise<void> {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc('fn_delete_razorpay_account_by_id', {
      p_account_id: accountId,
      p_actor: actor ?? null,
    });
    if (error) {
      throw new Error(`[razorpay-account-vault] fn_delete_razorpay_account_by_id failed for ${accountId}: ${error.message}`);
    }
  }
}
