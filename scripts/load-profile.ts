/**
 * load-profile — generate a k6 load scenario from the smart-guide. STAGING ONLY.
 *
 * Workflow 3 of guide-driven-testing. The route list, WEIGHTED by how many
 * personas deep-link each route, is a realistic traffic model: a route every
 * persona's dashboard links to (hot) gets more weight than a single-admin
 * settings page (cold). This script reads the oracle and EMITS a k6 script with
 * one scenario per persona, each persona hitting its own routes, hot routes
 * naturally over-represented by their cross-persona link count.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ INVARIANT — STAGING ONLY, NEVER PRODUCTION.                               ║
 * ║ The app's `.env.local` is typically prod-connected; a load test fired at  ║
 * ║ a prod base URL hammers the LIVE database. The EMITTED k6 script REFUSES  ║
 * ║ any BASE_URL matching jkkn.ai / vercel.app unless GUIDE_LOAD_ALLOW_REMOTE ║
 * ║ is set (documented staging-only override). State this to the user EVERY   ║
 * ║ time you emit a load profile.                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── ADAPT THESE PER APP ────────────────────────────────────────────────────
 *   1. THE GUIDE IMPORT (below) — composeGuideBook() or GUIDES, as in the
 *      other templates.
 *   2. OUT_FILE — where to write the k6 script (default load/).
 *   3. VUS / DURATION — the per-persona virtual-user count and run length.
 *      Defaults are deliberately gentle (2 VUs, 30s); scale on staging only.
 *
 * RUN:  npx tsx scripts/load-profile.ts                 # writes load/guide-load.js
 *       k6 run -e BASE_URL=https://staging.example.app load/guide-load.js
 *       # auth: -e GUIDE_LOAD_COOKIE='<session-cookie>' to hit gated routes as a user
 *
 * Exit codes: 0 = script written, 2 = setup error (empty oracle / cannot write).
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
const OUT_FILE = path.join(ROOT, "load", "guide-load.js");
const VUS = 2;
const DURATION = "30s";

/** Normalize an href to a GET-able path: strip query/hash, resolve `:scopeId`
 *  to its parent list route (no real id to load-test), drop trailing slash. */
function normalizeHref(href: string): string {
  let h = href.split("#")[0].split("?")[0];
  if (h.includes(":scopeId")) h = h.slice(0, h.indexOf(":scopeId")).replace(/\/$/, "");
  if (h.length > 1) h = h.replace(/\/$/, "");
  return h;
}

/** Collect, per persona, the set of routes that persona's lane deep-links; and
 *  globally, how many DISTINCT personas link each route (the weight). */
function buildTraffic(book: GuideBook): { perPersona: Record<string, string[]>; weight: Record<string, number> } {
  const perPersonaSet: Record<string, Set<string>> = {};
  for (const [persona, lane] of Object.entries(book.lanes) as [string, PersonaGuide][]) {
    const set = new Set<string>();
    if (lane.startHere?.href) set.add(normalizeHref(lane.startHere.href));
    for (const section of lane.sections as GuideSection[]) {
      for (const step of section.steps) {
        if (step.link?.href) set.add(normalizeHref(step.link.href));
      }
    }
    set.delete("/"); // app root — not a meaningful load target
    set.delete("");
    perPersonaSet[persona] = set;
  }
  const weight: Record<string, number> = {};
  for (const set of Object.values(perPersonaSet)) {
    for (const route of set) weight[route] = (weight[route] ?? 0) + 1;
  }
  // Bake the cross-persona weight INTO each persona's pool: a route is repeated
  // `weight[route]` times, so a screen many personas share is picked more often
  // even within one persona's scenario (hot routes stay hot).
  const perPersona: Record<string, string[]> = {};
  for (const [persona, set] of Object.entries(perPersonaSet)) {
    const pool: string[] = [];
    for (const route of set) for (let i = 0; i < (weight[route] ?? 1); i++) pool.push(route);
    perPersona[persona] = pool;
  }
  return { perPersona, weight };
}

/* ── Emit the k6 script. Built with JSON.stringify'd values — no nested
 *  template literals — so emitted route strings can't break this generator. */

