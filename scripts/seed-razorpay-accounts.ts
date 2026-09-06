/**
 * seed-razorpay-accounts.ts
 *
 * Securely load per-institution Razorpay credentials into the razorpay_accounts
 * table (encrypted via the fn_set_razorpay_account RPC). v1 onboarding tool — a
 * proper admin UI comes later.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed-razorpay-accounts.ts [path/to/seed.json]
 *   tsx --env-file=.env.local scripts/seed-razorpay-accounts.ts --list
 *
 * Default seed file: razorpay-accounts.seed.json at the repo root (gitignored).
 *
 * Seed file shape (array):
 * [
 *   {
 *     "institutionId": "a33138b6-...",     // institutions.id (UUID)
 *     "keyId": "rzp_live_XXXX",            // public key id
 *     "keySecret": "xxxxxxxx",             // Razorpay key secret
 *     "webhookSecret": "whsec_xxxx",       // the secret you set on this account's webhook
 *     "label": "JKKN Arts & Science",      // optional
 *     "mode": "live",                       // optional: "test" | "live" (default "live")
 *     "feeHead": "transport",               // optional: billing_categories.kind this MID settles
 *                                           //   (e.g. transport / university_fee / establishment);
 *                                           //   omit/null = the institution's DEFAULT account
 *     "mid": "T0iE28PvbVFtnj",             // optional: HDFC MID (reconciliation reference)
 *     "tid": "70508977",                    // optional: HDFC TID (reconciliation reference)
 *     "dbaName": "JKKN CLG ... BUS FEE",   // optional: HDFC DBA name (reconciliation reference)
 *     "webhookRef": null                    // optional: omit to auto-generate
 *   }
 * ]
 *
 * One institution may have several entries — one DEFAULT (no feeHead) plus one per
 * fee head. Each (institutionId, feeHead) slot is upserted independently.
 *
 * Required env (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_CREDENTIALS_MASTER_SECRET
 *   NEXT_PUBLIC_APP_URL (optional — used only to print the full webhook URL)
 *
 * Secrets are read from the JSON file (which is gitignored) — never from argv — so
 * they don't land in shell history. Secrets are NEVER printed back.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface SeedEntry {
  institutionId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  label?: string | null;
  mode?: 'test' | 'live';
  feeHead?: string | null;
  mid?: string | null;
  tid?: string | null;
  dbaName?: string | null;
  webhookRef?: string | null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`✖ Missing required env var: ${name}. Add it to .env.local.`);
    process.exit(1);
  }
  return v;
}

function makeClient() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listAccounts() {
  const supabase = makeClient();
  const { data, error } = await supabase.rpc('fn_list_razorpay_accounts');
  if (error) {
    console.error('✖ fn_list_razorpay_accounts failed:', error.message);
    process.exit(1);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://<your-domain>';
  console.log(`\nRazorpay accounts (${data?.length ?? 0}):\n`);
  for (const a of (data as any[]) ?? []) {
    console.log(
      `  • ${a.is_active ? 'ACTIVE  ' : 'inactive'} | ${a.mode.toUpperCase()} | head=${a.fee_head ?? 'default'} | ` +
        `mid=${a.mid ?? '—'} | key_id=${a.key_id} | institution=${a.institution_id} | ${a.account_label ?? '(no label)'}\n` +
        `    webhook: ${appUrl}/api/webhooks/razorpay/${a.webhook_ref}`,
    );
  }
  console.log('');
}

async function seedFromFile(filePath: string) {
  if (!existsSync(filePath)) {
    console.error(
      `✖ Seed file not found: ${filePath}\n\n` +
        'Create it (gitignored) with an array of accounts. See the header of this script for the shape.',
    );
    process.exit(1);
  }

  let entries: SeedEntry[];
  try {
    entries = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`✖ Could not parse ${filePath}:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error('✖ Seed file must be a non-empty JSON array.');
    process.exit(1);
  }

  const masterSecret = requireEnv('RAZORPAY_CREDENTIALS_MASTER_SECRET');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://<your-domain>';
  const supabase = makeClient();

  let ok = 0;
  for (const [i, e] of entries.entries()) {
    const where = `entry #${i + 1}${e.label ? ` (${e.label})` : ''}`;
    if (!e.institutionId || !e.keyId || !e.keySecret || !e.webhookSecret) {
      console.error(`✖ ${where}: institutionId, keyId, keySecret, webhookSecret are all required — skipping.`);
      continue;
    }

    const { data, error } = await supabase.rpc('fn_set_razorpay_account', {
      p_institution_id: e.institutionId,
      p_key_id: e.keyId,
      p_key_secret: e.keySecret,
      p_webhook_secret: e.webhookSecret,
      p_label: e.label ?? null,
      p_mode: e.mode ?? 'live',
      p_webhook_ref: e.webhookRef ?? null,
      p_master_secret: masterSecret,
      p_actor: null,
      p_fee_head: e.feeHead ?? null,
      p_mid: e.mid ?? null,
      p_tid: e.tid ?? null,
      p_dba_name: e.dbaName ?? null,
    });

    if (error) {
      console.error(`✖ ${where}: fn_set_razorpay_account failed — ${error.message}`);
      continue;
    }
    const row = (data as any[])?.[0];
    ok++;
    console.log(
      `✔ ${where}: account ${row.id} (${e.mode ?? 'live'}, head=${e.feeHead ?? 'default'})\n` +
        `    → Configure this Razorpay account's webhook URL as:\n` +
        `      ${appUrl}/api/webhooks/razorpay/${row.webhook_ref}\n`,
    );
  }

  console.log(`\nDone. ${ok}/${entries.length} account(s) seeded.`);
  console.log(
    'Next: in EACH institution\'s Razorpay dashboard, add a webhook with the URL printed above,\n' +
      'the same webhook secret you put in the seed file, and the events listed in the deployment guide.',
  );
}

async function main() {
  const arg = process.argv[2];
  if (arg === '--list') {
    await listAccounts();
    return;
  }
  const filePath = resolve(process.cwd(), arg ?? 'razorpay-accounts.seed.json');
  await seedFromFile(filePath);
}

main().catch((err) => {
  console.error('✖ Unexpected error:', err);
  process.exit(1);
});
