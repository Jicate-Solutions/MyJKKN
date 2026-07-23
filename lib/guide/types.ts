/**
 * Smart Guide — SHARED CANONICAL contract (PURE DATA, framework-neutral).
 *
 * This is the ONE contract that every MyJKKN module guide composes into. It is
 * byte-near-identical to the per-module `lib/<module>/guide/types.ts` files
 * (AI Pulse / Campus Living / PDE) — those three differ from each other ONLY in
 * their per-module `GuidePersona` union. This file replaces that per-module
 * union with a CLOSED canonical persona union (9 personas) so the three module
 * guides can be merged into ONE guide composed PER CANONICAL PERSONA.
 *
 * Modules contribute SECTIONS into canonical lanes; lane IDENTITY (title +
 * tagline) is canonical (registry-defined), not per-module. See registry.ts.
 *
 * NO "use server", NO JSX, NO I/O — safe to import from client AND server,
 * which is what lets the same model feed every surface (page / drawer / FAB).
 */

/* ────────────────────────────────────────────────────────────────────────
 * 1. CANONICAL PERSONAS — the CLOSED union (exactly 9, in this order).
 *
 * Every module remaps its own lanes onto these. New verticals reuse these
 * personas rather than inventing their own — that is the whole point of the
 * composition layer.
 * ──────────────────────────────────────────────────────────────────────── */
export type CanonicalPersona =
  | "learner"
  | "facilitator"
  | "unit-lead"
  | "coordinator"
  | "supervisor"
  | "module-admin"
  | "platform-admin"
  | "parent"
  | "external";

export const CANONICAL_PERSONAS: readonly CanonicalPersona[] = [
  "learner",
  "facilitator",
  "unit-lead",
  "coordinator",
  "supervisor",
  "module-admin",
  "platform-admin",
  "parent",
  "external",
] as const;

/* ────────────────────────────────────────────────────────────────────────
 * 2. STEP / SECTION model (from YIP — the durable launchpad shape)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A "Take me there →" deep link for a single step.
 * `href` MAY contain the literal token `:scopeId` (e.g. an eventId / projectId
 * / tenantId), resolved at render time against the viewer's current scope.
 * When a link needs a scope and none is in context, the renderer HIDES the
 * link (or falls back to a hub route) rather than producing a broken URL.
 */
export interface GuideLink {
  /** Button label, e.g. "Open Allocation". */
  label: string;
  /** App route. May contain `:scopeId`. */
  href: string;
}

/** Optional screenshot for a step (from AI Pulse). Use sparingly — live shots
 *  rot. Reserve for stable "entry moment" screens. Assets in public/<ns>/guides/. */
export interface GuideImage {
  src: string;
  alt: string;
  /** Intrinsic px size — drives aspect ratio so layout doesn't jump. */
  width: number;
  height: number;
  /**
   * A box drawn OVER the screenshot marking the exact control the step refers
   * to — the "tap here" annotation, but as CODE not baked into the PNG, so a
   * re-shot screen only needs the box nudged, not re-annotated in an image
   * editor. Coordinates are PERCENTAGES of the image (0–100) so they survive a
   * rescale. A plain shot of a busy screen doesn't tell a newcomer where to
   * look — if you embed an image, give it a `highlight` or don't embed it.
   */
  highlight?: {
    /** % from the left edge to the box's left side. */
    x: number;
    /** % from the top edge to the box's top side. */
    y: number;
    /** box width, as % of the image width. */
    width: number;
    /** box height, as % of the image height. */
    height: number;
    /** optional caption pinned above the box, e.g. "Tap here". */
    label?: string;
  };
}