function emitK6(perPersona: Record<string, string[]>): string {
  const personas = Object.keys(perPersona).filter((p) => perPersona[p].length > 0);
  const L: string[] = [];

  L.push(`// AUTO-GENERATED by guide-driven-testing/load-profile.ts — STAGING ONLY.`);
  L.push(`// Regenerate: npx tsx scripts/load-profile.ts`);
  L.push(`// Traffic model: routes weighted by how many personas deep-link them.`);
  L.push(`import http from "k6/http";`);
  L.push(`import { check, sleep } from "k6";`);
  L.push(``);
  L.push(`const BASE = __ENV.BASE_URL || "http://localhost:3104";`);
  L.push(`const COOKIE = __ENV.GUIDE_LOAD_COOKIE || "";`);
  L.push(`const PROD = /jkkn\\.ai|vercel\\.app/;`);
  L.push(`const LOCAL = /localhost|127\\.0\\.0\\.1/;`);
  L.push(``);
  L.push(`// INVARIANT — refuse production. Aborts the whole run in setup().`);
  L.push(`export function setup() {`);
  L.push(`  if (PROD.test(BASE) && !LOCAL.test(BASE) && !__ENV.GUIDE_LOAD_ALLOW_REMOTE) {`);
  L.push(`    throw new Error("refusing to load-test " + BASE + " — looks like prod/preview. STAGING ONLY. Set GUIDE_LOAD_ALLOW_REMOTE=1 to override (staging, never prod).");`);
  L.push(`  }`);
  L.push(`  return {};`);
  L.push(`}`);
  L.push(``);
  L.push(`const ROUTES = ${JSON.stringify(Object.fromEntries(personas.map((p) => [p, perPersona[p]])), null, 2)};`);
  L.push(``);
  L.push(`export const options = {`);
  L.push(`  scenarios: {`);
  for (const p of personas) {
    L.push(`    ${JSON.stringify(p)}: { executor: "constant-vus", exec: ${JSON.stringify("hit_" + safeIdent(p))}, vus: ${VUS}, duration: ${JSON.stringify(DURATION)} },`);
  }
  L.push(`  },`);
  L.push(`};`);
  L.push(``);
  L.push(`function hit(routes) {`);
  L.push(`  const path = routes[Math.floor(Math.random() * routes.length)];`);
  L.push(`  const res = http.get(BASE + path, { headers: COOKIE ? { Cookie: COOKIE } : {} });`);
  L.push(`  // 404 = stale guide href; 5xx = the route errored under load. Both fail the check.`);
  L.push(`  check(res, { "status not 404/5xx": (r) => r.status !== 404 && r.status < 500 });`);
  L.push(`  sleep(1);`);
  L.push(`}`);
  L.push(``);
  for (const p of personas) {
    L.push(`export function hit_${safeIdent(p)}() { hit(ROUTES[${JSON.stringify(p)}]); }`);
  }
  return L.join("\n");
}

/** k6 exec names must be valid JS identifiers; persona keys may contain `-`/`:`. */
function safeIdent(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

async function main(): Promise<number> {
  const { perPersona, weight } = buildTraffic(loadBook());
  const routeCount = Object.keys(weight).length;
  if (routeCount === 0) {
    console.error(`✖ extracted 0 routes from the guide — is the registry/content wired (loadBook), and do any steps have link.href?`);
    return 2;
  }
  try {
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, emitK6(perPersona) + "\n", "utf8");
  } catch (e) {
    console.error(`✖ could not write ${OUT_FILE}: ${(e as Error).message}`);
    return 2;
  }
  const hot = Object.entries(weight).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, w]) => `${r}×${w}`).join(", ");
  const scenarioCount = Object.values(perPersona).filter((a) => a.length > 0).length;
  console.log(`✓ wrote ${path.relative(process.cwd(), OUT_FILE)} — ${scenarioCount} persona scenario(s) (${Object.keys(perPersona).length - scenarioCount} sparse persona(s) skipped), ${routeCount} distinct routes`);
  console.log(`  hottest: ${hot}`);
  console.log(`  ⚠ STAGING ONLY — run: k6 run -e BASE_URL=https://<staging> ${path.relative(process.cwd(), OUT_FILE)} (the script refuses prod hosts)`);
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e);
  process.exit(2);
});
