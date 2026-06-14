/**
 * AI Pulse Smart Guide — shared contract (PURE DATA, framework-neutral).
 *
 * ONE data model drives THREE renderers so they can never drift:
 *   - full page:     app/(routes)/ai-pulse/guide/page.tsx + components/ai-pulse/guide/GuideView.tsx
 *   - in-app drawer: components/ai-pulse/guide/guide-drawer.tsx (FAB launcher)
 *   - print/PDF:     the page's Download/Print button (window.print)
 *
 * No "use server", no JSX, no I/O — safe to import from client AND server, which
 * is what lets the same model feed every surface.
 *
 * Personas + their gating permission keys live here (union) and in content.ts
 * (REQUIRES). Installed via the smart-guide skill, 2026-06-14.
 */

/* ── 1. PERSONAS — AI Pulse's seven real roles (external judge folded into
 *    faculty/admin; the guide surfaces six lanes). ─────────────────────────── */
export type GuidePersona =
  | "admin"
  | "champion"
  | "faculty"
  | "hod"
  | "incharge"
  | "student";

export const GUIDE_PERSONAS: readonly GuidePersona[] = [
  "admin",
  "champion",
  "faculty",
  "hod",
  "incharge",
  "student",
] as const;

/* ── 2. STEP / SECTION model ─────────────────────────────────────────────── */

export interface GuideLink {
  /** Button label, e.g. "Open Champion · Cycles". */
  label: string;
  /** App route. May contain the literal token `:scopeId`. */
  href: string;
}

export interface GuideImage {
  src: string;
  alt: string;
  /** Intrinsic px size — drives aspect ratio so layout doesn't jump. */
  width: number;
  height: number;
}

export interface GuideStep {
  id?: string;
  /** Imperative one-liner — the single thing to do. May contain `**bold**`. */
  action: string;
  /** One sentence of plain-language help (optional). May contain `**bold**`. */
  detail?: string;
  /** A highlighted tip / watch-out (optional). May contain `**bold**`. */
  tip?: string;
  /** "Take me there" link to the real page this step describes (optional). */
  link?: GuideLink;
  /** A screenshot of this moment (optional — use rarely). */
  image?: GuideImage;
}

export interface GuideSection {
  id: string;
  title: string;
  steps: GuideStep[];
}

/* ── 3. PERSONA LANE ─────────────────────────────────────────────────────── */
export interface PersonaGuide {
  persona: GuidePersona;
  title: string;
  /** One line: what this person does on the platform. */
  tagline: string;
  /** The stake — rendered as a callout at the top of the lane. */
  whyItMatters?: string;
  /** The single prominent "Start here" button (the adoption hook). */
  startHere?: GuideLink;
  /** Permission key gating whether this lane is OFFERED to a non-persona viewer.
   *  Undefined → shown to everyone (instructional). */
  requires?: string;
  /** Public path to a downloadable PDF (optional — print-to-PDF works without). */
  pdfPath?: string;
  /** The whole arc as a few short phrases — rendered as a numbered strip. */
  journey: string[];
  sections: GuideSection[];
}

export interface GlossaryTerm {
  term: string;
  def: string;
}

export interface GuideBook {
  lanes: Record<GuidePersona, PersonaGuide>;
  glossary?: GlossaryTerm[];
  /** "Planned translation" footer — sets the expectation WITHOUT auto-translating
   *  (machine-translated non-Latin script corrupts silently). */
  plannedLocaleNote?: string;
}

/* ── 4. Helpers (pure) ───────────────────────────────────────────────────── */

export function resolveGuideHref(
  href: string,
  scopeId: string | null | undefined
): string | null {
  if (!href.includes(":scopeId")) return href;
  if (!scopeId) return null;
  return href.split(":scopeId").join(scopeId);
}

export function isGuidePersona(v: string | null | undefined): v is GuidePersona {
  return typeof v === "string" && (GUIDE_PERSONAS as readonly string[]).includes(v);
}

/* ── 5. Progress + instrumentation helpers (used by the renderers; the DB-backed
 *    adoption layer is OFF until guide_progress/guide_events ship). ────────── */

export function stepKey(sectionId: string, step: GuideStep, index: number): string {
  return step.id ?? `${sectionId}:${index}`;
}

export function laneStepKeys(lane: PersonaGuide): string[] {
  return lane.sections.flatMap((s) => s.steps.map((st, i) => stepKey(s.id, st, i)));
}

export interface LaneProgress {
  total: number;
  done: number;
  percent: number;
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

/* ── Instrumentation types (used by the event sink when the adoption layer is on) ── */

export type GuideEventName =
  | "guide_open"
  | "lane_switch"
  | "step_link_click"
  | "step_complete"
  | "step_uncomplete"
  | "lane_complete"
  | "pdf_download"
  | "nudge_click"
  | "guide_dismiss";

export interface GuideEvent {
  name: GuideEventName;
  persona: GuidePersona;
  surface: "page" | "drawer" | "launcher" | "nudge" | "widget";
  stepKey?: string;
  context?: string;
}

export type GuideEventSink = (event: GuideEvent) => void;

export const GUIDE_EVENT_NAMES: readonly GuideEventName[] = [
  "guide_open",
  "lane_switch",
  "step_link_click",
  "step_complete",
  "step_uncomplete",
  "lane_complete",
  "pdf_download",
  "nudge_click",
  "guide_dismiss",
] as const;

export const GUIDE_SURFACES: readonly GuideEvent["surface"][] = [
  "page",
  "drawer",
  "launcher",
  "nudge",
  "widget",
] as const;