export interface GuideStep {
  /**
   * Stable id for progress tracking (optional). If omitted the renderer uses
   * `"<sectionId>:<index>"` — fine for a stable guide, but set an explicit id
   * if you might reorder steps, so a user's saved completion doesn't shift onto
   * the wrong step. See `stepKey()`.
   */
  id?: string;
  /** Imperative one-liner — the single thing to do. May contain `**bold**`. */
  action: string;
  /** One sentence of plain-language help (optional). May contain `**bold**`. */
  detail?: string;
  /** A highlighted tip / watch-out (optional). May contain `**bold**`. */
  tip?: string;
  /**
   * A MUST-DO-FIRST prerequisite — stronger than `tip`: the thing that blocks
   * everything if skipped ("Turn on notifications first", "You need your access
   * code before you can sign in"). Rendered as a prominent "Required" callout,
   * not a soft aside. May contain `**bold**`.
   */
  prerequisite?: string;
  /**
   * When the path differs by platform (web app vs mobile app), spell out each.
   * The step's `link` stays the canonical web target; this just tells a phone
   * user the different route. Omit when the path is the same everywhere — most
   * steps don't need it.
   */
  platforms?: {
    /** Where to find it on the web app, e.g. "left sidebar → Settings". */
    web?: string;
    /** Where to find it in the mobile app, e.g. "tap ☰ → Settings". */
    mobile?: string;
  };
  /** "Take me there" link to the real page this step describes (optional). */
  link?: GuideLink;
  /** A screenshot of this moment (optional — use rarely; give it a `highlight`). */
  image?: GuideImage;
}

