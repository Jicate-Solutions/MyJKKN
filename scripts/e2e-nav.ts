/**
 * e2e-nav — generate a per-persona E2E navigation skeleton from the smart-guide.
 *
 * Workflow 2 of guide-driven-testing. The guide's `journey` strip + ordered
 * `sections` give you, per persona, the SEQUENCE of screens a real user walks —
 * i.e. test NAMES and NAVIGATION ORDER, derived from the same oracle the smoke
 * gate uses. This script reads that oracle and EMITS a Playwright spec: one
 * `test.describe(persona)` block per lane, one ordered `test("navigates to
 * <section.title>")` per section, each driving a real authed browser to that
 * section's first deep-link.
 *
 * WHAT THIS CATCHES THAT THE STATIC SMOKE CANNOT: a route that resolves on the
 * filesystem (so the static gate passes) but 500s / hangs / bounces a valid
 * persona to login at RUNTIME. The static gate proves the href maps to a file;
 * this proves the screen actually opens for the right role.
 *
 * THE BOUNDARY (do not over-read this): this yields navigation + descriptive
 * names ONLY. It does NOT write selectors, form inputs, or content assertions —
 * those need the real DOM and are hand-authored. The skeleton removes the
 * "what do I test and in what order" tedium; it is the scaffold, not the test.
 * Copy the generated `.generated.spec.ts` into your own spec to add assertions.
 *
 * AUTH + multi-role login is wired in e2e/auth.setup.ts (the Playwright `setup`
 * project): it mints a `<persona>.json` storageState per persona by logging in
 * through the dev-only /auth/test-login page (mapping in e2e/persona-accounts.ts).
 * Set GUIDE_E2E_AUTHED=1 to enable it; the generated spec then loads each
 * persona's storageState and runs the "did this bounce me to login?" assertion —
 * but ONLY for personas whose storageState was actually minted (it checks the
 * file exists). Personas with no mapped account, or a run with auth off, still
 * catch 404/5xx — they just skip the login-bounce assertion (a login page is 200).
 *
 * ── ADAPT THESE PER APP (the only per-app edits) ───────────────────────────
 *   1. THE GUIDE IMPORT (below). Same two shapes as guide-smoke.ts:
 *        • Composed platform → `composeGuideBook()` from the registry.
 *        • Single-app install → the `GUIDES` book from content.ts.
 *      Set `loadBook()` to whichever your app uses.
 *   2. OUT_FILE — where to write the generated spec (default e2e/).
 *   3. GUIDE_E2E_LOGIN_PATH — the route an unauthorized viewer is sent to, so
 *      the gate-match assertion knows what "bounced to login" looks like.
 *
 * RUN:  npx tsx scripts/e2e-nav.ts            # writes e2e/guide-nav.generated.spec.ts
 *       npx playwright test e2e/guide-nav.generated.spec.ts
 *
 * Exit codes: 0 = spec written, 2 = setup error (empty oracle / cannot write).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GuideBook, PersonaGuide, GuideSection } from "@/lib/guide/types";

/* ── ADAPT #1: load the composed guide book. Swap to GUIDES for single-app. ── */
import { composeGuideBook } from "@/lib/guide/registry";
function loadBook(): GuideBook {
  return composeGuideBook();
  // Single-app install instead:
  //   import { GUIDES } from "@/lib/<ns>/guide/content";
  //   return GUIDES;
}

/* ── ADAPT #2 + #3 ─────────────────────────────────────────────────────────── */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "e2e", "guide-nav.generated.spec.ts");
const DEFAULT_LOGIN_PATH = "/auth/login";

interface NavStop {
  sectionId: string;
  /** Section heading → the test name. */
  title: string;
  /** Navigation target (normalized; `:scopeId` resolved to parent or env id). */
  href: string;
  /** effective gate (section.requires ?? lane.requires ?? "open"), for the message. */
  requires: string;
}

interface LaneNav {
  persona: string;
  /** Lane title, e.g. "Admin Guide" → the describe() name. */
  title: string;
  requires: string;
  stops: NavStop[];
}

/** Normalize a guide href for a real browser nav: strip query/hash; resolve a
 *  `:scopeId` token to a real id from env if provided, else to its parent list
 *  route (so the nav still exercises a real authed screen); drop trailing slash. */
function normalizeHref(href: string): string {
  let h = href.split("#")[0].split("?")[0];
  if (h.includes(":scopeId")) {
    const id = process.env.GUIDE_E2E_SCOPE_ID;
    h = id ? h.split(":scopeId").join(id) : h.slice(0, h.indexOf(":scopeId")).replace(/\/$/, "");
  }
  if (h.length > 1) h = h.replace(/\/$/, "");
  return h;
}

/* ── Build the per-persona ordered nav list from the (composed) guide ─────────
 * One stop per section = that section's FIRST step that carries a link.href
 * (the section's entry screen). The lane's `startHere` becomes the first stop. */

