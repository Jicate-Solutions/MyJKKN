#!/usr/bin/env node
//
// scripts/ci/check-build-ci-parity.mjs
//
// Asserts that `build:ci` — the entry point .github/workflows/production-build.yml
// runs — still performs exactly the same steps as `build`, the entry point Vercel
// runs, differing ONLY in the V8 heap cap.
//
// ─── WHY THIS GUARD EXISTS ───────────────────────────────────────────────────
//
// The two scripts are duplicated on purpose. `build` must stay byte-identical to
// what Vercel executes, so CI cannot borrow it and override NODE_OPTIONS —
// cross-env sets the variable explicitly and wins over anything the workflow
// exports. The only way to build with a different cap is a second script.
//
// Duplication has an obvious failure mode: somebody adds a step to `build` — a
// new codegen pass, a new check — and `build:ci` silently stops covering it. The
// gate then keeps reporting green while testing something that is no longer the
// production build. That is precisely the class of silent gate failure this
// whole workflow was written to end, so it gets a guard rather than a comment.
//
// If this fails, the fix is almost always: make the same edit to `build:ci` that
// was just made to `build`, keeping its lower cap.

import { readFileSync } from 'node:fs';

const CAP = /--max-old-space-size=(\d+)/;

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const build = pkg.scripts?.build;
const buildCi = pkg.scripts?.['build:ci'];

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  console.error(`\n  build    : ${build}`);
  console.error(`  build:ci : ${buildCi}\n`);
  process.exit(1);
};

if (!build) fail('package.json has no "build" script.');
if (!buildCi) fail('package.json has no "build:ci" script — the Production Build gate runs it.');

const capOf = (s) => {
  const m = s.match(CAP);
  return m ? Number(m[1]) : null;
};

const buildCap = capOf(build);
const ciCap = capOf(buildCi);

if (buildCap === null) fail('"build" no longer sets --max-old-space-size; this guard assumes it does.');
if (ciCap === null) fail('"build:ci" no longer sets --max-old-space-size — it would inherit no cap at all.');

// Everything except the cap number must match exactly.
const normalise = (s) => s.replace(CAP, '--max-old-space-size=<CAP>');
if (normalise(build) !== normalise(buildCi)) {
  fail(
    'build:ci has drifted from build. They must run the SAME steps and differ only in the heap cap.\n' +
      '  A step added to `build` must be added to `build:ci` too, or the Production Build gate\n' +
      '  is no longer compiling what Vercel compiles.'
  );
}

// A CI cap at or above the production cap defeats the point: the gate exists
// because 12288 on a 15 GiB runner lets V8 fill the box before it collects.
if (ciCap >= buildCap) {
  fail(
    `build:ci's cap (${ciCap}) is not lower than build's (${buildCap}).\n` +
      '  The lower cap is the reason the CI build fits on a standard runner — V8 collects\n' +
      '  sooner, so total memory stays under physical RAM. Raising it re-creates the OOM.'
  );
}

console.log('✓ build:ci matches build step-for-step');
console.log(`  build     cap ${buildCap} (what Vercel runs — untouched)`);
console.log(`  build:ci  cap ${ciCap} (what CI runs)`);
