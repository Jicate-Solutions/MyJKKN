/**
 * Smart Guide — CANONICAL REGISTRY + composition (PURE DATA).
 *
 * Merges the three existing MODULE guides (AI Pulse, Campus Living, PDE) into
 * ONE guide composed PER CANONICAL PERSONA. Modules contribute SECTIONS into
 * canonical lanes; lane identity (title + tagline) is canonical, defined here in
 * CANONICAL_LANES — NOT per-module.
 *
 * This file:
 *   - reuses the existing per-module section content VERBATIM (no rewriting of
 *     step copy) — it only RE-KEYS each module's lanes onto canonical personas
 *     and tags sections with `requires` where a module collapsed several of its
 *     own lanes into one canonical lane.
 *   - is PURE: no "use server", no React, no DB, no fetch.
 *
 * See lib/guide/types.ts for the shared contract and the persona remap rules.
 */

import type {
  CanonicalPersona,
  GlossaryTerm,
  GuideBook,
  GuideLink,
  GuideSection,
  ModuleGuide,
  PersonaGuide,
} from "./types";
import { CANONICAL_PERSONAS } from "./types";

// Existing per-module guides — read VERBATIM, never mutated.
import { GUIDES as AI_PULSE_GUIDES, REQUIRES as AI_PULSE_REQUIRES } from "../ai-pulse/guide/content";
import { GUIDES as CAMPUS_GUIDES, REQUIRES as CAMPUS_REQUIRES } from "../campus-living/guide/content";
import { GUIDES as PDE_GUIDES, REQUIRES as PDE_REQUIRES } from "../pde/guide/content";
import { GUIDES as HR_GUIDES, REQUIRES as HR_REQUIRES } from "../hr/guide/content";

/* ────────────────────────────────────────────────────────────────────────
 * PERSONA ACCESS — which permission keys grant each canonical persona (OR'd
 * within a lane). Built from the modules' OWN REQUIRES maps so these keys can
 * never drift from the section-level gating below. Consumed by the server
 * resolver (lib/guide/resolve-persona.ts). Rules the resolver layers on top:
 *   - learner is OPEN (everyone, incl. logged-out).
 *   - platform-admin is super-admin only (is_super_admin RPC).
 *   - parent / external are ROLE-based (profiles.role ∈ the lists below).
 *   - an empty array = "not grantable by permission" → fail-CLOSED (the lane is
 *     never visible unless one of the rules above grants it).
 * Permission keys are OPAQUE strings (AI Pulse uses ':' , others use '.').
 * ──────────────────────────────────────────────────────────────────────── */
export const PERSONA_REQUIRES: Record<CanonicalPersona, string[]> = {
  learner: [],
  facilitator: [AI_PULSE_REQUIRES.faculty, PDE_REQUIRES.faculty],
  "unit-lead": [AI_PULSE_REQUIRES.champion, CAMPUS_REQUIRES.warden, CAMPUS_REQUIRES.mess],
  coordinator: [AI_PULSE_REQUIRES.incharge],
  supervisor: [AI_PULSE_REQUIRES.hod, HR_REQUIRES.manager],
  "module-admin": [AI_PULSE_REQUIRES.admin, CAMPUS_REQUIRES.admin, PDE_REQUIRES.admin, HR_REQUIRES["hr-admin"]],
  "platform-admin": [],
  parent: [],
  external: [],
};

/** profiles.role values that map to the Parent lane. */
export const PARENT_ROLE_KEYS: readonly string[] = ["parent"];

/** profiles.role values that map to the External (partner/visitor) lane.
 *  Best-effort: an omission only UNDER-shows the lane (fail-closed / safe). */
export const EXTERNAL_ROLE_KEYS: readonly string[] = [
  "mess_caterer",
  "maintenance_vendor",
  "accreditation_officer",
  "external_auditor_timeboxed",
  "lead_auditor",
];

/* ────────────────────────────────────────────────────────────────────────
 * a. CANONICAL_LANES — registry-defined lane metadata per canonical persona.
 *    Title + tagline are CANONICAL (12th-grade plain English), independent of
 *    which module(s) filled the lane.
 * ──────────────────────────────────────────────────────────────────────── */
export interface CanonicalLaneMeta {
  persona: CanonicalPersona;
  title: string;
  tagline: string;
}

