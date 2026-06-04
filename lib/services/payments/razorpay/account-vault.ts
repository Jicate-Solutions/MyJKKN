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

export interface RazorpayAccountSummary {
  id: string;
  institutionId: string;
  keyId: string;
  accountLabel: string | null;
  mode: 'test' | 'live';
  isActive: boolean;
  webhookRef: string;
  createdAt: string;
}

export interface SetRazorpayAccountInput {
  institutionId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  label?: string | null;
  mode?: 'test' | 'live';
  /** Optional fixed webhook_ref; omit to auto-generate. */
  webhookRef?: string | null;
  actor?: string | null;
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

  /** Active account credentials for an institution, or null if none configured. */
  static async getForInstitution(institutionId: string): Promise<RazorpayCredentials | null> {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_get_razorpay_account', {
      p_institution_id: institutionId,
      p_master_secret: getMasterSecret(),
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
      p_institution_id: input.institutionId,
      p_key_id: input.keyId,
      p_key_secret: input.keySecret,
      p_webhook_secret: input.webhookSecret,
      p_label: input.label ?? null,
      p_mode: input.mode ?? 'live',
      p_webhook_ref: input.webhookRef ?? null,
      p_master_secret: getMasterSecret(),
      p_actor: input.actor ?? null,
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
      webhookRef: row.webhook_ref,
      createdAt: row.created_at,
    }));
  }

  /** Deactivate an institution's active account (idempotent). */
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
}
