/**
 * Prune Turbopack's persistent dev cache before `next dev` starts.
 *
 * Why this exists (2026-07-22):
 * Turbopack's dev cache at .next/dev/cache has no eviction policy — it grows
 * forever. Measured on this repo: 0.02 GB on Jul 11 -> 15.51 GB on Jul 22,
 * accelerating (5.2 GB added on Jul 21 alone), with 3,587 of 8,844 files
 * untouched for 7+ days. On a 16 GB machine that cache plus the dev server's
 * working set exhausts RAM and the whole OS starts thrashing the pagefile.
 *
 * Note the cache path: Next.js 16 moved it from .next/cache to .next/dev/cache.
 * The `clean` script pointed at the old path for the entire Next 16 migration
 * and was silently a no-op, which is how 15 GB accumulated unnoticed.
 *
 * Runs automatically via the `predev` npm lifecycle hook. Deleting the cache
 * only costs a slower first compile; it is purely derived data.
 */
import { rmSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.next/dev/cache';
const LIMIT_GB = Number(process.env.TURBO_CACHE_LIMIT_GB ?? 4);

if (!existsSync(CACHE_DIR)) process.exit(0);

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += dirSizeBytes(full);
      else total += statSync(full).size;
    } catch {
      // File vanished mid-walk (dev server still writing) — ignore.
    }
  }
  return total;
}

const sizeGb = dirSizeBytes(CACHE_DIR) / 1024 ** 3;

if (sizeGb > LIMIT_GB) {
  console.log(
    `[prune-turbo-cache] ${sizeGb.toFixed(2)} GB exceeds ${LIMIT_GB} GB limit — clearing ${CACHE_DIR}`
  );
  rmSync(CACHE_DIR, { recursive: true, force: true });
  console.log('[prune-turbo-cache] Cleared. First compile will be slower.');
} else {
  console.log(`[prune-turbo-cache] ${sizeGb.toFixed(2)} GB / ${LIMIT_GB} GB — OK.`);
}
