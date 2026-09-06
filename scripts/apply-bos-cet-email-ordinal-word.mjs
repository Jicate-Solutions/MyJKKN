#!/usr/bin/env node
/**
 * Switches the CET BoS invitation email from the numeric meeting ordinal to the
 * spelled-out one, in BOTH the subject and the body:
 *
 *   1st Board of Studies Meeting  →  First Board of Studies Meeting
 *
 * i.e. {{meeting_ordinal}} → {{meeting_ordinal_word}}. The word form matches
 * the printed call letter's "Sub:" line, so the email and its PDF attachment
 * now read the same. {{meeting_ordinal}} still exists and still renders "1st"
 * for any template that wants it.
 *
 * Data-only change to bos_email_templates. Prints before/after and is safe to
 * re-run (already-migrated rows are skipped).
 *
 * Usage:
 *   node scripts/apply-bos-cet-email-ordinal-word.mjs          # dry run
 *   node scripts/apply-bos-cet-email-ordinal-word.mjs --apply
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

const sqlLiteral = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

// Only the bare token — never touch an existing {{meeting_ordinal_word}}.
const OLD = /\{\{\s*meeting_ordinal\s*\}\}/g;
const NEW = '{{meeting_ordinal_word}}';

const rows = await runSql(`
  SELECT t.id, i.name AS institution, t.body_type_code, t.effective_from,
         t.subject, t.body_html, t.pdf_heading, t.pdf_intro_html
  FROM bos_email_templates t
  JOIN institutions i ON i.id = t.institutions_id
  WHERE t.is_active = true
    AND i.name ~* '(engineering|technology)'
  ORDER BY t.body_type_code, t.effective_from;
`);

let changed = 0;
for (const row of rows) {
  const fields = ['subject', 'body_html', 'pdf_heading', 'pdf_intro_html'];
  const patch = {};
  for (const f of fields) {
    const val = row[f];
    if (typeof val === 'string' && OLD.test(val)) {
      OLD.lastIndex = 0;
      patch[f] = val.replace(OLD, NEW);
    }
    OLD.lastIndex = 0;
  }

  console.log('─'.repeat(70));
  console.log(`${row.institution} · ${row.body_type_code} · w.e.f. ${row.effective_from}`);
  const touched = Object.keys(patch);
  if (touched.length === 0) {
    console.log('  – no {{meeting_ordinal}} to replace — skipped');
    continue;
  }
  console.log(`  fields: ${touched.join(', ')}`);
  if (patch.subject) {
    console.log(`  subject before: ${row.subject}`);
    console.log(`  subject after:  ${patch.subject}`);
  }
  changed++;

  if (APPLY) {
    const sets = touched.map((f) => `${f} = ${sqlLiteral(patch[f])}`).join(', ');
    await runSql(`UPDATE bos_email_templates SET ${sets}, updated_at = now() WHERE id = '${row.id}';`);
    console.log('  ✓ updated');
  }
}

console.log('─'.repeat(70));
console.log(
  APPLY
    ? `✓ ${changed} template(s) updated`
    : `${changed} template(s) would change — re-run with --apply`,
);
