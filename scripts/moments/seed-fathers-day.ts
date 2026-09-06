// scripts/moments/seed-fathers-day.ts
//
// Family Moments — Father's Day 2026 seed (NV CBSE + Matric HSS).
//
// Creates one campaign per school and pre-seeds ONE moment row per learner
// with an unguessable token + auto-card fallback content, so every father's
// link works from day one even if a teacher never uploads anything.
// Teacher submissions later UPGRADE rows in place (content_type auto → text/image).
//
// Idempotent: campaigns upsert on slug; moments upsert on (campaign_id,
// learner_id) WITHOUT overwriting teacher content (ignoreDuplicates).
//
// Usage (from repo root, prod env vars in .env.production.local):
//   npx tsx scripts/moments/seed-fathers-day.ts            # dry run (default)
//   npx tsx scripts/moments/seed-fathers-day.ts --live     # write to DB
//
// Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ── env loading (scripts run outside Next) ─────────────────────────────
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

const LIVE = process.argv.includes('--live');

const SCHOOLS = [
  {
    institutionId: '29c221d1-b918-4c46-9d67-857273b0b553',
    slug: 'fathers-day-2026-nv',
    title: "Father's Day 2026 — Nattraja Vidhyalya",
  },
  {
    institutionId: 'e04b8a7f-1445-4ef1-92e9-bde3d32b1f44',
    slug: 'fathers-day-2026-matric',
    title: "Father's Day 2026 — JKKN Matric HSS",
  },
] as const;

// Father's Day 2026 — Sunday June 21, send 8:00 AM IST.
const SEND_AT = '2026-06-21T08:00:00+05:30';

function makeToken(): string {
  // 18 bytes → 24-char base64url. Unguessable; fits VARCHAR(64) + TOKEN_RE.
  return randomBytes(18).toString('base64url');
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  console.log(`Mode: ${LIVE ? 'LIVE WRITE' : 'DRY RUN (pass --live to write)'}\n`);

  for (const school of SCHOOLS) {
    console.log(`── ${school.title}`);

    // 1. Campaign (upsert on slug)
    let campaignId = 'dry-run-campaign-id';
    if (LIVE) {
      const { data, error } = await supabase
        .from('family_moments_campaigns')
        .upsert(
          {
            institution_id: school.institutionId,
            slug: school.slug,
            title: school.title,
            occasion: 'fathers_day',
            recipient_type: 'father',
            card_theme: 'fathers-day',
            status: 'collecting',
            send_at: SEND_AT,
          },
          { onConflict: 'slug' },
        )
        .select('id')
        .single();
      if (error) throw error;
      campaignId = data.id;
    }
    console.log(`   campaign: ${school.slug} (${LIVE ? campaignId : 'dry'})`);

    // 2. Learners + class labels
    const { data: learners, error: learnersError } = await supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, father_name, father_mobile, program_id')
      .eq('institution_id', school.institutionId);
    if (learnersError) throw learnersError;

    const { data: programs, error: programsError } = await supabase
      .from('programs')
      .select('id, program_name')
      .eq('institution_id', school.institutionId);
    if (programsError) throw programsError;
    const classByProgram = new Map(
      (programs ?? []).map((p) => [p.id, p.program_name as string]),
    );

    const rows = (learners ?? []).map((l) => ({
      campaign_id: campaignId,
      learner_id: l.id,
      institution_id: school.institutionId,
      token: makeToken(),
      content_type: 'auto',
      child_name: [l.first_name, l.last_name].filter(Boolean).join(' ').trim(),
      child_class: l.program_id
        ? (classByProgram.get(l.program_id) ?? null)
        : null,
      recipient_name: l.father_name ?? null,
      recipient_phone: l.father_mobile ? String(l.father_mobile).trim() : null,
    }));

    const missingPhone = rows.filter((r) => !r.recipient_phone).length;
    console.log(`   learners: ${rows.length} (${missingPhone} without father_mobile)`);

    // 3. Insert moments — ignoreDuplicates so re-runs NEVER reset teacher
    //    content or rotate tokens already sent out.
    if (LIVE && rows.length > 0) {
      const { error: insertError, count } = await supabase
        .from('family_moments')
        .upsert(rows, {
          onConflict: 'campaign_id,learner_id',
          ignoreDuplicates: true,
          count: 'exact',
        });
      if (insertError) throw insertError;
      console.log(`   inserted: ${count ?? '?'} new moment rows`);
    }
    console.log('');
  }

  console.log(LIVE ? 'Seed complete.' : 'Dry run complete — nothing written.');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