export interface GuideSection {
  /** Stable kebab-case anchor id. */
  id: string;
  /** Short, action-oriented heading, e.g. "Set up the season". */
  title: string;
  steps: GuideStep[];
  /**
   * OPAQUE permission key gating whether this SECTION is shown to the viewer.
   * Undefined → the section is shown to everyone in the lane. When set, the
   * renderer only shows the section if the viewer holds the permission
   * (fail-closed). This is the section-level analogue of `PersonaGuide.requires`
   * — it exists so that when a module collapses MULTIPLE of its original lanes
   * into ONE canonical lane (e.g. Campus Living warden + mess → unit-lead), each
   * group of sections can still be scoped to the permission that unlocked its
   * original lane. NEVER split this string on a separator — keys are opaque
   * (AI Pulse uses ':' , others use '.').
   */
  requires?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. PERSONA LANE (YIP journey + AI Pulse why-it-matters + permission scope)
 * ──────────────────────────────────────────────────────────────────────── */
export interface PersonaGuide {
  persona: CanonicalPersona;
  /** Lane title, e.g. "Getting started". */
  title: string;
  /** One line: what this person does on the platform. */
  tagline: string;
  /**
   * AI Pulse "why this matters" — the stake. Rendered as a callout at the top
   * of the lane so the reader knows why to care. Optional.
   */
  whyItMatters?: string;
  /**
   * The single prominent "Start here" button shown at the top of the lane
   * (next to whyItMatters) — the one tap that pulls the reader into the
   * product. Optional but recommended: this is the adoption hook. `href` may
   * contain `:scopeId` like any other link.
   */
  startHere?: GuideLink;
  /**
   * Permission key gating whether this lane is OFFERED to a viewer who is NOT
   * this persona. Undefined → lane is shown to everyone (instructional). When
   * set, the renderer only lists the lane if `can(requires)` is true (or the
   * viewer IS this persona, or is super-admin). See auth-adapters.md.
   */
  requires?: string;
  /** Public path to a downloadable PDF (optional — print-to-PDF works without). */
  pdfPath?: string;
  /** The whole arc as a few short phrases — rendered as a numbered strip. */
  journey: string[];
  sections: GuideSection[];
}

/** A glossary term (AI Pulse "Words to know") — decodes jargon once, up front. */
export interface GlossaryTerm {
  term: string;
  def: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3b. MODULE FRAGMENT + ROUTE PATTERN (the composition inputs)
 *
 * A module does NOT ship a whole GuideBook into the canonical layer — it ships
 * a FRAGMENT: the sections it contributes to each canonical persona lane, keyed
 * by canonical persona. The registry merges every module's fragment per persona
 * into the final GuideBook.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A route → persona hint, so the FAB step (built later) can open the guide on
 * the right lane for the page the viewer is on. `sectionId` optionally deep-links
 * to a specific section. Empty for now — modules fill these in the FAB step.
 */
export interface RoutePattern {
  /** A route pattern, e.g. "/pde/faculty/*". Matching semantics live in the FAB step. */
  pattern: string;
  /** Which canonical lane this route belongs to. */
  persona: CanonicalPersona;
  /** Optional section anchor to scroll to when opened from this route. */
  sectionId?: string;
}

/**
 * One module's contribution to the canonical guide. `lanes` is PARTIAL — a
 * module only fills the canonical personas it actually serves; the rest fall
 * back to the platform overview at compose time.
 */
export interface ModuleGuide {
  /** Module namespace, e.g. "ai-pulse" — used to namespace step keys on merge. */
  module: string;
  /** The module's route base, e.g. "/ai-pulse" (for future scope resolution). */
  basePath: string;
  /** Sections + optional start-here this module contributes, per canonical persona. */
  lanes: Partial<
    Record<
      CanonicalPersona,
      {
        sections: GuideSection[];
        startHere?: GuideLink;
        /**
         * Module-specific lane title/tagline for the SINGLE-module guide view
         * (`/guide?module=<id>`). Defaults to the canonical lane identity, so a
         * module that omits these is unchanged. Set them only when a module's
         * own vocabulary should replace the platform-neutral label in its OWN
         * scoped guide — e.g. AI Pulse showing "Champion Guide" instead of the
         * canonical "Running your unit". The cross-module overview keeps the
         * canonical title regardless (composeLane ignores these).
         */
        title?: string;
        tagline?: string;
      }
    >
  >;
  /** Route → persona hints (empty for now; the FAB step fills these). */
  routes?: RoutePattern[];
}

/**
 * The whole canonical guidebook: every canonical persona lane + a shared
 * glossary shown under every lane. Keyed by `CanonicalPersona` — a CLOSED
 * record, so `composeGuideBook` MUST fill all 9 (sparse ones via the platform
 * overview).
 */
export interface GuideBook {
  lanes: Record<CanonicalPersona, PersonaGuide>;
  glossary?: GlossaryTerm[];
  /**
   * A "planned translation" footer line, e.g. "A Tamil version is planned —
   * English only for now." Sets the expectation WITHOUT auto-generating the
   * translation (machine-translated non-Latin script corrupts silently — it
   * must be authored/reviewed by a native speaker). Leave undefined to omit.
   */
  plannedLocaleNote?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. Helpers (pure)
 * ──────────────────────────────────────────────────────────────────────── */

/** Resolve `:scopeId` tokens in a link href; returns null if the link needs a
 *  scope id and none is available (caller hides the link or uses a fallback). */
export function resolveGuideHref(
  href: string,
  scopeId: string | null | undefined
): string | null {
  if (!href.includes(":scopeId")) return href;
  if (!scopeId) return null;
  // split/join instead of replaceAll → no es2021 lib requirement in target apps.
  return href.split(":scopeId").join(scopeId);
}

/** Type guard for an untrusted `?persona=` query value. */
export function isCanonicalPersona(
  v: string | null | undefined
): v is CanonicalPersona {
  return (
    typeof v === "string" &&
    (CANONICAL_PERSONAS as readonly string[]).includes(v)
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. PROGRESS + INSTRUMENTATION (the adoption layer)
 *
 * These turn the guide from a static reference into a measured ACTIVATION
 * checklist. EVERYTHING here is OPTIONAL — a renderer with no progress/event
 * props just shows the plain guide (graceful degradation), so an app can adopt
 * it incrementally.
 * ──────────────────────────────────────────────────────────────────────── */

/** Stable key for one step, used to persist completion. Prefer an explicit
 *  `step.id`; otherwise fall back to `"<sectionId>:<index>"`. */
export function stepKey(sectionId: string, step: GuideStep, index: number): string {
  return step.id ?? `${sectionId}:${index}`;
}

/** Every step key in a lane, in order — the full checklist for that persona. */
export function laneStepKeys(lane: PersonaGuide): string[] {
  return lane.sections.flatMap((s) => s.steps.map((st, i) => stepKey(s.id, st, i)));
}

/** Progress summary for one lane against a set of completed step keys. */
export interface LaneProgress {
  total: number;
  done: number;
  /** 0–100, for a progress bar. */
  percent: number;
  /** True when every step is done. */
  complete: boolean;
}

export function laneProgress(lane: PersonaGuide, completed: ReadonlySet<string>): LaneProgress {
  const keys = laneStepKeys(lane);
  const done = keys.filter((k) => completed.has(k)).length;
  const total = keys.length;
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done === total,
  };
}

/** The viewer's next unfinished step in a lane (for "resume" + nudges), or null
 *  when the lane is complete/empty. */
export interface NextStep {
  sectionId: string;
  sectionTitle: string;
  index: number;
  key: string;
  step: GuideStep;
}

export function nextUndoneStep(
  lane: PersonaGuide,
  completed: ReadonlySet<string>
): NextStep | null {
  for (const s of lane.sections) {
    let i = 0;
    for (const step of s.steps) {
      const key = stepKey(s.id, step, i);
      if (!completed.has(key)) {
        return { sectionId: s.id, sectionTitle: s.title, index: i, key, step };
      }
      i++;
    }
  }
  return null;
}

/* ── Onboarding entry (the "Start / Resume onboarding" control) ───────────────
 * The start-vs-resume-vs-replay decision is derived PURELY from saved progress,
 * never from a "is this the first login" flag — that is what lets a returning
 * user who SKIPPED onboarding pick it up now (empty/partial set → start/resume),
 * and a finished user replay it. */
export type OnboardingKind = "start" | "resume" | "replay";

export interface OnboardingCta {
  kind: OnboardingKind;
  /** Human label for the control, e.g. "Resume onboarding". */
  label: string;
  /** Steps still to do in the lane (0 when complete). */
  remaining: number;
  /** Where the control jumps to: the next undone step, or — on replay — the
   *  lane's first step. Null only for a truly empty lane. */
  target: NextStep | null;
  complete: boolean;
}

export function onboardingCta(
  lane: PersonaGuide,
  completed: ReadonlySet<string>
): OnboardingCta {
  const lp = laneProgress(lane, completed);
  const next = nextUndoneStep(lane, completed);
  if (lp.done === 0) {
    return { kind: "start", label: "Start onboarding", remaining: lp.total, target: next, complete: false };
  }
  if (next) {
    return { kind: "resume", label: "Resume onboarding", remaining: lp.total - lp.done, target: next, complete: false };
  }
  // Lane complete → offer a replay from the first step (re-seed against empty).
  return { kind: "replay", label: "Replay walkthrough", remaining: 0, target: nextUndoneStep(lane, new Set()), complete: true };
}

/** Synthetic progress key marking that a viewer has seen a module's first-entry
 *  welcome. Stored in the SAME `guide_progress` table as real steps (so it syncs
 *  across devices) but excluded from `laneStepKeys`, so it never inflates lane
 *  progress or becomes a `nextUndoneStep`. */
export function welcomeSeenKey(moduleKey: string): string {
  return `__welcome__:${moduleKey}`;
}

/* ── Instrumentation ─────────────────────────────────────────────────────── */

/** Every meaningful guide interaction, for MEASURING adoption. The host app's
 *  sink decides where these land (a `guide_events` table, PostHog, etc.). The
 *  only question that matters — "do guide users activate/return more?" — needs
 *  these events to answer. */
export type GuideEventName =
  | "guide_open" // page or drawer opened
  | "lane_switch" // persona switcher used
  | "step_link_click" // a "Take me there →" deep-link tapped (the adoption action)
  | "step_complete" // step checked done
  | "step_uncomplete" // step unchecked
  | "lane_complete" // every step in a lane done
  | "pdf_download" // PDF button used
  | "nudge_click" // a GuideNudge / NextStepWidget CTA tapped
  | "onboarding_start" // the Start/Resume onboarding launcher was used
  | "welcome_shown" // a per-module first-entry welcome card was displayed
  | "guide_dismiss"; // drawer / first-run / welcome closed

export interface GuideEvent {
  name: GuideEventName;
  persona: CanonicalPersona;
  /** Surface that emitted it. */
  surface: "page" | "drawer" | "launcher" | "nudge" | "widget" | "onboarding" | "welcome";
  /** Step key when relevant (complete / uncomplete / link click). */
  stepKey?: string;
  /** Where the emitter was rendered, for funnel analysis (e.g. a route). */
  context?: string;
}

/** Optional callback the renderers fire on each interaction. No-op when unset. */
export type GuideEventSink = (event: GuideEvent) => void;

/** Runtime allow-lists. TS enums erase at runtime, but a `"use server"` action
 *  is a public endpoint — validate incoming event fields against THESE before
 *  insert so a caller can't poison the metrics table. */
export const GUIDE_EVENT_NAMES: readonly GuideEventName[] = [
  "guide_open",
  "lane_switch",
  "step_link_click",
  "step_complete",
  "step_uncomplete",
  "lane_complete",
  "pdf_download",
  "nudge_click",
  "onboarding_start",
  "welcome_shown",
  "guide_dismiss",
] as const;

export const GUIDE_SURFACES: readonly GuideEvent["surface"][] = [
  "page",
  "drawer",
  "launcher",
  "nudge",
  "widget",
  "onboarding",
  "welcome",
] as const;
