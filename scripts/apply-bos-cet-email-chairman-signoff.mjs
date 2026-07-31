#!/usr/bin/env node
/**
 * Switches the CET (engineering) BoS meeting-invitation EMAIL sign-off from the
 * hardcoded "Principal – JKKNCET" to the convening board chairman's details.
 *
 *   Warm regards,                    Warm regards,
 *   Principal – JKKNCET      →       Dr. RAJESH K.P,
 *                                    ASSOCIATE PROFESSOR,
 *                                    Department of Electronics and Communication Engineering,
 *                                    JKKN College of Engineering and Technology,
 *                                    Mobile: 9xxxxxxxxx
 *
 * The replacement is the {{chairman_block}} placeholder, NOT literal text, so
 * each board's own chairman signs its invitations (ECE's chairman on ECE
 * letters, EEE's on EEE letters). The block is composed at send time in
 * app/api/bos/meetings/[id]/notify-members/route.ts and omits any line the
 * chairman's member row has no value for.
 *
 * Data-only change: touches bos_email_templates.body_html for the engineering
 * institution's BOS templates. Prints before/after and is safe to re-run
 * (the match is skipped once already migrated).
 *
 * Usage:
 *   node scripts/apply-bos-cet-email-chairman-signoff.mjs          # dry run
 *   node scripts/apply-bos-cet-email-chairman-signoff.mjs --apply
 */
import { readFileSync } from 'node:fs';

for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken || !supabaseUrl) {
  console.error('✗ SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}
const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!projectRef) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}

const APPLY = process.argv.includes('--apply');
console.log(`Project: ${projectRef}   mode: ${APPLY ? 'APPLY' : 'dry run'}\n`);

async function runSql(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

const sqlLiteral = (s) => `'${String(s).replace(/'/g, "''")}'`;

// "Principal – JKKNCET" as stored: the en dash may be a literal char or the
// &#8211; entity depending on how the editor saved it. Match both.
const SIGNOFF_PATTERNS = [
  /Principal\s*(?:&#8211;|&ndash;|–|-)\s*JKKNCET/i,
];
const NEW_SIGNOFF = '{{chairman_block}}';

const rows = await runSql(`
  SELECT t.id, t.body_type_code, t.effective_from, i.name AS institution, t.body_html
  FROM bos_email_templates t
  JOIN institutions i ON i.id = t.institutions_id
  WHERE t.template_code = 'meeting_invitation'
    AND t.is_active = true
    AND i.name ~* '(engineering|technology)'
  ORDER BY t.body_type_code, t.effective_from;
`);

if (rows.length === 0) {
  console.log('No engineering meeting_invitation templates found — nothing to do.');
  process.exit(0);
}

let changed = 0;
for (const row of rows) {
  const pattern = SIGNOFF_PATTERNS.find((p) => p.test(row.body_html));
  console.log('─'.repeat(70));
  console.log(`${row.institution} · ${row.body_type_code} · w.e.f. ${row.effective_from}`);
  if (!pattern) {
    console.log(
      row.body_html.includes(NEW_SIGNOFF)
        ? '  ✓ already uses {{chairman_block}} — skipped'
        : '  – no "Principal – JKKNCET" sign-off found — skipped',
    );
    continue;
  }

  const before = row.body_html.match(pattern)[0];
  const after = row.body_html.replace(pattern, NEW_SIGNOFF);
  console.log(`  before: ${before}`);
  console.log(`  after:  ${NEW_SIGNOFF}`);
  changed++;

  if (APPLY) {
    await runSql(`
      UPDATE bos_email_templates
      SET body_html = ${sqlLiteral(after)}, updated_at = now()
      WHERE id = '${row.id}';
    `);
    console.log('  ✓ updated');
  }
}

console.log('─'.repeat(70));
console.log(
  APPLY
    ? `✓ ${changed} template(s) updated`
    : `${changed} template(s) would change — re-run with --apply`,
);
