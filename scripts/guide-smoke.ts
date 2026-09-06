/**
 * guide-smoke — turn the smart-guide content into a smoke test.
 *
 * The smart-guide is pure data: every module's `lib/<module>/guide/content.ts`
 * encodes each screen's deep-link `href` and the permission/persona that gates it.
 * `composeGuideBook()` returns the closed set across all 9 canonical personas.
 * That gives us, for free and always current, a route inventory + authorization
 * matrix — exactly what a smoke test needs.
 *
 * TWO MODES:
 *
 *   1. STATIC (default, no server, CI-friendly):
 *        npx tsx scripts/guide-smoke.ts
 *      Asserts every guide deep-link resolves to a real page under app/(routes)
 *      (dynamic `[seg]` routes match; `:scopeId` tokens are resolved to their list
 *      route). Fails (exit 1) on any unresolved href — catches a guide link going
 *      stale as routes move. This is the gap the existing nav gates DON'T cover:
 *      they check sidebar reachability, not that the GUIDE's hrefs are still real.
 *
 *   2. HTTP (runtime, needs a running authed server — local or STAGING, never prod):
 *        GUIDE_SMOKE_COOKIE='<session-cookie>' \
 *          npx tsx scripts/guide-smoke.ts --http --base http://localhost:3104
 *      GETs every guide href against the server with the provided session cookie
 *      and asserts the response is not 404/5xx. As a super-admin (director) session,
 *      every gated screen should render → this catches routes that 500 for an
 *      authed admin. (`scripts/local-auth.sh` can mint the director session cookie.)
 *      SAFETY: never point --base at production — `.env.local` is prod-connected;
 *      run against a local dev server or a staging deploy only.
 *
 * Exit codes: 0 = all good, 1 = one or more failures, 2 = usage/setup error.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { composeGuideBook } from "@/lib/guide/registry";
import type { GuideBook, PersonaGuide, GuideSection } from "@/lib/guide/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = path.join(ROOT, "app", "(routes)");

interface GuideHref {
  href: string;
  persona: string;
  /** the effective gate (section.requires ?? lane.requires ?? "open"), for reporting */
  requires: string;
  /** where it came from, for a useful failure message */
  source: string;
}

/* ── 1. Extract every deep-link href from the composed guide ─────────────── */

function extractHrefs(book: GuideBook): GuideHref[] {
  const out: GuideHref[] = [];
  for (const [persona, lane] of Object.entries(book.lanes) as [string, PersonaGuide][]) {
    const laneReq = lane.requires;
    if (lane.startHere?.href) {
      out.push({ href: lane.startHere.href, persona, requires: laneReq ?? "open", source: `${persona}/startHere` });
    }
    for (const section of lane.sections as GuideSection[]) {
      const req = section.requires ?? laneReq ?? "open";
      for (let i = 0; i < section.steps.length; i++) {
        const link = section.steps[i].link;
        if (link?.href) {
          out.push({ href: link.href, persona, requires: req, source: `${persona}/${section.id}#${i}` });
        }
      }
    }
  }
  return out;
}

/** Normalize a guide href for resolution: strip query/hash, resolve `:scopeId`
 *  to its parent list route (we have no real id to test), drop trailing slash. */
function normalizeHref(href: string): string {
  let h = href.split("#")[0].split("?")[0];
  if (h.includes(":scopeId")) h = h.slice(0, h.indexOf(":scopeId")).replace(/\/$/, "");
  if (h.length > 1) h = h.replace(/\/$/, "");
  return h;
}

/* ── 2. Build the real route set from the filesystem ─────────────────────── */

const PAGE = /^page\.(tsx|ts|jsx|js)$/;
const ROUTE = /^route\.(tsx|ts|jsx|js)$/;
const GROUP = /^\(.*\)$/; // route group, e.g. (routes) — not part of the URL

/** Walk app/(routes) and collect every route path as an array of segments,
 *  keeping `[seg]` segments as dynamic wildcards and dropping route groups. */
async function collectRoutes(dir: string, segs: string[], acc: string[][]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  let served = entries.some((e) => e.isFile() && PAGE.test(e.name));
  if (!served) {
    // A GET-exporting Route Handler serves the path with a real HTTP 307
    // (pure-redirect landing pattern, PR #2763/#2777) — reachable exactly
    // like a page.tsx. Non-GET handlers don't serve a navigable document.
    const routeFile = entries.find((e) => e.isFile() && ROUTE.test(e.name));
    if (routeFile) {
      try {
        const src = await fs.readFile(path.join(dir, routeFile.name), "utf8");
        served = /export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(src);
      } catch {
        /* unreadable route file — treat as not serving */
      }
    }
  }
  if (served) acc.push(segs);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("@") || e.name.startsWith("_")) continue; // parallel/private
    const next = GROUP.test(e.name) ? segs : [...segs, e.name];
    await collectRoutes(path.join(dir, e.name), next, acc);
  }
}

