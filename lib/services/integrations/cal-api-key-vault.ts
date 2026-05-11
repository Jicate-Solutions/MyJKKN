/**
 * cal-api-key-vault.ts
 *
 * PgCrypto-based vault for per-user Cal.com v2 API keys.
 *
 * Master key lives in env var CAL_API_KEY_MASTER_SECRET (32+ byte hex recommended).
 * Migration: 20260503000003_add_cal_api_key_to_profiles.sql
 *
 * Encryption pattern:
 *   Write → fn_set_cal_api_key(user_id, cal_user_id, plaintext, master_secret)
 *           → pgp_sym_encrypt(plaintext, master_secret) stored as bytea
 *   Read  → fn_get_cal_api_key(user_id, master_secret)
 *           → pgp_sym_decrypt(encrypted, master_secret) returned as text
 *   Clear → fn_clear_cal_api_key(user_id)
 *           → NULL-out both columns
 *
 * All DB calls use the service-role Supabase client (bypasses RLS).
 * The master secret is passed over the Postgres TLS wire (server-side only).
 *
 * SECURITY RULES:
 *   - NEVER import this file in client components or client bundles.
 *   - NEVER log the decrypted cal_api_key value.
 *   - NEVER return StoredCalKey.cal_api_key to the browser.
 *   - This file is server-side only (Route Handlers / Server Actions).
 */

// Server-only guard — crashes the build if accidentally bundled client-side.
import 'server-only';

import { createAdminClient } from '@/lib/supabase/client';

const MASTER_SECRET_ENV = 'CAL_API_KEY_MASTER_SECRET';

function getMasterSecret(): string {
  const s = process.env[MASTER_SECRET_ENV];
  if (!s || s.trim().length === 0) {
    throw new Error(
      `[cal-api-key-vault] ${MASTER_SECRET_ENV} env var is not set. ` +
        'Configure it in Vercel (production + preview) before any Cal.com API call.'
    );
  }
  return s;
}

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

export interface StoredCalKey {
  /** Cal.com numeric User.id on jicate-booking-prod. */
  cal_user_id: number;
  /**
   * Decrypted plaintext Cal.com v2 API key (e.g. `cal_live_xxxx`).
   * NEVER log this. NEVER send to client.
   */
  cal_api_key: string;
}

// ─────────────────────────────────────────────
// Vault
// ─────────────────────────────────────────────

export class CalApiKeyVault {
  /**
   * Decrypt and return the user's Cal.com API key + their Cal.com User.id.
   *
   * Returns `null` if the user has no Cal.com identity yet (not yet provisioned).
   *
   * @param myjkknUserId  UUID from public.profiles.id (Supabase auth user id)
   */
  static async get(myjkknUserId: string): Promise<StoredCalKey | null> {
    const supabase = createAdminClient();
    const masterSecret = getMasterSecret();

    const { data, error } = await supabase.rpc('fn_get_cal_api_key', {
      p_user_id: myjkknUserId,
      p_master_secret: masterSecret,
    });

    if (error) {
      throw new Error(
        `[cal-api-key-vault] fn_get_cal_api_key failed for user ${myjkknUserId}: ${error.message}`
      );
    }

    // fn_get_cal_api_key returns 0 rows when user is not provisioned
    const rows = data as Array<{ cal_user_id: number; cal_api_key: string }> | null;
    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    if (row.cal_api_key == null) {
      // Row exists (cal_user_id set) but key column is NULL — treat as not provisioned
      return null;
    }

    return {
      cal_user_id: row.cal_user_id,
      cal_api_key: row.cal_api_key,
    };
  }

  /**
   * Encrypt and store the user's Cal.com API key + their Cal.com User.id.
   *
   * Idempotent: calling again with a new key overwrites the previous value.
   *
   * @param myjkknUserId  UUID from public.profiles.id
   * @param calUserId     Cal.com numeric User.id
   * @param calApiKey     Plaintext API key (e.g. `cal_live_xxxx`)
   */
  static async set(
    myjkknUserId: string,
    calUserId: number,
    calApiKey: string
  ): Promise<void> {
    const supabase = createAdminClient();
    const masterSecret = getMasterSecret();

    const { error } = await supabase.rpc('fn_set_cal_api_key', {
      p_user_id: myjkknUserId,
      p_cal_user_id: calUserId,
      p_api_key: calApiKey,
      p_master_secret: masterSecret,
    });

    if (error) {
      throw new Error(
        `[cal-api-key-vault] fn_set_cal_api_key failed for user ${myjkknUserId}: ${error.message}`
      );
    }
  }

  /**
   * Null-out the user's Cal.com identity (e.g., user requested disconnection,
   * or re-provisioning requires a clean slate).
   *
   * Idempotent: safe to call even if columns are already NULL.
   *
   * @param myjkknUserId  UUID from public.profiles.id
   */
  static async clear(myjkknUserId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc('fn_clear_cal_api_key', {
      p_user_id: myjkknUserId,
    });

    if (error) {
      throw new Error(
        `[cal-api-key-vault] fn_clear_cal_api_key failed for user ${myjkknUserId}: ${error.message}`
      );
    }
  }

  /**
   * Check whether a user has a Cal.com identity without decrypting the key.
   * Cheaper than `get()` — no decryption, just a column null-check.
   *
   * @param myjkknUserId  UUID from public.profiles.id
   */
  static async isProvisioned(myjkknUserId: string): Promise<boolean> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('cal_user_id')
      .eq('id', myjkknUserId)
      .single();

    if (error) {
      throw new Error(
        `[cal-api-key-vault] isProvisioned check failed for user ${myjkknUserId}: ${error.message}`
      );
    }

    return data?.cal_user_id != null;
  }
}
