// scripts/moments/send-campaign.ts
//
// Family Moments — WhatsApp campaign send (Father's Day 2026).
//
// Sends the Meta-approved template to each father with his personalized
// gift-card link. DRY RUN by default; --live actually sends.
//
//   npx tsx scripts/moments/send-campaign.ts --campaign fathers-day-2026-nv
//   npx tsx scripts/moments/send-campaign.ts --campaign fathers-day-2026-nv --test-to 91XXXXXXXXXX
//   npx tsx scripts/moments/send-campaign.ts --campaign fathers-day-2026-nv --live
//
// Safety rails:
//   * dry run default — prints the full send list, sends nothing
//   * --test-to sends ONE message (first row) to the given number only
//   * --live skips rows already stamped sent_at (safe to resume after a crash)
//   * 1.1s throttle (~80/153 tier headroom; 456 sends ≈ 9 minutes)
//
// Template (submit for Meta approval FIRST — see PR description):
//   name: fathers_day_moment_2026, lang: en
//   body: "Dear {{1}}, Happy Father's Day! 🎉 {{2}} has left a surprise for
//          you — made at school, just for you. Tap below to open it. 🎁"
//   button[0]: URL "See my surprise" → https://www.jkkn.ai/m/{{1}}

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

for (const file of ['.env.production.local', '.env.local']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n$/, '');
    }
  }
}

const TEMPLATE_NAME = 'fathers_day_moment_2026';
const TEMPLATE_LANG = 'en';
const THROTTLE_MS = 1100;

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const LIVE = process.argv.includes('--live');
const CAMPAIGN_SLUG = arg('--campaign');
const TEST_TO = arg('--test-to');

/** Normalize Indian mobile to E.164-ish digits (Meta wants country code). */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return null;
}

function firstName(full: string | null): string {
  if (!full) return 'Appa';
  return full.replace(/[.,]/g, ' ').trim().split(/\s+/)[0] ?? full;
}

async function sendOne(
  to: string,
  fatherName: string,
  childName: string,
  token: string,
): Promise<{ ok: boolean; detail: string }> {
  // Direct Cloud API call — same wire format as
  // lib/services/whatsapp/whatsapp-api-client.ts sendTemplateMessage, kept
  // dependency-free so the script runs with plain tsx outside Next.
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { ok: false, detail: 'WHATSAPP_* env vars missing' };
  }
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: fatherName },
                { type: 'text', text: childName },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: token }],
            },
          ],
        },
      }),
    },
  );
  const body = await res.text();
  return { ok: res.ok, detail: res.ok ? 'sent' : `${res.status}: ${body.slice(0, 200)}` };
}

async function main() {
  if (!CAMPAIGN_SLUG) {
    console.error('Usage: --campaign <slug> [--live | --test-to 91XXXXXXXXXX]');
    process.exit(1);
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: campaign, error: campaignError } = await supabase
    .from('family_moments_campaigns')
    .select('id, title, status')
    .eq('slug', CAMPAIGN_SLUG)
    .single();
  if (campaignError || !campaign) {
    console.error(`Campaign not found: ${CAMPAIGN_SLUG}`);
    process.exit(1);
  }

  const { data: moments, error: momentsError } = await supabase
    .from('family_moments')
    .select('id, token, child_name, recipient_name, recipient_phone, sent_at')
    .eq('campaign_id', campaign.id)
    .order('child_name');
  if (momentsError) throw momentsError;

  const sendable = (moments ?? [])
    .map((m) => ({ ...m, phone: m.recipient_phone ? normalizePhone(m.recipient_phone) : null }))
    .filter((m) => m.phone !== null);
  const pending = sendable.filter((m) => !m.sent_at);

  console.log(`Campaign: ${campaign.title} [${campaign.status}]`);
  console.log(`Rows: ${moments?.length ?? 0} total, ${sendable.length} with valid phone, ${pending.length} unsent\n`);

  if (TEST_TO) {
    const sample = sendable[0];
    if (!sample) { console.error('No sendable rows.'); process.exit(1); }
    console.log(`TEST SEND → ${TEST_TO} (using ${sample.child_name}'s card)`);
    const result = await sendOne(TEST_TO, firstName(sample.recipient_name), sample.child_name, sample.token);
    console.log(result.ok ? '✓ delivered to API' : `✗ ${result.detail}`);
    return;
  }

  if (!LIVE) {
    for (const m of pending.slice(0, 10)) {
      console.log(`  would send → ${m.phone}  ${firstName(m.recipient_name)} / ${m.child_name}  /moments/${m.token.slice(0, 6)}…`);
    }
    if (pending.length > 10) console.log(`  … and ${pending.length - 10} more`);
    console.log('\nDRY RUN — nothing sent. Pass --live to send.');
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const m of pending) {
    const result = await sendOne(m.phone!, firstName(m.recipient_name), m.child_name, m.token);
    if (result.ok) {
      sent += 1;
      await supabase
        .from('family_moments')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', m.id);
    } else {
      failed += 1;
      console.error(`  ✗ ${m.child_name} (${m.phone}): ${result.detail}`);
    }
    if ((sent + failed) % 25 === 0) console.log(`  progress: ${sent} sent, ${failed} failed`);
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }
  console.log(`\nDone. ${sent} sent, ${failed} failed.`);

  if (failed === 0 && sent > 0) {
    await supabase
      .from('family_moments_campaigns')
      .update({ status: 'sent' })
      .eq('id', campaign.id);
  }
}

main().catch((error) => {
  console.error('Send failed:', error);
  process.exit(1);
});