export const CANONICAL_LANES: Record<CanonicalPersona, CanonicalLaneMeta> = {
  learner: {
    persona: "learner",
    title: "Getting started",
    tagline: "Take part, get counted, and build your record — here's how.",
  },
  facilitator: {
    persona: "facilitator",
    title: "Facilitator guide",
    tagline: "Run sessions, review learner work, and give feedback that lands.",
  },
  "unit-lead": {
    persona: "unit-lead",
    title: "Running your unit",
    tagline: "Set up, host, and keep your unit's day-to-day running smoothly.",
  },
  coordinator: {
    persona: "coordinator",
    title: "Coordinator guide",
    tagline: "Keep your group on track — handle the exceptions and chase the misses.",
  },
  supervisor: {
    persona: "supervisor",
    title: "Supervisor guide",
    tagline: "Watch how your area takes part, week over week, and step in early.",
  },
  "module-admin": {
    persona: "module-admin",
    title: "Module admin",
    tagline: "Set the rules this module runs on, and keep it honest.",
  },
  "platform-admin": {
    persona: "platform-admin",
    title: "Platform admin",
    tagline: "Oversee the whole platform across every module.",
  },
  parent: {
    persona: "parent",
    title: "Parent guide",
    tagline: "See what your ward is doing and where to find what you need.",
  },
  external: {
    persona: "external",
    title: "Partner & visitor guide",
    tagline: "Find your way around as a partner, guest, or visitor.",
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * b. PLATFORM_OVERVIEW — fallback lane for any canonical persona no module
 *    filled (parent, external, platform-admin today). PersonaGuide-shaped so
 *    composeLane can return it directly with the persona's canonical title.
 * ──────────────────────────────────────────────────────────────────────── */

/** Glossary shared across every lane (merged from all modules below). */
export const MERGED_GLOSSARY: GlossaryTerm[] = mergeGlossaries([
  AI_PULSE_GUIDES.glossary,
  CAMPUS_GUIDES.glossary,
  PDE_GUIDES.glossary,
]);

export const PLATFORM_OVERVIEW: PersonaGuide = {
  persona: "external",
  title: CANONICAL_LANES.external.title,
  tagline: CANONICAL_LANES.external.tagline,
  whyItMatters:
    "MyJKKN brings campus life, learning, and recognition into one place. This short overview points you to where things live so you can find your way around.",
  startHere: { label: "Go to the dashboard", href: "/" },
  journey: ["Sign in", "Find your area on the dashboard", "Open the module you need"],
  sections: [
    {
      id: "what-is-this",
      title: "What this platform is",
      steps: [
        {
          action: "MyJKKN is the institution's single sign-in for everything you do here.",
          detail:
            "Learning records, campus living, and skill recognition all live behind one login — you don't need a separate account per module.",
        },
        {
          action: "Open the **dashboard** to see the areas you have access to.",
          detail:
            "Each card or menu item is a module. If you don't see something you expect, you may not have access yet — ask your coordinator or administrator.",
          link: { label: "Go to the dashboard", href: "/" },
        },
      ],
    },
    {
      id: "where-do-i-go",
      title: "Where do I go?",
      steps: [
        {
          action: "Use the left sidebar (or the menu on mobile) to move between modules.",
          detail:
            "A role-aware guide is available inside each module — open the ? Help button on any module screen for step-by-step help tailored to what you do there.",
        },
      ],
    },
  ],
};

/**
 * PLATFORM_OVERVIEW_LANE — the route-fallback OVERVIEW lane shown by the platform
 * Help FAB on any route NO guide module owns (dashboards, settings, modules
 * without a guide yet) and as the ultimate safety net. It is the
 * PLATFORM_OVERVIEW content under a neutral, persona-agnostic identity — so a
 * viewer on a generic page gets "how to get around MyJKKN", not some module's
 * lane they merely qualify for. See lib/guide/pick-lane.ts.
 *
 * persona is "learner" (the OPEN, ungated lane): its progress/events validate
 * against the canonical allow-list (lib/guide/actions.ts) and it never leaks a
 * gated persona to the client. Its step keys (`what-is-this:0`, `where-do-i-go:0`)
 * are un-namespaced, so they never collide with the module-namespaced learner
 * steps (`ai-pulse:…`, `pde:…`) — overview progress and learner-module progress
 * stay disjoint while sharing the one learner bucket.
 */
export const PLATFORM_OVERVIEW_LANE: PersonaGuide = {
  ...PLATFORM_OVERVIEW,
  persona: "learner",
  title: "Find your way around",
  tagline: "New here, or on a page without its own guide? Start with the basics.",
};

/* ────────────────────────────────────────────────────────────────────────
 * c. MODULE FRAGMENTS — remap each module's existing lanes onto canonical
 *    personas, tagging section.requires per the gating rules.
 *
 *    Section CONTENT is reused verbatim (spread); only the persona key changes
 *    and (where a lane was collapsed) a `requires` is attached.
 * ──────────────────────────────────────────────────────────────────────── */

/** Tag every section in `sections` with the given opaque permission key.
 *  Reuses the section content verbatim — only adds `requires`. */
function withRequires(sections: GuideSection[], requires: string): GuideSection[] {
  return sections.map((s) => ({ ...s, requires }));
}

/* ── AI Pulse ──────────────────────────────────────────────────────────────
 * student→learner, faculty→facilitator, champion→unit-lead,
 * incharge→coordinator, hod→supervisor, admin→module-admin.
 * unit-lead has only champion sections (single source → no requires, but we
 *   tag with cycles.manage per the spec so champion sections are scoped).
 * coordinator has only incharge sections (single source → tagged attendance.mark
 *   per the spec).
 * ────────────────────────────────────────────────────────────────────────── */
export const aiPulseGuide: ModuleGuide = {
  module: "ai-pulse",
  basePath: "/ai-pulse",
  lanes: {
    learner: {
      sections: AI_PULSE_GUIDES.lanes.student.sections,
      startHere: AI_PULSE_GUIDES.lanes.student.startHere,
    },
    facilitator: {
      sections: AI_PULSE_GUIDES.lanes.faculty.sections,
      startHere: AI_PULSE_GUIDES.lanes.faculty.startHere,
    },
    "unit-lead": {
      // champion sections → requires "aiPulse:cycles.manage"
      sections: withRequires(AI_PULSE_GUIDES.lanes.champion.sections, AI_PULSE_REQUIRES.champion),
      startHere: AI_PULSE_GUIDES.lanes.champion.startHere,
    },
    coordinator: {
      // incharge sections → requires "aiPulse:attendance.mark"
      sections: withRequires(AI_PULSE_GUIDES.lanes.incharge.sections, AI_PULSE_REQUIRES.incharge),
      // incharge lane has no startHere in the source — omit
    },
    supervisor: {
      sections: AI_PULSE_GUIDES.lanes.hod.sections,
      startHere: AI_PULSE_GUIDES.lanes.hod.startHere,
    },
    "module-admin": {
      sections: AI_PULSE_GUIDES.lanes.admin.sections,
      startHere: AI_PULSE_GUIDES.lanes.admin.startHere,
    },
  },
  routes: [],
};

/* ── Campus Living ──────────────────────────────────────────────────────────
 * resident→learner, warden→unit-lead, mess→unit-lead, admin→module-admin.
 * (faculty not present in Campus Living.)
 * unit-lead is COLLAPSED from warden + mess → tag each group with its original
 *   lane's permission so a viewer only sees the sections their permission unlocks.
 * ────────────────────────────────────────────────────────────────────────── */
export const campusLivingGuide: ModuleGuide = {
  module: "campus-living",
  basePath: "/campus-living",
  lanes: {
    learner: {
      sections: CAMPUS_GUIDES.lanes.resident.sections,
      startHere: CAMPUS_GUIDES.lanes.resident.startHere,
    },
    "unit-lead": {
      // warden sections → requires allocations.approve; mess sections → requires mess.menu.publish
      sections: [
        ...withRequires(CAMPUS_GUIDES.lanes.warden.sections, CAMPUS_REQUIRES.warden),
        ...withRequires(CAMPUS_GUIDES.lanes.mess.sections, CAMPUS_REQUIRES.mess),
      ],
      startHere: CAMPUS_GUIDES.lanes.warden.startHere,
    },
    "module-admin": {
      sections: CAMPUS_GUIDES.lanes.admin.sections,
      startHere: CAMPUS_GUIDES.lanes.admin.startHere,
    },
  },
  routes: [],
};

/* ── PDE ────────────────────────────────────────────────────────────────────
 * learner→learner, faculty→facilitator, admin→module-admin.
 * All single-source lanes → no requires needed.
 * ────────────────────────────────────────────────────────────────────────── */
export const pdeGuide: ModuleGuide = {
  module: "pde",
  basePath: "/pde",
  lanes: {
    learner: {
      sections: PDE_GUIDES.lanes.learner.sections,
      startHere: PDE_GUIDES.lanes.learner.startHere,
    },
    facilitator: {
      sections: PDE_GUIDES.lanes.faculty.sections,
      startHere: PDE_GUIDES.lanes.faculty.startHere,
    },
    "module-admin": {
      sections: PDE_GUIDES.lanes.admin.sections,
      startHere: PDE_GUIDES.lanes.admin.startHere,
    },
  },
  routes: [],
};

/* ────────────────────────────────────────────────────────────────────────
 * d. REGISTRY — order matters: sections merge in this order per persona.
 * ──────────────────────────────────────────────────────────────────────── */
/* ── HR ────────────────────────────────────────────────
 * employee→learner (ungated baseline), manager→supervisor, hr-admin→module-admin.
 * Distinct personas → each non-learner lane is section-gated by its OWN HR key
 * so a viewer who reaches supervisor/module-admin via another module sees HR
 * steps only if they hold the HR permission (fail-closed).
 * ──────────────────────────────────────────────────────────── */
export const hrGuide: ModuleGuide = {
  module: "hr",
  basePath: "/hr",
  lanes: {
    learner: {
      sections: HR_GUIDES.lanes.employee.sections,
      startHere: HR_GUIDES.lanes.employee.startHere,
    },
    supervisor: {
      sections: withRequires(HR_GUIDES.lanes.manager.sections, HR_REQUIRES.manager),
      startHere: HR_GUIDES.lanes.manager.startHere,
    },
    "module-admin": {
      sections: withRequires(HR_GUIDES.lanes["hr-admin"].sections, HR_REQUIRES["hr-admin"]),
      startHere: HR_GUIDES.lanes["hr-admin"].startHere,
    },
  },
  routes: [],
};

export const REGISTRY: ModuleGuide[] = [aiPulseGuide, campusLivingGuide, pdeGuide, hrGuide];

/** Canonical personas at least one module contributes real sections to. A
 *  persona NOT in this set is sparse (composeLane returns the platform-overview
 *  fallback for it), so the /guide switcher omits it — except the viewer's own
 *  lane — to avoid offering several identical overview-only tabs. */
export const FILLED_PERSONAS: ReadonlySet<CanonicalPersona> = new Set(
  REGISTRY.flatMap((m) => Object.keys(m.lanes) as CanonicalPersona[])
);

/* ────────────────────────────────────────────────────────────────────────
 * MODULE-SCOPED helpers — power the Help FAB's "Open full guide" link, which
 * opens the full /guide page scoped to ONLY the module whose page you're on
 * (see lib/guide/pick-lane.ts + app/(routes)/guide/page.tsx). Pure data.
 * ──────────────────────────────────────────────────────────────────────── */

/** Display label per module namespace (12th-grade plain English). */
const MODULE_LABELS: Record<string, string> = {
  "ai-pulse": "AI Pulse",
  "campus-living": "Campus Living",
  pde: "PDE",
  hr: "HR",
};

/** Human label for a module namespace; falls back to the raw id if unknown. */
export function moduleLabel(moduleName: string): string {
  return MODULE_LABELS[moduleName] ?? moduleName;
}

/** True only when `moduleName` is a real registered guide module. Fail-closed. */
export function isModule(moduleName: string | null | undefined): boolean {
  return !!moduleName && REGISTRY.some((m) => m.module === moduleName);
}

/** Canonical personas a single module fills (empty array if module unknown). */
export function modulePersonas(moduleName: string): CanonicalPersona[] {
  const mod = REGISTRY.find((m) => m.module === moduleName);
  return mod ? (Object.keys(mod.lanes) as CanonicalPersona[]) : [];
}

/** Per-module glossary, so a module-scoped guide shows ONLY that module's terms
 *  (not the cross-module MERGED_GLOSSARY). Keys match module namespaces. */
const MODULE_GLOSSARIES: Record<string, GlossaryTerm[]> = {
  "ai-pulse": AI_PULSE_GUIDES.glossary ?? [],
  "campus-living": CAMPUS_GUIDES.glossary ?? [],
  pde: PDE_GUIDES.glossary ?? [],
  hr: HR_GUIDES.glossary ?? [],
};

/** "Words to know" terms for one module; empty array if module unknown. */
export function moduleGlossary(moduleName: string): GlossaryTerm[] {
  return MODULE_GLOSSARIES[moduleName] ?? [];
}

/* ────────────────────────────────────────────────────────────────────────
 * e. composeLane — merge every module fragment's sections for one persona,
 *    namespacing each section's step keys by module so two modules can't
 *    collide, with the canonical title/tagline from CANONICAL_LANES. If no
 *    module contributed → return PLATFORM_OVERVIEW titled for that persona.
 *
 *    NAMESPACING: a section's STABLE keying is its `id`. The renderer derives a
 *    step key as `step.id ?? "<sectionId>:<index>"` (see stepKey()). To make
 *    BOTH forms collision-proof across modules we:
 *      - prefix the section id   → `<module>:<sectionId>`
 *      - prefix any explicit step.id → `<module>:<step.id>`
 *    Content (action / detail / links / requires) is otherwise verbatim.
 * ──────────────────────────────────────────────────────────────────────── */

/** Namespace one section (and its explicit step ids) by module. Pure. */
function namespaceSection(moduleName: string, section: GuideSection): GuideSection {
  return {
    ...section,
    id: `${moduleName}:${section.id}`,
    steps: section.steps.map((st) =>
      st.id === undefined ? st : { ...st, id: `${moduleName}:${st.id}` }
    ),
  };
}

export function composeLane(persona: CanonicalPersona): PersonaGuide {
  const meta = CANONICAL_LANES[persona];

  const sections: GuideSection[] = [];
  let startHere: GuideLink | undefined;

  for (const mod of REGISTRY) {
    const frag = mod.lanes[persona];
    if (!frag) continue;
    for (const sec of frag.sections) {
      sections.push(namespaceSection(mod.module, sec));
    }
    // First module (in REGISTRY order) that offers a start-here wins the slot.
    if (!startHere && frag.startHere) startHere = frag.startHere;
  }

  // Sparse persona → no module filled it: fall back to the platform overview,
  // re-titled for this canonical persona.
  if (sections.length === 0) {
    return {
      ...PLATFORM_OVERVIEW,
      persona,
      title: meta.title,
      tagline: meta.tagline,
    };
  }

  // Journey = the canonical section titles, in merged order (a sensible default
  // strip; the FAB/page step can refine). Strip the module prefix for display.
  const journey = sections.map((s) => s.title);

  return {
    persona,
    title: meta.title,
    tagline: meta.tagline,
    startHere,
    journey,
    sections,
  };
}

/**
 * composeModuleLane — the SINGLE-module counterpart of composeLane: just that
 * one module's sections for `persona`, namespaced IDENTICALLY (`<module>:<id>`)
 * so completed-step progress carries over verbatim between the contextual
 * drawer, the composed lane, and this scoped view. Returns null when the module
 * is unknown or doesn't fill that persona (caller falls back to the full lane).
 *
 * Used by the full /guide page when the Help FAB opens it scoped to the module
 * whose page the viewer is on ("Open full guide" → that page's guide only).
 */
export function composeModuleLane(
  moduleName: string,
  persona: CanonicalPersona
): PersonaGuide | null {
  const mod = REGISTRY.find((m) => m.module === moduleName);
  if (!mod) return null;
  const frag = mod.lanes[persona];
  if (!frag || frag.sections.length === 0) return null;

  const meta = CANONICAL_LANES[persona];
  const sections = frag.sections.map((sec) => namespaceSection(mod.module, sec));

  return {
    persona,
    title: meta.title,
    tagline: meta.tagline,
    startHere: frag.startHere,
    journey: sections.map((s) => s.title),
    sections,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * f. composeGuideBook — the closed GuideBook over all 9 canonical personas.
 * ──────────────────────────────────────────────────────────────────────── */
export function composeGuideBook(): GuideBook {
  const lanes = Object.fromEntries(
    CANONICAL_PERSONAS.map((p) => [p, composeLane(p)])
  ) as Record<CanonicalPersona, PersonaGuide>;

  return {
    lanes,
    glossary: MERGED_GLOSSARY,
    plannedLocaleNote: "A Tamil version is planned — English only for now.",
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * helper: merge glossaries, de-duplicating by case-insensitive term (first
 * definition wins, in module order). Pure.
 * ──────────────────────────────────────────────────────────────────────── */
function mergeGlossaries(
  lists: Array<GlossaryTerm[] | undefined>
): GlossaryTerm[] {
  const seen = new Set<string>();
  const out: GlossaryTerm[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      const k = item.term.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}
