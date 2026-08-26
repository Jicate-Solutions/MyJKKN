/**
 * Seed the Orchestration Console's plain-language explainer text.
 *
 * The cron writer (app/api/cron/orchestration-sync/route.ts) upserts
 * orchestration_modules rows on every tick, but it deliberately NEVER writes
 * does_text / output_text / impact_text — those are the module card's
 * "Does · You'll get · Impact" lines (artifacts/orchestration-console-spec.html
 * §05 "Every action explains itself"), and a cron must never clobber a
 * human's hand-written wording.
 *
 * This script fills that gap ONCE: for every orchestration_modules row where
 * does_text/output_text/impact_text is still NULL (i.e. the cron created the
 * row but nobody has written the explainer yet), it seeds the generic
 * "Run AI" explainer — the only action Phase 1 wires up, per the spec and
 * the migration's own comment. It NEVER overwrites a row that already has
 * text, so re-running it after someone has hand-edited a module's wording
 * is always safe.
 *
 * SAFE BY DEFAULT (dry run — prints what it would change). Pass --commit to
 * actually write. This script is shipped as a file only; it is NOT run
 * against production by this PR.
 *
 * Usage:
 *   node scripts/orchestration-seed.mjs            # dry run
 *   node scripts/orchestration-seed.mjs --commit    # write
 *
 * Prereq: supabase/migrations/20261003000000_orchestration_console.sql
 * must be applied first (the Director applies it — see that file's header).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Generic "Run AI" explainer — the only action Phase 1 wires up. Wording
// matches the Run AI row of the action-explainer table in
// artifacts/orchestration-console-spec.html §05 exactly (Does · You'll get ·
// Impact), so the module card's language never drifts from the spec's own
// promise. Once Phase 2 wires Merge/Deploy per module, a follow-up seed (or
// a human editing the row directly — the whole point of storing this in the
// DB, not a redeploy) can extend past this generic default.
const RUN_AI_EXPLAINER = {
  does_text: "Sends the AI to build and test this module's open PRs.",
  output_text: "Each PR marked pass or fail against today's main, with the reason.",
  impact_text: 'Safe — nothing merges or deploys. Uses AI run time.',
};

async function main() {
  console.log(COMMIT ? '=== COMMIT MODE — will write ===' : '=== DRY RUN — no writes (pass --commit to apply) ===');

  const { data: modules, error } = await db
    .from('orchestration_modules')
    .select('id, key, title, does_text, output_text, impact_text');

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message ?? '')) {
      console.error(
        'orchestration_modules does not exist yet — apply supabase/migrations/' +
          '20261003000000_orchestration_console.sql first.',
      );
      process.exit(1);
    }
    console.error('Failed to read orchestration_modules:', error.message);
    process.exit(1);
  }

  const rows = modules ?? [];
  if (rows.length === 0) {
    console.log('No orchestration_modules rows yet — nothing to seed. (The cron writer creates rows as it sees open PRs.)');
    return;
  }

  const needsSeed = rows.filter((m) => !m.does_text && !m.output_text && !m.impact_text);
  const alreadyHasText = rows.length - needsSeed.length;

  console.log(`orchestration_modules: ${rows.length} total, ${needsSeed.length} missing explainer text, ${alreadyHasText} already written (untouched).`);

  if (needsSeed.length === 0) {
    console.log('Nothing to do — every module already has explainer text.');
    return;
  }

  for (const m of needsSeed) {
    console.log(`  ${COMMIT ? 'writing' : 'would write'} explainer text for "${m.title}" (${m.key})`);
  }

  if (!COMMIT) {
    console.log('\nDry run complete. Re-run with --commit to write.');
    return;
  }

  let updated = 0;
  const errors = [];
  for (const m of needsSeed) {
    const { error: updateError } = await db
      .from('orchestration_modules')
      .update(RUN_AI_EXPLAINER)
      .eq('id', m.id)
      // Belt-and-braces re-check at write time: only touch rows still empty,
      // in case something wrote text between the read above and now.
      .is('does_text', null)
      .is('output_text', null)
      .is('impact_text', null);
    if (updateError) {
      errors.push(`${m.key}: ${updateError.message}`);
    } else {
      updated += 1;
    }
  }

  console.log(`\nSeeded ${updated}/${needsSeed.length} module(s).`);
  if (errors.length > 0) {
    console.error('Errors:');
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
