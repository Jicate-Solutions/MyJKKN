import { spawn } from 'node:child_process';

// 2026-05-03 — environment-aware heap cap restored.
//
// Vercel's standard build container is 8 GB physical RAM. Setting the V8
// max-old-space-size higher than ~7168 MB lets V8 over-allocate and trip
// the kernel OOM killer (Vercel surfaces this as "OOM event detected").
//
// History:
//   - 53e85d839 lowered the cap to 7 GB to fit the 8 GB container
//   - dd887c532 ("add build wrapper") raised it back to 12 GB (regression)
//   - 2026-05-03 OOM on commit 35681e5 confirmed the regression: the
//     Vercel build process was killed during the silent webpack phase
//     after RSS crossed the 8 GB container limit.
//
// Local dev machines have plenty of headroom, so we keep the 12 GB cap
// off-Vercel. Detection: `process.env.VERCEL === '1'` is set automatically
// by Vercel's build runtime (not by `vercel dev`).
const HEAP_MB = process.env.VERCEL === '1' ? 7168 : 12288;
const HEAP_FLAGS = `--max-old-space-size=${HEAP_MB} --max-semi-space-size=128`;

const env = {
  ...process.env,
  NODE_OPTIONS: process.env.NODE_OPTIONS
    ? `${process.env.NODE_OPTIONS} ${HEAP_FLAGS}`
    : HEAP_FLAGS,
};

// Note: when both --max_old_space_size (underscore — Vercel's container
// default) and --max-old-space-size (hyphen — ours) appear in NODE_OPTIONS,
// V8 uses whichever appears LAST. Ours is appended, so it wins. The two
// values both showing up in the log is normal; only the last takes effect.
console.log('[build.mjs] HEAP_MB =', HEAP_MB, '(VERCEL=' + (process.env.VERCEL ?? 'unset') + ')');
console.log('[build.mjs] NODE_OPTIONS =', env.NODE_OPTIONS);

const child = spawn('next', ['build', '--webpack'], {
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[build.mjs] failed to spawn next:', err);
  process.exit(1);
});
