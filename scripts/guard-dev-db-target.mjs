/**
 * Refuse to start a dev server that is pointed at the PRODUCTION database.
 *
 * Why this exists (2026-09-12):
 * On 2026-05-07 this repo's `.env.local` was deliberately repointed from the
 * dev project to production (see the `.env.local.bak.before-prod-repoint-*`
 * file). That was an intentional choice for read-heavy debugging, but it left
 * `npm run dev` writing to the live institutional database: audit rows,
 * sessions and drafts land in production, and any notification test fires real
 * messages at real people. Flagged 2026-09-06, never acted on.
 *
 * This guard does NOT change anyone's configuration. It makes the ACCIDENT
 * impossible while leaving the deliberate case available behind an explicit,
 * loud opt-in (ALLOW_PROD_DB_IN_DEV=1).
 *
 * Scope: dev servers only. It is wired into the `dev`, `dev:webpack` and
 * `dev:sentry` scripts, NOT into `build` or `start` — Vercel production builds
 * must of course point at production, and never run this file.
 *
 * Dependency-free on purpose: it runs before the dev server and must work even
 * when node_modules is missing or half-installed (a fresh worktree, say).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The production Supabase project ref. Not a secret — it is the host in
 * NEXT_PUBLIC_SUPABASE_URL and ships to every browser that loads jkkn.ai.
 */
const PRODUCTION_REF = 'kvizhngldtiuufknvehv';

const OVERRIDE_VAR = 'ALLOW_PROD_DB_IN_DEV';

/**
 * Env files in the order Next.js consults them for `next dev`, HIGHEST
 * precedence first. process.env (a real shell export) outranks all of them.
 * https://nextjs.org/docs/app/guides/environment-variables
 */
const ENV_FILES = [
  '.env.development.local',
  '.env.local',
  '.env.development',
  '.env',
];

/** Minimal KEY=VALUE parser: enough for `next dev`'s own file format. */
function parseEnvFile(path) {
  const out = new Map();
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    // Strip one matching pair of surrounding quotes, as dotenv does.
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

/**
 * Resolve the env the dev server will actually see, then return every entry
 * whose value reaches the production project.
 *
 * Scanning ALL values (not just NEXT_PUBLIC_SUPABASE_URL) is deliberate: a
 * checkout with the public URL on staging but DATABASE_URL or a service-role
 * key still on production can reach production just as easily.
 */
function findProductionEntries(cwd) {
  /** @type {Map<string, {value: string, source: string}>} */
  const resolved = new Map();

  // Lowest precedence first, so later writes are overwritten by earlier files.
  for (const file of [...ENV_FILES].reverse()) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of parseEnvFile(path)) {
      resolved.set(key, { value, source: file });
    }
  }
  // A real shell export beats every file.
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) resolved.set(key, { value, source: 'shell environment' });
  }

  const hits = [];
  for (const [key, { value, source }] of resolved) {
    if (key === OVERRIDE_VAR) continue;
    if (typeof value === 'string' && value.includes(PRODUCTION_REF)) {
      hits.push({ key, source });
    }
  }
  return hits.sort((a, b) => a.key.localeCompare(b.key));
}

function main() {
  const cwd = process.cwd();
  const hits = findProductionEntries(cwd);

  if (hits.length === 0) {
    return 0;
  }

  const varList = hits.map((h) => `     - ${h.key}  (from ${h.source})`).join('\n');

  if (process.env[OVERRIDE_VAR] === '1') {
    process.stderr.write(
      '\n' +
        '  ⚠️  DEV SERVER IS POINTED AT THE PRODUCTION DATABASE.\n' +
        `     ${OVERRIDE_VAR}=1 is set, so this start is allowed.\n` +
        '     Every write from here lands in production. Notification tests will\n' +
        '     send real messages to real people.\n\n' +
        `     Production ref: ${PRODUCTION_REF}\n` +
        `     Reached through:\n${varList}\n\n`
    );
    return 0;
  }

  process.stderr.write(
    '\n' +
      '  ✋ DEV SERVER BLOCKED — this checkout points at the PRODUCTION database.\n\n' +
      `     Production ref: ${PRODUCTION_REF}\n` +
      `     Reached through:\n${varList}\n\n` +
      '     Starting a dev server here writes to production — audit rows, sessions\n' +
      '     and drafts — and notification tests fire real messages at real people.\n\n' +
      '     Pick one:\n' +
      '       1. Point the variables above at a non-production Supabase project.\n' +
      '          A previous dev target is kept in .env.local.bak.before-prod-repoint-*\n' +
      `       2. If you genuinely need dev against production and accept the writes:\n` +
      `          ${OVERRIDE_VAR}=1 npm run dev\n\n`
  );
  return 1;
}

process.exit(main());
