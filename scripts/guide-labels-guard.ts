/**
 * guide-labels-guard — every module's guide lanes must carry their OWN labels.
 *
 * The platform guide (lib/guide/registry.ts) maps each module's lanes onto the
 * shared canonical personas. If a lane omits a per-module `title`/`tagline`,
 * `composeModuleLane` falls back to the generic CANONICAL_LANES label — so that
 * module's scoped guide (/guide?module=<id>) reads "Running your unit" instead
 * of "Champion Guide", "Getting started" instead of "Student Guide", etc.
 *
 * That regression — a module's own guide speaking generic platform language — is
 * invisible to tsc and to the deep-link smoke gate. THIS guard makes it
 * impossible to ship: every lane a module fills MUST set an explicit title +
 * tagline (source them from the module's own content.ts so they stay in sync).
 *
 * Why this exists: when modules were first folded into the platform guide they
 * were ALL generic — the labels were only restored module-by-module. Without a
 * gate, the next module added (or a lane added to an existing one) silently
 * reverts to generic. See the aiPulseGuide entry for the canonical pattern.
 *
 * Exit: 0 = every module carries its own labels, 1 = one or more lanes missing.
 */
import { REGISTRY } from "@/lib/guide/registry";

const failures: string[] = [];

for (const mod of REGISTRY) {
  for (const [persona, frag] of Object.entries(mod.lanes)) {
    if (!frag) continue; // a persona a module doesn't fill — nothing to label
    if (typeof frag.title !== "string" || frag.title.trim() === "") {
      failures.push(
        `${mod.module} / ${persona} — missing module-specific lane \`title\` (would fall back to the generic canonical label)`
      );
    }
    if (typeof frag.tagline !== "string" || frag.tagline.trim() === "") {
      failures.push(`${mod.module} / ${persona} — missing module-specific \`tagline\``);
    }
  }
}

if (failures.length > 0) {
  console.error(
    `\n✖ ${failures.length} guide module lane(s) carry NO module-specific label — their scoped guide would show a generic platform label (e.g. "Running your unit" instead of "Champion Guide"):\n`
  );
  for (const f of failures) console.error(`   ${f}`);
  console.error(
    `\nFix: in lib/guide/registry.ts add \`title:\` and \`tagline:\` to that lane, sourced from the\n` +
      `module's own content.ts — e.g. \`title: <MODULE>_GUIDES.lanes.<source>.title\` (use bracket\n` +
      `notation for hyphenated source keys, e.g. HR_GUIDES.lanes["hr-admin"].title). See aiPulseGuide\n` +
      `for the canonical example.\n`
  );
  process.exit(1);
}

const laneCount = REGISTRY.reduce((n, m) => n + Object.keys(m.lanes).length, 0);
console.log(
  `✓ guide module-label guard: all ${REGISTRY.length} modules carry their own lane labels on every lane they fill (${laneCount} lanes checked).`
);
process.exit(0);