function buildLaneNavs(book: GuideBook): LaneNav[] {
  const lanes: LaneNav[] = [];
  for (const [persona, lane] of Object.entries(book.lanes) as [string, PersonaGuide][]) {
    const laneReq = lane.requires ?? "open";
    const stops: NavStop[] = [];

    if (lane.startHere?.href) {
      stops.push({ sectionId: "start-here", title: "Start here", href: normalizeHref(lane.startHere.href), requires: laneReq });
    }
    for (const section of lane.sections as GuideSection[]) {
      const sectionReq = (section as { requires?: string }).requires ?? laneReq;
      const firstLinked = section.steps.find((s) => s.link?.href);
      if (firstLinked?.link?.href) {
        stops.push({ sectionId: section.id, title: section.title, href: normalizeHref(firstLinked.link.href), requires: sectionReq });
      }
    }
    if (stops.length > 0) lanes.push({ persona, title: lane.title, requires: laneReq, stops });
  }
  return lanes;
}

/* ── Emit a Playwright spec. We build plain statements with JSON.stringify'd
 *  literals — NO nested template literals — so emitted hrefs/titles can never
 *  break this generator's own string. */

function emitSpec(lanes: LaneNav[]): string {
  const L: string[] = [];
  const q = (s: string) => JSON.stringify(s);

  L.push(`// AUTO-GENERATED by guide-driven-testing/e2e-nav.ts — do NOT hand-edit.`);
  L.push(`// Regenerate: npx tsx scripts/e2e-nav.ts. To add selectors/assertions,`);
  L.push(`// COPY a describe block into your own spec; this file is overwritten.`);
  L.push(`//`);
  L.push(`// Nav-only skeleton: each test opens one guided screen and asserts it`);
  L.push(`// renders (not 404/5xx) and — when GUIDE_E2E_AUTHED=1 AND a storageState`);
  L.push(`// was minted for that persona (e2e/auth.setup.ts) — that a valid persona`);
  L.push(`// is NOT bounced to login (the gate-match check). Personas with no minted`);
  L.push(`// storageState run nav-only.`);
  L.push(``);
  L.push(`import { test, expect } from "@playwright/test";`);
  L.push(`import fs from "node:fs";`);
  L.push(`import path from "node:path";`);
  L.push(``);
  L.push(`const BASE = process.env.GUIDE_E2E_BASE ?? "http://localhost:3104";`);
  L.push(`const LOGIN_PATH = process.env.GUIDE_E2E_LOGIN_PATH ?? ${q(DEFAULT_LOGIN_PATH)};`);
  L.push(`const AUTH_DIR = process.env.GUIDE_E2E_AUTH_DIR ?? ".auth";`);
  L.push(`const AUTHED = !!process.env.GUIDE_E2E_AUTHED;`);
  L.push(``);

  for (const lane of lanes) {
    // A JS-safe boolean per lane: authed iff GUIDE_E2E_AUTHED=1 AND that persona's
    // storageState file exists (minted by e2e/auth.setup.ts). Personas with no
    // mapped test account never get a file, so this stays false → they run nav-only
    // and never crash on a missing storageState.
    const authVar = `authed_${lane.persona.replace(/[^a-z0-9]/gi, "_")}`;
    const stateFile = q(`${lane.persona}.json`);
    L.push(`// ${lane.persona}: authed iff GUIDE_E2E_AUTHED=1 AND a storageState was minted for`);
    L.push(`// it (e2e/auth.setup.ts). Unmapped personas have no file → stays false → nav-only.`);
    L.push(`const ${authVar} = AUTHED && fs.existsSync(path.join(AUTH_DIR, ${stateFile}));`);
    L.push(`test.describe(${q(`${lane.title} (persona: ${lane.persona}, gate: ${lane.requires})`)}, () => {`);
    L.push(`  if (${authVar}) test.use({ storageState: path.join(AUTH_DIR, ${stateFile}) });`);
    L.push(``);
    for (const stop of lane.stops) {
      const name = `navigates to ${stop.title}`;
      L.push(`  test(${q(name)}, async ({ page }) => {`);
      L.push(`    const res = await page.goto(BASE + ${q(stop.href)});`);
      L.push(`    expect(res, ${q(`no response for ${stop.href}`)}).toBeTruthy();`);
      L.push(`    expect(res!.status(), ${q(`${stop.href} returned an error status`)}).toBeLessThan(400);`);
      L.push(`    if (${authVar}) {`);
      L.push(`      expect(new URL(page.url()).pathname, ${q(`${stop.href} bounced a valid ${lane.persona} to login — page guard is stricter than guide.requires=${stop.requires}`)}).not.toBe(LOGIN_PATH);`);
      L.push(`    }`);
      L.push(`  });`);
    }
    L.push(`});`);
    L.push(``);
  }
  return L.join("\n");
}

async function main(): Promise<number> {
  const lanes = buildLaneNavs(loadBook());
  const stopCount = lanes.reduce((n, l) => n + l.stops.length, 0);
  if (stopCount === 0) {
    console.error(`✖ extracted 0 navigable stops from the guide — is the registry/content wired (loadBook), and do any steps have link.href?`);
    return 2;
  }
  try {
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, emitSpec(lanes) + "\n", "utf8");
  } catch (e) {
    console.error(`✖ could not write ${OUT_FILE}: ${(e as Error).message}`);
    return 2;
  }
  console.log(`✓ wrote ${path.relative(process.cwd(), OUT_FILE)} — ${lanes.length} persona block(s), ${stopCount} nav stop(s)`);
  console.log(`  run: npx playwright test ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`  auth: set GUIDE_E2E_AUTHED=1 + GUIDE_E2E_AUTH_DIR=<dir of <persona>.json> to enable the login-bounce check`);
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e);
  process.exit(2);
});
