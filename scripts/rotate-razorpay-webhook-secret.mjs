// Rotate the webhook secret of a Razorpay account WITHOUT changing its webhook
// URL and without needing the Razorpay API key secret.
//
// The webhook secret is a value you invent and type into BOTH the Razorpay
// dashboard and this vault. It is stored encrypted and never readable back, so
// if you no longer know it, the fix is to set a NEW one on both sides — this
// script is the "both sides / MyJKKN half".
//
// The secret is read from the NEW_WEBHOOK_SECRET env var and is never printed,
// never written to a file, and never sent anywhere except the vault RPC.
//
//   node scripts/rotate-razorpay-webhook-secret.mjs --list
//   NEW_WEBHOOK_SECRET='<your-secret>' \
//     node scripts/rotate-razorpay-webhook-secret.mjs --account <uuid>
//
// Requires in .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// RAZORPAY_CREDENTIALS_MASTER_SECRET.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  return env;
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER = env.RAZORPAY_CREDENTIALS_MASTER_SECRET;

// .env carries the DEV value (http://localhost:3000). Razorpay must POST to the
// public origin — a localhost URL in the dashboard looks configured and silently
// never delivers, which is the exact failure this script exists to fix.
const PROD_URL = 'https://jkkn.ai';
let APP_URL = (val('--base-url') || env.NEXT_PUBLIC_APP_URL || PROD_URL).replace(/\/$/, '');
if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(APP_URL)) {
  console.warn(
    `\n  ⚠  NEXT_PUBLIC_APP_URL is ${APP_URL} — a dev value Razorpay cannot reach.\n` +
      `     Using ${PROD_URL} instead. Override with --base-url <url>.`,
  );
  APP_URL = PROD_URL;
}

for (const [k, v] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  RAZORPAY_CREDENTIALS_MASTER_SECRET: MASTER,
})) {
  if (!v) {
    console.error(`Missing ${k} in .env — cannot continue.`);
    process.exit(1);
  }
}

async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${JSON.stringify(json)}`);
  return json;
}

if (has('--list') || (!val('--account') && !has('--help'))) {
  const rows = await rpc('fn_list_razorpay_accounts', {});
  console.log('\nRazorpay accounts (webhook URL is what you paste into the dashboard):\n');
  for (const a of rows.filter((r) => r.is_active)) {
    console.log(`  ${a.account_label}`);
    console.log(`    id        ${a.id}`);
    console.log(`    mid       ${a.mid ?? '—'}   fee_head: ${a.fee_head ?? 'default'}   scope: ${a.institution_id ? 'institution' : 'GLOBAL'}`);
    console.log(`    webhook   ${a.webhook_ref ? `${APP_URL}/api/webhooks/razorpay/${a.webhook_ref}` : '(not activated)'}\n`);
  }
  console.log("Then: NEW_WEBHOOK_SECRET='<secret>' node scripts/rotate-razorpay-webhook-secret.mjs --account <id>\n");
  process.exit(0);
}

if (has('--help')) {
  console.log("Usage:\n  node scripts/rotate-razorpay-webhook-secret.mjs --list\n  NEW_WEBHOOK_SECRET='<secret>' node scripts/rotate-razorpay-webhook-secret.mjs --account <uuid>");
  process.exit(0);
}

const accountId = val('--account');
const newSecret = process.env.NEW_WEBHOOK_SECRET;

if (!newSecret || newSecret.trim().length < 12) {
  console.error(
    'NEW_WEBHOOK_SECRET env var is missing or shorter than 12 chars.\n' +
      "Generate one with:  openssl rand -hex 32\n" +
      'Save it somewhere durable FIRST — you must paste the same value into Razorpay.',
  );
  process.exit(1);
}

let rotated;
let check;
try {
  [rotated] = await rpc('fn_rotate_razorpay_webhook_secret', {
    p_account_id: accountId,
    p_webhook_secret: newSecret,
    p_master_secret: MASTER,
    p_actor: null,
  });

  // Round-trip proof: decrypt in-process and compare. Never print either value.
  [check] = await rpc('fn_get_razorpay_account_by_id', {
    p_account_id: accountId,
    p_master_secret: MASTER,
  });
} catch (err) {
  console.error(`\n  ❌ Rotation failed — nothing was changed.\n     ${err.message}\n`);
  console.error('     Check the account id with:  node scripts/rotate-razorpay-webhook-secret.mjs --list\n');
  process.exit(1);
}

const ok = check?.webhook_secret === newSecret;

console.log(`\n  stored + verified: ${ok ? 'MATCH ✅' : 'MISMATCH ❌ — do NOT configure Razorpay yet'}`);
console.log(`  webhook_ref unchanged: ${rotated.webhook_ref}`);
console.log(`\n  Paste this URL into the Razorpay dashboard for this MID:`);
console.log(`    ${APP_URL}/api/webhooks/razorpay/${rotated.webhook_ref}`);
console.log(`  ...with the SAME secret you just used, and events:`);
console.log(`    order.paid, payment.authorized, payment.captured, payment.failed,`);
console.log(`    refund.created, refund.processed, refund.failed\n`);
// Set the code and let the loop drain. Calling process.exit() here trips a
// libuv assertion on Windows ("UV_HANDLE_CLOSING") while the fetch sockets are
// still closing — cosmetic, but it looks like a crash after a successful write.
process.exitCode = ok ? 0 : 1;
