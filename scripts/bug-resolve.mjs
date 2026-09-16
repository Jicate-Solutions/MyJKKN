#!/usr/bin/env node
/**
 * Mark bugs resolved from the machine that fixed them — with a name attached.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three developers share one GitHub push identity, so a commit cannot say who
 * fixed a bug. It also cannot be answered by raw SQL: `UPDATE bug_reports SET
 * status='resolved'` records no person at all. This script is the bulk path
 * that does record one, and it works the same in Claude Code, Cursor, VS Code
 * or a plain terminal because it is just node + the repo's env file.
 *
 * SETUP (once per developer machine, never on Vercel)
 * --------------------------------------------------
 *   .env.local:
 *     BUG_RESOLVER_EMAIL=your.name@jkkn.ac.in
 *
 * The email is matched against `profiles.email`. It identifies the machine's
 * owner, so each developer must set their OWN address.
 *
 * USAGE
 * -----
 *   npm run bug:resolve -- BUG-005994 BUG-005991
 *   npm run bug:resolve -- --file fixed-bugs.txt      # one BUG-ID per line
 *   npm run bug:resolve -- --dry-run BUG-005994
 *   npm run bug:resolve -- --email other@jkkn.ac.in BUG-005994
 *
 * Already-resolved bugs are skipped, so re-running is safe.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  for (const file of ['.env.local', '.env']) {
    let text;
    try {
      text = readFileSync(join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      if (env[key] !== undefined) continue; // .env.local wins
      env[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

/**
 * Report and stop. Sets the exit code and throws instead of calling
 * process.exit(): a hard exit while fetch's keep-alive sockets are still open
 * trips a libuv assertion on Windows, which reads like a crash on top of a
 * plain "wrong email" message.
 */
class BugResolveError extends Error {}

function fail(message) {
  throw new BugResolveError(message);
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local.');
  }

  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  let email = env.BUG_RESOLVER_EMAIL;
  const ids = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') continue;
    if (arg === '--email') {
      email = argv[++i];
      continue;
    }
    if (arg === '--file') {
      const listFile = argv[++i];
      if (!listFile) fail('--file needs a path.');
      ids.push(...readFileSync(listFile, 'utf8').split(/\r?\n/));
      continue;
    }
    ids.push(arg);
  }

  // Normalise: accept BUG-005994, bug-005994 or a bare 005994.
  const displayIds = [
    ...new Set(
      ids
        .map((raw) => raw.trim().replace(/[,;]$/, '').toUpperCase())
        .filter(Boolean)
        .map((raw) => (raw.startsWith('BUG-') ? raw : `BUG-${raw}`))
    )
  ];

  if (displayIds.length === 0) {
    fail('Give at least one bug id: npm run bug:resolve -- BUG-005994');
  }

  // No email configured yet: ask, rather than resolving anonymously.
  if (!email) {
    if (!stdin.isTTY) {
      fail(
        'BUG_RESOLVER_EMAIL is not set. Add it to .env.local:\n' +
          '    BUG_RESOLVER_EMAIL=your.name@jkkn.ac.in'
      );
    }
    const rl = createInterface({ input: stdin, output: stdout });
    email = (await rl.question('Your institution email (who fixed these bugs): ')).trim();
    rl.close();
    console.log(
      '\n  Tip: add this line to .env.local so it is not asked again:\n' +
        `    BUG_RESOLVER_EMAIL=${email}\n`
    );
  }

  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`"${email}" is not a valid email address.`);

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  const rest = async (path, init) => {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.message || body?.hint || `${response.status} ${text.slice(0, 200)}`);
    }
    return body;
  };

  // 1. Who is resolving?
  const profiles = await rest(
    `profiles?select=id,full_name,email&email=eq.${encodeURIComponent(email)}&limit=2`
  );
  if (profiles.length === 0) {
    fail(`No MyJKKN profile has the email ${email}. Check BUG_RESOLVER_EMAIL in .env.local.`);
  }
  if (profiles.length > 1) fail(`More than one profile uses ${email}. Ask an admin to fix that first.`);
  const resolver = profiles[0];

  // 2. What are we resolving?
  const inList = displayIds.map((id) => `"${id}"`).join(',');
  // resolved_by is deliberately NOT selected: the lookup must still work on a
  // database where the column has not been added yet, so that the clear
  // "apply the migration first" error comes from the write, not from this read.
  const bugs = await rest(
    `bug_reports?select=id,display_id,status&display_id=in.(${encodeURIComponent(inList)})`
  );
  const found = new Map(bugs.map((bug) => [bug.display_id, bug]));
  const missing = displayIds.filter((id) => !found.has(id));
  const already = bugs.filter((bug) => bug.status === 'resolved');
  const todo = bugs.filter((bug) => bug.status !== 'resolved');

  console.log(`\nResolver : ${resolver.full_name ?? '(no name)'} <${resolver.email}>`);
  console.log(`Requested: ${displayIds.length}`);
  console.log(`To resolve: ${todo.length}${already.length ? `   Already resolved: ${already.length}` : ''}${
    missing.length ? `   Not found: ${missing.length}` : ''
  }`);
  if (missing.length > 0) console.log(`  not found → ${missing.join(', ')}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing was written.\n');
    return;
  }
  if (todo.length === 0) {
    console.log('\nNothing to do.\n');
    return;
  }

  // 3. Resolve, in chunks so one long URL cannot break the run.
  const resolvedAt = new Date().toISOString();
  let updated = 0;
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const idList = chunk.map((bug) => `"${bug.id}"`).join(',');
    const rows = await rest(`bug_reports?id=in.(${encodeURIComponent(idList)})&select=display_id`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'resolved',
        resolved_at: resolvedAt,
        resolved_by: resolver.id
      })
    });
    updated += rows?.length ?? chunk.length;
    for (const bug of chunk) console.log(`  ✓ ${bug.display_id} → resolved`);
  }

  console.log(`\n${updated} bug(s) resolved as ${resolver.email}.\n`);
}

main().catch((error) => {
  let message = error instanceof Error ? error.message : String(error);
  if (/resolved_by/.test(message) && /column|schema cache/i.test(message)) {
    message =
      `${message}\n\n  The resolved_by column is not in this database yet. Apply\n` +
      '  supabase/migrations/20261223093000_bug_reports_resolved_by.sql first.';
  }
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
});