/** Does a normalized href match a route's segment pattern? Literal segs must be
 *  equal; a `[x]` route segment matches any single href segment. */
function matches(hrefSegs: string[], routeSegs: string[]): boolean {
  if (hrefSegs.length !== routeSegs.length) return false;
  for (let i = 0; i < hrefSegs.length; i++) {
    const r = routeSegs[i];
    if (r.startsWith("[") && r.endsWith("]")) continue; // dynamic — matches anything
    if (r !== hrefSegs[i]) return false;
  }
  return true;
}

/* ── 3a. STATIC mode ─────────────────────────────────────────────────────── */

async function runStatic(hrefs: GuideHref[]): Promise<number> {
  // Walk app/ once — collectRoutes descends into the `(routes)` group without
  // adding it to the path, so this covers both app/page.tsx (root "/") and every
  // app/(routes)/**/page.tsx, with no double-counting.
  const routes: string[][] = [];
  await collectRoutes(path.join(ROOT, "app"), [], routes);
  if (routes.length === 0) {
    console.error(`✖ no routes found under ${ROUTES_DIR} — run from the repo root.`);
    return 2;
  }
  const unique = new Map<string, GuideHref>();
  for (const g of hrefs) unique.set(normalizeHref(g.href), g);

  const fails: GuideHref[] = [];
  for (const [norm, g] of unique) {
    if (norm === "/" || norm === "") continue; // app root — always valid
    const segs = norm.split("/").filter(Boolean);
    if (!routes.some((r) => matches(segs, r))) fails.push({ ...g, href: norm });
  }

  console.log(`guide-smoke (static): ${unique.size} unique guide hrefs vs ${routes.length} real routes`);
  if (fails.length === 0) {
    console.log(`✓ all ${unique.size} guide deep-links resolve to a real route`);
    return 0;
  }
  console.error(`\n✖ ${fails.length} guide deep-link(s) do NOT resolve to any route:`);
  for (const f of fails) console.error(`   ${f.href}   (from ${f.source}, gate: ${f.requires})`);
  console.error(`\nFix: update the href in the module's content.ts, or restore the route.`);
  return 1;
}

/* ── 3b. HTTP mode ───────────────────────────────────────────────────────── */

async function runHttp(hrefs: GuideHref[], base: string): Promise<number> {
  if (/jkkn\.ai|vercel\.app/.test(base) && !process.env.GUIDE_SMOKE_ALLOW_REMOTE) {
    console.error(`✖ refusing to smoke-test ${base} — looks like prod/preview. Set GUIDE_SMOKE_ALLOW_REMOTE=1 to override (staging only).`);
    return 2;
  }
  const cookie = process.env.GUIDE_SMOKE_COOKIE ?? "";
  if (!cookie) console.warn(`! GUIDE_SMOKE_COOKIE not set — requests are UNauthenticated; gated routes will redirect to login (treated as a pass only if not 404/5xx).`);

  const unique = new Map<string, GuideHref>();
  for (const g of hrefs) unique.set(normalizeHref(g.href), g);

  const fails: { href: string; status: number | string; source: string }[] = [];
  let ok = 0;
  for (const [norm] of unique) {
    const url = base.replace(/\/$/, "") + norm;
    try {
      const res = await fetch(url, { headers: cookie ? { cookie } : {}, redirect: "manual" });
      const s = res.status;
      // 404 = stale href; 5xx = the route errored for this session. Both fail.
      if (s === 404 || s >= 500) fails.push({ href: norm, status: s, source: unique.get(norm)!.source });
      else ok++;
    } catch (e) {
      fails.push({ href: norm, status: `ERR ${(e as Error).message}`, source: unique.get(norm)!.source });
    }
  }

  console.log(`guide-smoke (http ${base}): ${ok} ok, ${fails.length} failed of ${unique.size}`);
  if (fails.length === 0) {
    console.log(`✓ every guide href returned a non-error status`);
    return 0;
  }
  console.error(`\n✖ ${fails.length} guide href(s) returned 404/5xx:`);
  for (const f of fails) console.error(`   [${f.status}] ${f.href}   (from ${f.source})`);
  return 1;
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const http = args.includes("--http");
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : process.env.GUIDE_SMOKE_BASE ?? "http://localhost:3104";

  const hrefs = extractHrefs(composeGuideBook());
  if (hrefs.length === 0) {
    console.error(`✖ extracted 0 hrefs from the composed guide — is the registry wired?`);
    return 2;
  }
  return http ? runHttp(hrefs, base) : runStatic(hrefs);
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e);
  process.exit(2);
});
