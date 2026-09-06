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
import { GUIDES as ADMISSION_GUIDES, REQUIRES as ADMISSION_REQUIRES } from "../admission/guide/content";
import { GUIDES as BILLING_GUIDES, REQUIRES as BILLING_REQUIRES } from "../billing/guide/content";
import { GUIDES as ACADEMIC_GUIDES, REQUIRES as ACADEMIC_REQUIRES } from "../academic/guide/content";
import { GUIDES as STARTUP_GUIDES, REQUIRES as STARTUP_REQUIRES } from "../startup-studio/guide/content";
import { GUIDES as SOLUTIONS_GUIDES, REQUIRES as SOLUTIONS_REQUIRES } from "../solutions/guide/content";
import { GUIDES as ORGANIZATIONS_GUIDES, REQUIRES as ORGANIZATIONS_REQUIRES } from "../organizations/guide/content";
import { GUIDES as IMS_GUIDES, REQUIRES as IMS_REQUIRES } from "../ims/guide/content";
import { GUIDES as BOS_GUIDES, REQUIRES as BOS_REQUIRES } from "../bos/guide/content";
import { GUIDES as MEETINGS_GUIDES, REQUIRES as MEETINGS_REQUIRES } from "../meetings/guide/content";
import { GUIDES as LEARNERS_GUIDES, REQUIRES as LEARNERS_REQUIRES } from "../learners/guide/content";
import { GUIDES as LEARNERS_COUNCIL_GUIDES, REQUIRES as LEARNERS_COUNCIL_REQUIRES } from "../learners-council/guide/content";
import { GUIDES as EVENTS_GUIDES, REQUIRES as EVENTS_REQUIRES } from "../events/guide/content";
import { GUIDES as RESOURCES_GUIDES, REQUIRES as RESOURCES_REQUIRES } from "../resource-management/guide/content";
import { GUIDES as VAC_GUIDES, REQUIRES as VAC_REQUIRES } from "../vac/guide/content";
import { GUIDES as OKR_GUIDES, REQUIRES as OKR_REQUIRES } from "../okr/guide/content";
import { GUIDES as SCHOOLS_NETWORK_GUIDES, REQUIRES as SCHOOLS_NETWORK_REQUIRES } from "../admission/schools-network/guide/content";
import { GUIDES as FOUNDATION_GUIDES, REQUIRES as FOUNDATION_REQUIRES, SESSION_LEADER_SECTIONS as FOUNDATION_SESSION_LEADER_SECTIONS, ONEMARK_PAPER_SECTIONS as FOUNDATION_ONEMARK_PAPER_SECTIONS, ONEMARK_REVIEW_SECTIONS as FOUNDATION_ONEMARK_REVIEW_SECTIONS } from "../foundation/guide/content";
import { GUIDES as AUDIT_GUIDES, REQUIRES as AUDIT_REQUIRES } from "../audit/guide/content";
import { GUIDES as IMPROVEMENT_GUIDES, REQUIRES as IMPROVEMENT_REQUIRES } from "../improvement/guide/content";
import { GUIDES as CEO_ROUNDS_GUIDES, REQUIRES as CEO_ROUNDS_REQUIRES } from "../ceo-rounds/guide/content";
import {
  GUIDES as ACCREDITATION_GUIDES,
  REQUIRES as ACCREDITATION_REQUIRES,
  orientationSections as ACCREDITATION_ORIENTATION_SECTIONS,
  cacSections as ACCREDITATION_CAC_SECTIONS,
  ownerSections as ACCREDITATION_OWNER_SECTIONS,
  frameworkSections as ACCREDITATION_FRAMEWORK_SECTIONS,
  assignSections as ACCREDITATION_ASSIGN_SECTIONS,
} from "../accreditation/guide/content";
import {
  GUIDES as ID_CARDS_GUIDES,
  REQUIRES as ID_CARDS_REQUIRES,
  entrySections as ID_CARDS_ENTRY_SECTIONS,
  setupSections as ID_CARDS_SETUP_SECTIONS,
  printSections as ID_CARDS_PRINT_SECTIONS,
} from "../id-cards/guide/content";

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
  facilitator: [AI_PULSE_REQUIRES.faculty, PDE_REQUIRES.faculty, ACADEMIC_REQUIRES.faculty, STARTUP_REQUIRES.mentor, STARTUP_REQUIRES.evaluator, SOLUTIONS_REQUIRES.delivery_team, IMS_REQUIRES.cashier, BOS_REQUIRES.member, FOUNDATION_REQUIRES.facilitator, FOUNDATION_REQUIRES.paper_builder, FOUNDATION_REQUIRES.item_approver],
  "unit-lead": [AI_PULSE_REQUIRES.champion, CAMPUS_REQUIRES.warden, CAMPUS_REQUIRES.mess, IMS_REQUIRES.storekeeper, BOS_REQUIRES.chairman, LEARNERS_COUNCIL_REQUIRES.member, EVENTS_REQUIRES.organiser],
  coordinator: [AI_PULSE_REQUIRES.incharge, ADMISSION_REQUIRES.counsellor, BILLING_REQUIRES["finance-officer"], ACADEMIC_REQUIRES.coordinator, STARTUP_REQUIRES.coordinator, SOLUTIONS_REQUIRES.sales_lead, ORGANIZATIONS_REQUIRES.viewer, IMS_REQUIRES.requester, MEETINGS_REQUIRES.host, LEARNERS_COUNCIL_REQUIRES.coordinator, EVENTS_REQUIRES.proposer, RESOURCES_REQUIRES.requester, OKR_REQUIRES.contributor, SCHOOLS_NETWORK_REQUIRES.coordinator, FOUNDATION_REQUIRES.coordinator, ACCREDITATION_REQUIRES.assign],
  supervisor: [AI_PULSE_REQUIRES.hod, HR_REQUIRES.manager, ACADEMIC_REQUIRES.hod, ACADEMIC_REQUIRES.principal, ACADEMIC_REQUIRES.registrar, SOLUTIONS_REQUIRES.finance_officer, IMS_REQUIRES.approver, BOS_REQUIRES.principal, LEARNERS_REQUIRES.advisor, RESOURCES_REQUIRES.approver, OKR_REQUIRES.manager, AUDIT_REQUIRES.auditor, IMPROVEMENT_REQUIRES.manage, CEO_ROUNDS_REQUIRES.log, ACCREDITATION_REQUIRES.owner],
  "module-admin": [AI_PULSE_REQUIRES.admin, CAMPUS_REQUIRES.admin, PDE_REQUIRES.admin, HR_REQUIRES["hr-admin"], ADMISSION_REQUIRES.admin, BILLING_REQUIRES["finance-admin"], STARTUP_REQUIRES.admin, SOLUTIONS_REQUIRES.module_admin, ORGANIZATIONS_REQUIRES["registry-admin"], IMS_REQUIRES.admin, BOS_REQUIRES.coordinator, MEETINGS_REQUIRES.admin, LEARNERS_REQUIRES.staff, RESOURCES_REQUIRES.admin, VAC_REQUIRES.admin, OKR_REQUIRES.admin, SCHOOLS_NETWORK_REQUIRES.admin, ID_CARDS_REQUIRES.templates, ID_CARDS_REQUIRES.operator, ACCREDITATION_REQUIRES.framework],
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
    // Canonical baseline lane shown across EVERY module (learners, HR self-service,
    // fee-payers, residents…), so the tagline must stay module-neutral — not skewed
    // to participation/record-building, which read oddly for HR/Billing.
    title: "Getting started",
    tagline: "Find your way and get the everyday things done — here's how.",
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
    // Module-specific lane titles/taglines reuse AI Pulse's OWN vocabulary
    // (Student / Champion / Class Incharge / HOD / Faculty / Admin), sourced
    // from content.ts so they stay in sync. They re-skin ONLY this module's
    // scoped guide (/guide?module=ai-pulse); the cross-module overview keeps the
    // canonical platform labels. Restores module relevance lost when AI Pulse's
    // lanes were mapped onto canonical personas (champion→unit-lead "Running your unit").
    learner: {
      sections: AI_PULSE_GUIDES.lanes.student.sections,
      startHere: AI_PULSE_GUIDES.lanes.student.startHere,
      title: AI_PULSE_GUIDES.lanes.student.title,
      tagline: AI_PULSE_GUIDES.lanes.student.tagline,
    },
    facilitator: {
      sections: AI_PULSE_GUIDES.lanes.faculty.sections,
      startHere: AI_PULSE_GUIDES.lanes.faculty.startHere,
      title: AI_PULSE_GUIDES.lanes.faculty.title,
      tagline: AI_PULSE_GUIDES.lanes.faculty.tagline,
    },
    "unit-lead": {
      // champion sections → requires "aiPulse:cycles.manage"
      sections: withRequires(AI_PULSE_GUIDES.lanes.champion.sections, AI_PULSE_REQUIRES.champion),
      startHere: AI_PULSE_GUIDES.lanes.champion.startHere,
      title: AI_PULSE_GUIDES.lanes.champion.title,
      tagline: AI_PULSE_GUIDES.lanes.champion.tagline,
    },
    coordinator: {
      // incharge sections → requires "aiPulse:attendance.mark"
      sections: withRequires(AI_PULSE_GUIDES.lanes.incharge.sections, AI_PULSE_REQUIRES.incharge),
      // incharge lane has no startHere in the source — omit
      title: AI_PULSE_GUIDES.lanes.incharge.title,
      tagline: AI_PULSE_GUIDES.lanes.incharge.tagline,
    },
    supervisor: {
      sections: AI_PULSE_GUIDES.lanes.hod.sections,
      startHere: AI_PULSE_GUIDES.lanes.hod.startHere,
      title: AI_PULSE_GUIDES.lanes.hod.title,
      tagline: AI_PULSE_GUIDES.lanes.hod.tagline,
    },
    "module-admin": {
      // admin sections → requires "aiPulse:policies.manage" so a viewer who reached
      // module-admin via ANOTHER module doesn't see AI Pulse admin steps without the
      // AI Pulse admin permission (fail-closed; matches HR/Admission/Billing).
      sections: withRequires(AI_PULSE_GUIDES.lanes.admin.sections, AI_PULSE_REQUIRES.admin),
      startHere: AI_PULSE_GUIDES.lanes.admin.startHere,
      title: AI_PULSE_GUIDES.lanes.admin.title,
      tagline: AI_PULSE_GUIDES.lanes.admin.tagline,
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
  // Module-specific lane labels (see aiPulseGuide for the rationale): re-skin
  // ONLY campus-living's scoped guide; cross-module overview stays canonical.
  lanes: {
    learner: {
      sections: CAMPUS_GUIDES.lanes.resident.sections,
      startHere: CAMPUS_GUIDES.lanes.resident.startHere,
      title: CAMPUS_GUIDES.lanes.resident.title,
      tagline: CAMPUS_GUIDES.lanes.resident.tagline,
    },
    "unit-lead": {
      // warden sections → requires allocations.approve; mess sections → requires mess.menu.publish
      sections: [
        ...withRequires(CAMPUS_GUIDES.lanes.warden.sections, CAMPUS_REQUIRES.warden),
        ...withRequires(CAMPUS_GUIDES.lanes.mess.sections, CAMPUS_REQUIRES.mess),
      ],
      startHere: CAMPUS_GUIDES.lanes.warden.startHere,
      // Collapsed lane (warden + mess); label follows the primary source (warden,
      // whose startHere this lane uses), matching the AI Pulse collapsed-lane convention.
      title: CAMPUS_GUIDES.lanes.warden.title,
      tagline: CAMPUS_GUIDES.lanes.warden.tagline,
    },
    "module-admin": {
      // admin sections → requires "campus_living.settings.edit" (section-gated, fail-closed)
      sections: withRequires(CAMPUS_GUIDES.lanes.admin.sections, CAMPUS_REQUIRES.admin),
      startHere: CAMPUS_GUIDES.lanes.admin.startHere,
      title: CAMPUS_GUIDES.lanes.admin.title,
      tagline: CAMPUS_GUIDES.lanes.admin.tagline,
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
  // Module-specific lane labels (re-skin PDE's scoped guide only).
  lanes: {
    learner: {
      sections: PDE_GUIDES.lanes.learner.sections,
      startHere: PDE_GUIDES.lanes.learner.startHere,
      title: PDE_GUIDES.lanes.learner.title,
      tagline: PDE_GUIDES.lanes.learner.tagline,
    },
    facilitator: {
      sections: PDE_GUIDES.lanes.faculty.sections,
      startHere: PDE_GUIDES.lanes.faculty.startHere,
      title: PDE_GUIDES.lanes.faculty.title,
      tagline: PDE_GUIDES.lanes.faculty.tagline,
    },
    "module-admin": {
      // admin sections → requires "pde.admin.view" (section-gated, fail-closed)
      sections: withRequires(PDE_GUIDES.lanes.admin.sections, PDE_REQUIRES.admin),
      startHere: PDE_GUIDES.lanes.admin.startHere,
      title: PDE_GUIDES.lanes.admin.title,
      tagline: PDE_GUIDES.lanes.admin.tagline,
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
  // Module-specific lane labels (re-skin HR's scoped guide only).
  lanes: {
    learner: {
      sections: HR_GUIDES.lanes.employee.sections,
      startHere: HR_GUIDES.lanes.employee.startHere,
      title: HR_GUIDES.lanes.employee.title,
      tagline: HR_GUIDES.lanes.employee.tagline,
    },
    supervisor: {
      sections: withRequires(HR_GUIDES.lanes.manager.sections, HR_REQUIRES.manager),
      startHere: HR_GUIDES.lanes.manager.startHere,
      title: HR_GUIDES.lanes.manager.title,
      tagline: HR_GUIDES.lanes.manager.tagline,
    },
    "module-admin": {
      // hr-admin is a hyphenated key → bracket access (dot access is a syntax error)
      sections: withRequires(HR_GUIDES.lanes["hr-admin"].sections, HR_REQUIRES["hr-admin"]),
      startHere: HR_GUIDES.lanes["hr-admin"].startHere,
      title: HR_GUIDES.lanes["hr-admin"].title,
      tagline: HR_GUIDES.lanes["hr-admin"].tagline,
    },
  },
  routes: [],
};

/* ── Admission ───────────────────────
 * counsellor→coordinator, admin→module-admin. No learner lane (all users are
 * staff). Each lane section-gated by its own Admission key (fail-closed).
 * ──────────────────────────────── */
export const admissionGuide: ModuleGuide = {
  module: "admission",
  basePath: "/admission",
  // Module-specific lane labels (re-skin Admission's scoped guide only).
  lanes: {
    coordinator: {
      sections: withRequires(ADMISSION_GUIDES.lanes.counsellor.sections, ADMISSION_REQUIRES.counsellor),
      startHere: ADMISSION_GUIDES.lanes.counsellor.startHere,
      title: ADMISSION_GUIDES.lanes.counsellor.title,
      tagline: ADMISSION_GUIDES.lanes.counsellor.tagline,
    },
    "module-admin": {
      sections: withRequires(ADMISSION_GUIDES.lanes.admin.sections, ADMISSION_REQUIRES.admin),
      startHere: ADMISSION_GUIDES.lanes.admin.startHere,
      title: ADMISSION_GUIDES.lanes.admin.title,
      tagline: ADMISSION_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── Billing ────────────────────────
 * payer→learner (ungated baseline), finance-officer→coordinator,
 * finance-admin→module-admin. Non-learner lanes section-gated by their own key.
 * ──────────────────────────────── */
export const billingGuide: ModuleGuide = {
  module: "billing",
  basePath: "/billing",
  // Module-specific lane labels (re-skin Billing's scoped guide only).
  lanes: {
    learner: {
      sections: BILLING_GUIDES.lanes.payer.sections,
      startHere: BILLING_GUIDES.lanes.payer.startHere,
      title: BILLING_GUIDES.lanes.payer.title,
      tagline: BILLING_GUIDES.lanes.payer.tagline,
    },
    coordinator: {
      // finance-officer is a hyphenated key → bracket access
      sections: withRequires(BILLING_GUIDES.lanes["finance-officer"].sections, BILLING_REQUIRES["finance-officer"]),
      startHere: BILLING_GUIDES.lanes["finance-officer"].startHere,
      title: BILLING_GUIDES.lanes["finance-officer"].title,
      tagline: BILLING_GUIDES.lanes["finance-officer"].tagline,
    },
    "module-admin": {
      // finance-admin is a hyphenated key → bracket access
      sections: withRequires(BILLING_GUIDES.lanes["finance-admin"].sections, BILLING_REQUIRES["finance-admin"]),
      startHere: BILLING_GUIDES.lanes["finance-admin"].startHere,
      title: BILLING_GUIDES.lanes["finance-admin"].title,
      tagline: BILLING_GUIDES.lanes["finance-admin"].tagline,
    },
  },
  routes: [],
};

/* ── Academic ───────────────────────────────────────────────────────────────
 * learner→learner (open baseline), faculty→facilitator, hod+principal→supervisor
 * (COLLAPSED — each tagged with its own academic key, fail-closed), coordinator→
 * coordinator. Non-learner lanes section-gated by their own Academic permission.
 * ────────────────────────────────────────────────────────────────────────── */
export const academicGuide: ModuleGuide = {
  module: "academic",
  basePath: "/academic",
  lanes: {
    learner: {
      sections: ACADEMIC_GUIDES.lanes.learner.sections,
      startHere: ACADEMIC_GUIDES.lanes.learner.startHere,
      title: ACADEMIC_GUIDES.lanes.learner.title,
      tagline: ACADEMIC_GUIDES.lanes.learner.tagline,
    },
    facilitator: {
      sections: withRequires(ACADEMIC_GUIDES.lanes.faculty.sections, ACADEMIC_REQUIRES.faculty),
      startHere: ACADEMIC_GUIDES.lanes.faculty.startHere,
      title: ACADEMIC_GUIDES.lanes.faculty.title,
      tagline: ACADEMIC_GUIDES.lanes.faculty.tagline,
    },
    supervisor: {
      // hod + principal collapsed → each tagged with its own key (a viewer sees
      // only the sections their permission unlocks; matches campus-living unit-lead).
      sections: [
        ...withRequires(ACADEMIC_GUIDES.lanes.hod.sections, ACADEMIC_REQUIRES.hod),
        ...withRequires(ACADEMIC_GUIDES.lanes.principal.sections, ACADEMIC_REQUIRES.principal),
        // Registrar's exam-audit walk-in (also unlocked for principals/CEO/EAO/
        // administrators — anyone holding the exam-audit key).
        ...withRequires(ACADEMIC_GUIDES.lanes.registrar.sections, ACADEMIC_REQUIRES.registrar),
      ],
      startHere: ACADEMIC_GUIDES.lanes.hod.startHere,
      title: ACADEMIC_GUIDES.lanes.hod.title,
      tagline: ACADEMIC_GUIDES.lanes.hod.tagline,
    },
    coordinator: {
      sections: withRequires(ACADEMIC_GUIDES.lanes.coordinator.sections, ACADEMIC_REQUIRES.coordinator),
      startHere: ACADEMIC_GUIDES.lanes.coordinator.startHere,
      title: ACADEMIC_GUIDES.lanes.coordinator.title,
      tagline: ACADEMIC_GUIDES.lanes.coordinator.tagline,
    },
  },
  routes: [],
};

/* ── Startup Studio ──────────────────────────────────────────────────────────
 * founder→learner (open baseline), mentor+evaluator→facilitator (COLLAPSED),
 * coordinator→coordinator, admin→module-admin. Non-learner lanes section-gated.
 * ────────────────────────────────────────────────────────────────────────── */
export const startupStudioGuide: ModuleGuide = {
  module: "startup-studio",
  basePath: "/startup-studio",
  lanes: {
    learner: {
      sections: STARTUP_GUIDES.lanes.founder.sections,
      startHere: STARTUP_GUIDES.lanes.founder.startHere,
      title: STARTUP_GUIDES.lanes.founder.title,
      tagline: STARTUP_GUIDES.lanes.founder.tagline,
    },
    facilitator: {
      // mentor + evaluator collapsed → each tagged with its own key (fail-closed).
      sections: [
        ...withRequires(STARTUP_GUIDES.lanes.mentor.sections, STARTUP_REQUIRES.mentor),
        ...withRequires(STARTUP_GUIDES.lanes.evaluator.sections, STARTUP_REQUIRES.evaluator),
      ],
      startHere: STARTUP_GUIDES.lanes.mentor.startHere,
      title: STARTUP_GUIDES.lanes.mentor.title,
      tagline: STARTUP_GUIDES.lanes.mentor.tagline,
    },
    coordinator: {
      sections: withRequires(STARTUP_GUIDES.lanes.coordinator.sections, STARTUP_REQUIRES.coordinator),
      startHere: STARTUP_GUIDES.lanes.coordinator.startHere,
      title: STARTUP_GUIDES.lanes.coordinator.title,
      tagline: STARTUP_GUIDES.lanes.coordinator.tagline,
    },
    "module-admin": {
      sections: withRequires(STARTUP_GUIDES.lanes.admin.sections, STARTUP_REQUIRES.admin),
      startHere: STARTUP_GUIDES.lanes.admin.startHere,
      title: STARTUP_GUIDES.lanes.admin.title,
      tagline: STARTUP_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── Solutions (JKKN Solutions Hub — internal staff back-office) ──────────────
 * No learner lane (no open everyday user). delivery_team→facilitator,
 * sales_lead→coordinator, finance_officer→supervisor, module_admin→module-admin.
 * Each lane section-gated by its area's solutions.*.view key (writes are guarded
 * at the service layer; flagged for the module owner to refine).
 * ────────────────────────────────────────────────────────────────────────── */
export const solutionsGuide: ModuleGuide = {
  module: "solutions",
  basePath: "/solutions",
  lanes: {
    facilitator: {
      sections: withRequires(SOLUTIONS_GUIDES.lanes.delivery_team.sections, SOLUTIONS_REQUIRES.delivery_team),
      startHere: SOLUTIONS_GUIDES.lanes.delivery_team.startHere,
      title: SOLUTIONS_GUIDES.lanes.delivery_team.title,
      tagline: SOLUTIONS_GUIDES.lanes.delivery_team.tagline,
    },
    coordinator: {
      sections: withRequires(SOLUTIONS_GUIDES.lanes.sales_lead.sections, SOLUTIONS_REQUIRES.sales_lead),
      startHere: SOLUTIONS_GUIDES.lanes.sales_lead.startHere,
      title: SOLUTIONS_GUIDES.lanes.sales_lead.title,
      tagline: SOLUTIONS_GUIDES.lanes.sales_lead.tagline,
    },
    supervisor: {
      sections: withRequires(SOLUTIONS_GUIDES.lanes.finance_officer.sections, SOLUTIONS_REQUIRES.finance_officer),
      startHere: SOLUTIONS_GUIDES.lanes.finance_officer.startHere,
      title: SOLUTIONS_GUIDES.lanes.finance_officer.title,
      tagline: SOLUTIONS_GUIDES.lanes.finance_officer.tagline,
    },
    "module-admin": {
      sections: withRequires(SOLUTIONS_GUIDES.lanes.module_admin.sections, SOLUTIONS_REQUIRES.module_admin),
      startHere: SOLUTIONS_GUIDES.lanes.module_admin.startHere,
      title: SOLUTIONS_GUIDES.lanes.module_admin.title,
      tagline: SOLUTIONS_GUIDES.lanes.module_admin.tagline,
    },
  },
  routes: [],
};

/* ── Organizations (academic-structure registry — master data) ───────────────
 * registry-admin→module-admin (builds the hierarchy), viewer→coordinator
 * (read-only lookup). No learner lane: this is staff config, not an everyday
 * end-user surface — both lanes are section-gated by their own key (fail-closed)
 * so org content never appears in the open learner baseline.
 * ────────────────────────────────────────────────────────────────────────── */
export const organizationsGuide: ModuleGuide = {
  module: "organizations",
  basePath: "/organizations",
  lanes: {
    "module-admin": {
      // "registry-admin" is a hyphenated key → bracket access
      sections: withRequires(ORGANIZATIONS_GUIDES.lanes["registry-admin"].sections, ORGANIZATIONS_REQUIRES["registry-admin"]),
      startHere: ORGANIZATIONS_GUIDES.lanes["registry-admin"].startHere,
      title: ORGANIZATIONS_GUIDES.lanes["registry-admin"].title,
      tagline: ORGANIZATIONS_GUIDES.lanes["registry-admin"].tagline,
    },
    coordinator: {
      // read-only structure viewer; gated by organizations.dashboard.view.
      // FLAG (SME): "viewer" is an imperfect fit for the canonical "coordinator"
      // title — kept gated/fail-closed; the module-scoped guide shows the module's
      // own "Viewer Guide" label, only the cross-module compose uses "Coordinator".
      sections: withRequires(ORGANIZATIONS_GUIDES.lanes.viewer.sections, ORGANIZATIONS_REQUIRES.viewer),
      startHere: ORGANIZATIONS_GUIDES.lanes.viewer.startHere,
      title: ORGANIZATIONS_GUIDES.lanes.viewer.title,
      tagline: ORGANIZATIONS_GUIDES.lanes.viewer.tagline,
    },
  },
  routes: [],
};

/* ── IMS (Inventory Management — operational back-office) ─────────────────────
 * requester→coordinator, approver→supervisor, storekeeper→unit-lead,
 * cashier→facilitator, admin→module-admin. NO learner lane: an inventory
 * requester is staff, not an everyday everyone-user, so requester is mapped to a
 * GATED canonical (coordinator) rather than the open learner lane — IMS content
 * must never surface in a student's getting-started guide. Every lane is
 * section-gated by its own ims.* key (fail-closed).
 * ────────────────────────────────────────────────────────────────────────── */
export const imsGuide: ModuleGuide = {
  module: "ims",
  basePath: "/ims",
  lanes: {
    coordinator: {
      sections: withRequires(IMS_GUIDES.lanes.requester.sections, IMS_REQUIRES.requester),
      startHere: IMS_GUIDES.lanes.requester.startHere,
      title: IMS_GUIDES.lanes.requester.title,
      tagline: IMS_GUIDES.lanes.requester.tagline,
    },
    supervisor: {
      sections: withRequires(IMS_GUIDES.lanes.approver.sections, IMS_REQUIRES.approver),
      startHere: IMS_GUIDES.lanes.approver.startHere,
      title: IMS_GUIDES.lanes.approver.title,
      tagline: IMS_GUIDES.lanes.approver.tagline,
    },
    "unit-lead": {
      sections: withRequires(IMS_GUIDES.lanes.storekeeper.sections, IMS_REQUIRES.storekeeper),
      startHere: IMS_GUIDES.lanes.storekeeper.startHere,
      title: IMS_GUIDES.lanes.storekeeper.title,
      tagline: IMS_GUIDES.lanes.storekeeper.tagline,
    },
    facilitator: {
      sections: withRequires(IMS_GUIDES.lanes.cashier.sections, IMS_REQUIRES.cashier),
      startHere: IMS_GUIDES.lanes.cashier.startHere,
      title: IMS_GUIDES.lanes.cashier.title,
      tagline: IMS_GUIDES.lanes.cashier.tagline,
    },
    "module-admin": {
      sections: withRequires(IMS_GUIDES.lanes.admin.sections, IMS_REQUIRES.admin),
      startHere: IMS_GUIDES.lanes.admin.startHere,
      title: IMS_GUIDES.lanes.admin.title,
      tagline: IMS_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── BoS (Board of Studies — academic governance) ────────────────────────────
 * coordinator(role)→module-admin (academic office builds master data),
 * chairman→unit-lead (runs one board), member→facilitator (does the academic
 * work), principal→supervisor (oversight + approval). Each lane gated by its own
 * academic.bos-* key. NOTE: BoS also enforces a STRUCTURAL chairman/member/
 * principal split at runtime (lib/utils/bos/bos-access.ts via board membership +
 * profiles.role) that no permission key captures — `requires` here only decides
 * whether a lane is OFFERED; the deeper distinction is enforced in-app.
 * ────────────────────────────────────────────────────────────────────────── */
export const bosGuide: ModuleGuide = {
  module: "bos",
  basePath: "/bos",
  lanes: {
    "module-admin": {
      sections: withRequires(BOS_GUIDES.lanes.coordinator.sections, BOS_REQUIRES.coordinator),
      startHere: BOS_GUIDES.lanes.coordinator.startHere,
      title: BOS_GUIDES.lanes.coordinator.title,
      tagline: BOS_GUIDES.lanes.coordinator.tagline,
    },
    "unit-lead": {
      sections: withRequires(BOS_GUIDES.lanes.chairman.sections, BOS_REQUIRES.chairman),
      startHere: BOS_GUIDES.lanes.chairman.startHere,
      title: BOS_GUIDES.lanes.chairman.title,
      tagline: BOS_GUIDES.lanes.chairman.tagline,
    },
    facilitator: {
      sections: withRequires(BOS_GUIDES.lanes.member.sections, BOS_REQUIRES.member),
      startHere: BOS_GUIDES.lanes.member.startHere,
      title: BOS_GUIDES.lanes.member.title,
      tagline: BOS_GUIDES.lanes.member.tagline,
    },
    supervisor: {
      sections: withRequires(BOS_GUIDES.lanes.principal.sections, BOS_REQUIRES.principal),
      startHere: BOS_GUIDES.lanes.principal.startHere,
      title: BOS_GUIDES.lanes.principal.title,
      tagline: BOS_GUIDES.lanes.principal.tagline,
    },
  },
  routes: [],
};

/* ── Meetings (Universal Booking — Calendly-parity) ───────────────────────────
 * host→coordinator (the everyday booking-page owner — every staff member who can
 * open the module), admin→module-admin (the operator who runs routing forms,
 * webhooks, and watches the adoption scoreboard). NO learner lane: people who
 * BOOK do so from the public internet (/meet/<handle>), not a guide surface, so
 * meetings content must never surface in a student's getting-started guide. Each
 * lane section-gated by its own meetings.* key (fail-closed). The leadership
 * framing (leverage memo Wedge 3) is the host lane's final section, not a
 * separate lane — a principal's setup is identical to a counsellor's.
 * ────────────────────────────────────────────────────────────────────────── */
export const meetingsGuide: ModuleGuide = {
  module: "meetings",
  basePath: "/meetings",
  // Module-specific lane labels (re-skin Meetings' scoped guide only); the
  // cross-module overview keeps the canonical persona titles.
  lanes: {
    coordinator: {
      sections: withRequires(MEETINGS_GUIDES.lanes.host.sections, MEETINGS_REQUIRES.host),
      startHere: MEETINGS_GUIDES.lanes.host.startHere,
      title: MEETINGS_GUIDES.lanes.host.title,
      tagline: MEETINGS_GUIDES.lanes.host.tagline,
    },
    "module-admin": {
      sections: withRequires(MEETINGS_GUIDES.lanes.admin.sections, MEETINGS_REQUIRES.admin),
      startHere: MEETINGS_GUIDES.lanes.admin.startHere,
      title: MEETINGS_GUIDES.lanes.admin.title,
      tagline: MEETINGS_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── Learners ────────────────────────────────────────────────────────────────
 * student→learner (OPEN baseline — student self-service: my-profile/attendance/
 * marks/timetable/bills/leave-onduty, the everyday things every learner does, so
 * ungated), advisor→supervisor (watches a caseload, steps in early), staff→
 * module-admin (full learner-records operations). Non-learner lanes section-gated
 * by their own real key (fail-closed). advisor's key is the broad legacy
 * `learners.view` — the advisor page actually gates by ROLE in-app (no caseload
 * permission key exists yet); flagged in content.ts for the module owner.
 * ────────────────────────────────────────────────────────────────────────── */
export const learnersGuide: ModuleGuide = {
  module: "learners",
  basePath: "/learners",
  lanes: {
    learner: {
      sections: LEARNERS_GUIDES.lanes.student.sections,
      startHere: LEARNERS_GUIDES.lanes.student.startHere,
      title: LEARNERS_GUIDES.lanes.student.title,
      tagline: LEARNERS_GUIDES.lanes.student.tagline,
    },
    supervisor: {
      sections: withRequires(LEARNERS_GUIDES.lanes.advisor.sections, LEARNERS_REQUIRES.advisor),
      startHere: LEARNERS_GUIDES.lanes.advisor.startHere,
      title: LEARNERS_GUIDES.lanes.advisor.title,
      tagline: LEARNERS_GUIDES.lanes.advisor.tagline,
    },
    "module-admin": {
      sections: withRequires(LEARNERS_GUIDES.lanes.staff.sections, LEARNERS_REQUIRES.staff),
      startHere: LEARNERS_GUIDES.lanes.staff.startHere,
      title: LEARNERS_GUIDES.lanes.staff.title,
      tagline: LEARNERS_GUIDES.lanes.staff.tagline,
    },
  },
  routes: [],
};

/* ── Learners Council (student governance) ────────────────────────────────────
 * member→unit-lead (an elected office-bearer who runs a committee/vertical),
 * coordinator→coordinator (staff advisor who sets up elections/structure/approvals).
 * NO learner lane: the whole module is gated behind `learners_council.view` (an
 * ordinary student never reaches election/issue screens), so council content must
 * never surface in the open learner baseline. Both lanes gated by the ONLY real
 * key, `learners_council.view`; the deeper member/coordinator split is enforced
 * IN-APP via lib/learners-council/lc-roles.ts (no finer permission keys exist) —
 * matching the BoS structural-split precedent above.
 * ────────────────────────────────────────────────────────────────────────── */
export const learnersCouncilGuide: ModuleGuide = {
  module: "learners-council",
  basePath: "/learners-council",
  lanes: {
    "unit-lead": {
      sections: withRequires(LEARNERS_COUNCIL_GUIDES.lanes.member.sections, LEARNERS_COUNCIL_REQUIRES.member),
      startHere: LEARNERS_COUNCIL_GUIDES.lanes.member.startHere,
      title: LEARNERS_COUNCIL_GUIDES.lanes.member.title,
      tagline: LEARNERS_COUNCIL_GUIDES.lanes.member.tagline,
    },
    coordinator: {
      sections: withRequires(LEARNERS_COUNCIL_GUIDES.lanes.coordinator.sections, LEARNERS_COUNCIL_REQUIRES.coordinator),
      startHere: LEARNERS_COUNCIL_GUIDES.lanes.coordinator.startHere,
      title: LEARNERS_COUNCIL_GUIDES.lanes.coordinator.title,
      tagline: LEARNERS_COUNCIL_GUIDES.lanes.coordinator.tagline,
    },
  },
  routes: [],
};

/* ── Events (proposals · marathon · tournament) ───────────────────────────────
 * organiser + ops → unit-lead (COLLAPSED — both gated `events.marathon.view`,
 * keeping all marathon run/ops content in one lane so an organiser isn't split
 * across two canonical tabs), proposer→coordinator (proposes & tracks events).
 * NO learner lane: proposing and running events are staff/organiser actions, not
 * everyday all-student actions, so events content must never surface in the open
 * learner baseline. Finer per-page ops/budget rights are enforced in-app by role
 * (no permission keys exist for them) — flagged in content.ts.
 * ────────────────────────────────────────────────────────────────────────── */
export const eventsGuide: ModuleGuide = {
  module: "events",
  basePath: "/events",
  lanes: {
    "unit-lead": {
      // organiser + ops collapsed → each tagged with its own key (both
      // events.marathon.view); a viewer sees the sections their key unlocks.
      sections: [
        ...withRequires(EVENTS_GUIDES.lanes.organiser.sections, EVENTS_REQUIRES.organiser),
        ...withRequires(EVENTS_GUIDES.lanes.ops.sections, EVENTS_REQUIRES.ops),
      ],
      startHere: EVENTS_GUIDES.lanes.organiser.startHere,
      title: EVENTS_GUIDES.lanes.organiser.title,
      tagline: EVENTS_GUIDES.lanes.organiser.tagline,
    },
    coordinator: {
      sections: withRequires(EVENTS_GUIDES.lanes.proposer.sections, EVENTS_REQUIRES.proposer),
      startHere: EVENTS_GUIDES.lanes.proposer.startHere,
      title: EVENTS_GUIDES.lanes.proposer.title,
      tagline: EVENTS_GUIDES.lanes.proposer.tagline,
    },
  },
  routes: [],
};

/* ── Resource Management (rooms/equipment booking) ────────────────────────────
 * requester→coordinator (books + tracks resources; booking is permission-gated,
 * NOT open, so it maps to a GATED canonical, not the open learner lane),
 * approver→supervisor (reviews the reservation queue), admin→module-admin (runs
 * the catalogue + maintenance). NOTE: route dir is `resource-management` but the
 * permission namespace is `resources.*`. Each lane section-gated by its own real
 * key (fail-closed).
 * ────────────────────────────────────────────────────────────────────────── */
export const resourceManagementGuide: ModuleGuide = {
  module: "resource-management",
  basePath: "/resource-management",
  lanes: {
    coordinator: {
      sections: withRequires(RESOURCES_GUIDES.lanes.requester.sections, RESOURCES_REQUIRES.requester),
      startHere: RESOURCES_GUIDES.lanes.requester.startHere,
      title: RESOURCES_GUIDES.lanes.requester.title,
      tagline: RESOURCES_GUIDES.lanes.requester.tagline,
    },
    supervisor: {
      sections: withRequires(RESOURCES_GUIDES.lanes.approver.sections, RESOURCES_REQUIRES.approver),
      startHere: RESOURCES_GUIDES.lanes.approver.startHere,
      title: RESOURCES_GUIDES.lanes.approver.title,
      tagline: RESOURCES_GUIDES.lanes.approver.tagline,
    },
    "module-admin": {
      sections: withRequires(RESOURCES_GUIDES.lanes.admin.sections, RESOURCES_REQUIRES.admin),
      startHere: RESOURCES_GUIDES.lanes.admin.startHere,
      title: RESOURCES_GUIDES.lanes.admin.title,
      tagline: RESOURCES_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── VAC (Value-Added Courses) ────────────────────────────────────────────────
 * learner→learner (the student learning surface: catalogue, enrol, lessons,
 * progress, certificate, CASE track) — but VAC is permission-gated by
 * `vac.courses.view` (NOT universal like marks/fees), so its learner sections are
 * section-gated with that key: they appear in the open learner baseline ONLY for
 * viewers who can actually use VAC. admin→module-admin (manages courses, lessons,
 * enrollments, analytics, CASE admin) gated by `vac.admin.view`.
 * ────────────────────────────────────────────────────────────────────────── */
export const vacGuide: ModuleGuide = {
  module: "vac",
  basePath: "/vac",
  lanes: {
    learner: {
      sections: withRequires(VAC_GUIDES.lanes.learner.sections, VAC_REQUIRES.learner),
      startHere: VAC_GUIDES.lanes.learner.startHere,
      title: VAC_GUIDES.lanes.learner.title,
      tagline: VAC_GUIDES.lanes.learner.tagline,
    },
    "module-admin": {
      sections: withRequires(VAC_GUIDES.lanes.admin.sections, VAC_REQUIRES.admin),
      startHere: VAC_GUIDES.lanes.admin.startHere,
      title: VAC_GUIDES.lanes.admin.title,
      tagline: VAC_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── OKR (Objectives & Key Results — staff goal-setting) ───────────────────────
 * contributor→coordinator (sets own objectives + weekly check-ins + ABCD),
 * manager→supervisor (department/cascade + manage + tier-2/3 objectives),
 * admin→module-admin (org objectives + compliance + analytics). NO learner lane:
 * OKR is a STAFF tool gated by okr.view, so it must never surface in a student's
 * getting-started baseline. Each lane section-gated by its own okr.* key.
 * ────────────────────────────────────────────────────────────────────────── */
export const okrGuide: ModuleGuide = {
  module: "okr",
  basePath: "/okr",
  lanes: {
    coordinator: {
      sections: withRequires(OKR_GUIDES.lanes.contributor.sections, OKR_REQUIRES.contributor),
      startHere: OKR_GUIDES.lanes.contributor.startHere,
      title: OKR_GUIDES.lanes.contributor.title,
      tagline: OKR_GUIDES.lanes.contributor.tagline,
    },
    supervisor: {
      sections: withRequires(OKR_GUIDES.lanes.manager.sections, OKR_REQUIRES.manager),
      startHere: OKR_GUIDES.lanes.manager.startHere,
      title: OKR_GUIDES.lanes.manager.title,
      tagline: OKR_GUIDES.lanes.manager.tagline,
    },
    "module-admin": {
      sections: withRequires(OKR_GUIDES.lanes.admin.sections, OKR_REQUIRES.admin),
      startHere: OKR_GUIDES.lanes.admin.startHere,
      title: OKR_GUIDES.lanes.admin.title,
      tagline: OKR_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

/* ── Schools Network (admission sub-module — outreach to K-12 schools) ──────
 * coordinator (outreach coordinator + program lead) → coordinator lane,
 * admin (Director / module admin who manages partners + master tables) →
 * module-admin lane. NO learner lane: every viewer is JKKN staff (headmasters
 * use the separate /schools-portal magic-link interface, not this admin UI).
 * Each lane section-gated by its own schools_network.* key (fail-closed).
 * basePath is more specific than admissionGuide's /admission, so the
 * longest-prefix matcher in route-map.ts picks this module on any
 * /admission/schools-network/* route.
 * ────────────────────────────────────────────────────────────────────────── */
export const schoolsNetworkGuide: ModuleGuide = {
  module: "schools-network",
  basePath: "/admission/schools-network",
  lanes: {
    coordinator: {
      sections: withRequires(
        SCHOOLS_NETWORK_GUIDES.lanes.coordinator.sections,
        SCHOOLS_NETWORK_REQUIRES.coordinator,
      ),
      startHere: SCHOOLS_NETWORK_GUIDES.lanes.coordinator.startHere,
      title: SCHOOLS_NETWORK_GUIDES.lanes.coordinator.title,
      tagline: SCHOOLS_NETWORK_GUIDES.lanes.coordinator.tagline,
    },
    "module-admin": {
      sections: withRequires(
        SCHOOLS_NETWORK_GUIDES.lanes.admin.sections,
        SCHOOLS_NETWORK_REQUIRES.admin,
      ),
      startHere: SCHOOLS_NETWORK_GUIDES.lanes.admin.startHere,
      title: SCHOOLS_NETWORK_GUIDES.lanes.admin.title,
      tagline: SCHOOLS_NETWORK_GUIDES.lanes.admin.tagline,
    },
  },
  routes: [],
};

export const foundationGuide: ModuleGuide = {
  module: "foundation",
  basePath: "/foundation",
  lanes: {
    learner: {
      // The learner floor is OPEN (PERSONA_REQUIRES.learner = []), so every
      // section is stamped with foundation.practice.take and the server-side
      // filter hides them from anyone not sitting the programme — Foundation
      // content never leaks into the open getting-started baseline. This lane
      // was authored in content.ts (#2703) but never composed here; OneMark's
      // learner steps (practice / timed / live / vault) made that gap visible.
      sections: withRequires(FOUNDATION_GUIDES.lanes.learner.sections, FOUNDATION_REQUIRES.learner),
      // LATENT: composeLane() hands the start-here slot to the FIRST registry
      // module that offers one and filterLaneSections() does not gate
      // startHere — only sections. Today ai-pulse (earlier in REGISTRY) takes
      // the learner slot, so this href never reaches the open learner floor;
      // that is registry order, not a guarantee. If foundation ever moves
      // ahead of every other learner-lane module, gate startHere in
      // lib/guide/filter.ts before relying on it. composeModuleLane (the
      // scoped /guide?module=foundation view) still needs it, so it stays.
      startHere: FOUNDATION_GUIDES.lanes.learner.startHere,
      title: FOUNDATION_GUIDES.lanes.learner.title,
      tagline: FOUNDATION_GUIDES.lanes.learner.tagline,
    },
    coordinator: {
      sections: withRequires(FOUNDATION_GUIDES.lanes.coordinator.sections, FOUNDATION_REQUIRES.coordinator),
      startHere: FOUNDATION_GUIDES.lanes.coordinator.startHere,
      title: FOUNDATION_GUIDES.lanes.coordinator.title,
      tagline: FOUNDATION_GUIDES.lanes.coordinator.tagline,
    },
    facilitator: {
      // FOUR gates in one lane, on purpose. Reviewing a learner's diagnostic and
      // RUNNING a practice session for a group are different jobs held by
      // different people: the review sections need foundation.students.view,
      // while running a session needs foundation.practice.take — and the one
      // role that actually runs sessions (school_faculty) holds the second and
      // not the first. Stamping the lane with a single key would have hidden the
      // session steps from the only person who needs them. Same shape as
      // auditGuide below: a cross-cutting job scoped by its own key.
      //
      // OneMark adds two more Senior Learner jobs on their own EXISTING keys:
      // building a board-shape paper (foundation.assessments.manage) and
      // ticking drafted items live (foundation.items.manage). They land in
      // THIS lane, not coordinator, because the FAB opens the highest-priority
      // lane the module fills and facilitator outranks coordinator — a Senior
      // Learner on /foundation/onemark/paper must see the paper steps without
      // switching lanes.
      sections: [
        ...withRequires(FOUNDATION_GUIDES.lanes.facilitator.sections, FOUNDATION_REQUIRES.facilitator),
        ...withRequires(FOUNDATION_SESSION_LEADER_SECTIONS, FOUNDATION_REQUIRES.session_leader),
        ...withRequires(FOUNDATION_ONEMARK_PAPER_SECTIONS, FOUNDATION_REQUIRES.paper_builder),
        ...withRequires(FOUNDATION_ONEMARK_REVIEW_SECTIONS, FOUNDATION_REQUIRES.item_approver),
      ],
      startHere: FOUNDATION_GUIDES.lanes.facilitator.startHere,
      title: FOUNDATION_GUIDES.lanes.facilitator.title,
      tagline: FOUNDATION_GUIDES.lanes.facilitator.tagline,
    },
  },
  routes: [],
};

/* ── Audit (self-improving institutional audit — Lead Auditor / Registrar) ────
 * ONE auditor lane, contributed to EVERY staff lane an auditor's OWN lane can
 * resolve to — coordinator, supervisor, module-admin (the registrar defaults to
 * module-admin because they hold an admin key), and external (lead_auditor by
 * role). Every section is gated by AUDIT_REQUIRES.auditor (audit.parameter.view),
 * so it appears on whatever lane the viewer lands on IF they can open the
 * parameter sheet, and never otherwise — fail-closed, same as every module. The
 * duplication is intentional: the audit is a cross-cutting function whose holders
 * span several primary personas, so it can't live in one lane alone.
 * ────────────────────────────────────────────────────────────────────────── */
const auditLane = () => ({
  sections: withRequires(AUDIT_GUIDES.lanes.auditor.sections, AUDIT_REQUIRES.auditor),
  startHere: AUDIT_GUIDES.lanes.auditor.startHere,
  title: AUDIT_GUIDES.lanes.auditor.title,
  tagline: AUDIT_GUIDES.lanes.auditor.tagline,
});
export const auditGuide: ModuleGuide = {
  module: "audit",
  basePath: "/audit",
  lanes: {
    coordinator: auditLane(),
    supervisor: auditLane(),
    "module-admin": auditLane(),
    external: auditLane(),
  },
  routes: [
    { pattern: "/audit/*", persona: "supervisor" },
  ],
};

/* ── Improvement Board (MBA teaching-enterprise business-case pipeline) ───────
 * associate → learner (the MBA Associate who files ideas + tracks them + climbs
 * the leaderboard, AND the view-only reader). Its sections carry their OWN
 * per-section requires in content.ts (read-the-board + leaderboard →
 * improvement.ideas.view; file + track → improvement.ideas.create), so they are
 * passed THROUGH verbatim rather than uniformly re-gated with withRequires —
 * which would clobber the create-gated sections down to view. The learner lane is
 * OPEN (PERSONA_REQUIRES.learner = []), so a non-MBA learner simply sees NONE of
 * these sections in their getting-started baseline (all are gated; they hold
 * neither key) — improvement content never leaks into the open learner floor.
 * reviewer (Senior Learner / CEO) → supervisor, uniformly gated improvement.board.manage
 * (fail-closed, matching HR/OKR manager→supervisor).
 * NOTE: /ceo-rounds now has its OWN guide module (ceoRoundsGuide, below) — the
 * daily-round log is a sibling route, not part of /improvement-board.
 * ────────────────────────────────────────────────────────────────────────── */
export const improvementGuide: ModuleGuide = {
  module: "improvement",
  basePath: "/improvement-board",
  lanes: {
    learner: {
      // Sections already carry per-section requires (view/create) from content.ts;
      // pass them verbatim so the mixed gating survives (do NOT withRequires — it
      // would rewrite every section's requires to a single key).
      sections: IMPROVEMENT_GUIDES.lanes.learner.sections,
      startHere: IMPROVEMENT_GUIDES.lanes.learner.startHere,
      title: IMPROVEMENT_GUIDES.lanes.learner.title,
      tagline: IMPROVEMENT_GUIDES.lanes.learner.tagline,
    },
    supervisor: {
      sections: withRequires(IMPROVEMENT_GUIDES.lanes.supervisor.sections, IMPROVEMENT_REQUIRES.manage),
      startHere: IMPROVEMENT_GUIDES.lanes.supervisor.startHere,
      title: IMPROVEMENT_GUIDES.lanes.supervisor.title,
      tagline: IMPROVEMENT_GUIDES.lanes.supervisor.tagline,
    },
  },
  routes: [],
};

/* ── CEO Rounds (MBA teaching-enterprise daily-round log) ─────────────────────
 * rotating summary author → learner. Its sections carry their OWN per-section
 * requires in content.ts (ceo_rounds.summary.write), so they are passed THROUGH
 * verbatim rather than uniformly re-gated with withRequires. The learner lane is
 * OPEN (PERSONA_REQUIRES.learner = []); every CEO Rounds learner section is
 * gated, so a learner who is not an assigned summary author sees NONE of them —
 * CEO Rounds content never leaks into the open learner floor (mirrors the
 * Improvement Board learner lane above).
 * Senior Learner / CEO → supervisor, uniformly gated ceo_rounds.log (fail-closed,
 * matching HR/OKR manager→supervisor and Improvement Board).
 * basePath /ceo-rounds — route→module map derives from it (route-map.ts).
 * ────────────────────────────────────────────────────────────────────────── */
export const ceoRoundsGuide: ModuleGuide = {
  module: "ceo-rounds",
  basePath: "/ceo-rounds",
  lanes: {
    learner: {
      // Sections already carry per-section requires (ceo_rounds.summary.write)
      // from content.ts; pass them verbatim (do NOT withRequires — every learner
      // section is gated, so nothing leaks into the open floor).
      sections: CEO_ROUNDS_GUIDES.lanes.learner.sections,
      startHere: CEO_ROUNDS_GUIDES.lanes.learner.startHere,
      title: CEO_ROUNDS_GUIDES.lanes.learner.title,
      tagline: CEO_ROUNDS_GUIDES.lanes.learner.tagline,
    },
    supervisor: {
      sections: withRequires(CEO_ROUNDS_GUIDES.lanes.supervisor.sections, CEO_ROUNDS_REQUIRES.log),
      startHere: CEO_ROUNDS_GUIDES.lanes.supervisor.startHere,
      title: CEO_ROUNDS_GUIDES.lanes.supervisor.title,
      tagline: CEO_ROUNDS_GUIDES.lanes.supervisor.tagline,
    },
  },
  routes: [],
};

/* ── ID Cards (physical ID card printing — registrar / module admin) ─────────
 * ONE registrar lane → module-admin. The lane COLLAPSES two permission groups:
 * setup sections (card template + printer policy) gated by
 * id_cards.templates.edit, and printing sections (enqueue + queue watching)
 * gated by id_cards.jobs.manage — so a viewer who can print but not redesign
 * the template still gets the printing steps, and vice versa (fail-closed).
 * Section order follows the registrar's real workflow: find the module, set up
 * the template, check the printer policy, then print and watch the queue.
 * basePath /admin/id-cards is the module hub (policy / template / print-queue).
 * ────────────────────────────────────────────────────────────────────────── */
export const idCardsGuide: ModuleGuide = {
  module: "id-cards",
  basePath: "/admin/id-cards",
  lanes: {
    "module-admin": {
      sections: [
        ...withRequires(ID_CARDS_ENTRY_SECTIONS, ID_CARDS_REQUIRES.operator),
        ...withRequires(ID_CARDS_SETUP_SECTIONS, ID_CARDS_REQUIRES.templates),
        ...withRequires(ID_CARDS_PRINT_SECTIONS, ID_CARDS_REQUIRES.operator),
      ],
      startHere: ID_CARDS_GUIDES.lanes.registrar.startHere,
      title: ID_CARDS_GUIDES.lanes.registrar.title,
      tagline: ID_CARDS_GUIDES.lanes.registrar.tagline,
    },
  },
  routes: [],
};

/* ── Accreditation & Compliance (the ten awarding bodies + IQAC) ─────────────
 * ONE accreditation lane, contributed to EVERY lane an accreditation reader can
 * resolve to — supervisor (the HOD / principal named as a metric owner),
 * coordinator (the IQAC coordinator), module-admin (the catalog keeper) and
 * external (the accreditation_officer / external_auditor_timeboxed role keys in
 * EXTERNAL_ROLE_KEYS). Same cross-cutting shape as auditGuide above: the holders
 * span several primary personas, so the content cannot live in one lane alone.
 *
 * The five section groups carry DIFFERENT keys, so they are gated group by group
 * rather than uniformly — a viewer who can read the framework but was never
 * named an owner gets the framework steps and none of the owner steps
 * (fail-closed, same as idCardsGuide's two-key collapse).
 *
 * DO NOT merge these into one withRequires() call. It stamps ONE key across
 * everything handed to it, so tidying them together would silently re-gate the
 * CAC steps on `overview` and the owner steps on `cac` — the lane still renders
 * and the wrong people lose the section, with no error anywhere. That exact
 * failure is what __tests__/accreditation/guide-cac-gate.test.ts asserts against
 * (and, for Foundation, guide-session-leader-gate.test.ts before it).
 * ────────────────────────────────────────────────────────────────────────── */
const accreditationLane = () => ({
  sections: [
    ...withRequires(ACCREDITATION_ORIENTATION_SECTIONS, ACCREDITATION_REQUIRES.overview),
    ...withRequires(ACCREDITATION_CAC_SECTIONS, ACCREDITATION_REQUIRES.cac),
    ...withRequires(ACCREDITATION_OWNER_SECTIONS, ACCREDITATION_REQUIRES.owner),
    ...withRequires(ACCREDITATION_FRAMEWORK_SECTIONS, ACCREDITATION_REQUIRES.framework),
    ...withRequires(ACCREDITATION_ASSIGN_SECTIONS, ACCREDITATION_REQUIRES.assign),
  ],
  startHere: ACCREDITATION_GUIDES.lanes.iqac.startHere,
  title: ACCREDITATION_GUIDES.lanes.iqac.title,
  tagline: ACCREDITATION_GUIDES.lanes.iqac.tagline,
});
export const accreditationGuide: ModuleGuide = {
  module: "accreditation",
  basePath: "/accreditation",
  lanes: {
    coordinator: accreditationLane(),
    supervisor: accreditationLane(),
    "module-admin": accreditationLane(),
    external: accreditationLane(),
  },
  routes: [],
};

export const REGISTRY: ModuleGuide[] = [aiPulseGuide, campusLivingGuide, pdeGuide, hrGuide, admissionGuide, billingGuide, academicGuide, startupStudioGuide, solutionsGuide, organizationsGuide, imsGuide, bosGuide, meetingsGuide, learnersGuide, learnersCouncilGuide, eventsGuide, resourceManagementGuide, vacGuide, okrGuide, schoolsNetworkGuide, foundationGuide, auditGuide, improvementGuide, ceoRoundsGuide, idCardsGuide, accreditationGuide];

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
  admission: "Admission",
  billing: "Fees & Billing",
  academic: "Academic",
  "startup-studio": "Startup Studio",
  solutions: "Solutions",
  organizations: "Organizations",
  ims: "Inventory (IMS)",
  bos: "Board of Studies",
  meetings: "Meetings",
  learners: "Learners",
  "learners-council": "Learners Council",
  events: "Events",
  "resource-management": "Resource Management",
  vac: "Value-Added Courses",
  okr: "OKR",
  "schools-network": "Schools Network",
  foundation: "Foundation Programme",
  improvement: "Improvement Board",
  "ceo-rounds": "CEO Rounds",
  accreditation: "Accreditation & Compliance",
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
  admission: ADMISSION_GUIDES.glossary ?? [],
  billing: BILLING_GUIDES.glossary ?? [],
  academic: ACADEMIC_GUIDES.glossary ?? [],
  "startup-studio": STARTUP_GUIDES.glossary ?? [],
  solutions: SOLUTIONS_GUIDES.glossary ?? [],
  organizations: ORGANIZATIONS_GUIDES.glossary ?? [],
  ims: IMS_GUIDES.glossary ?? [],
  bos: BOS_GUIDES.glossary ?? [],
  meetings: MEETINGS_GUIDES.glossary ?? [],
  learners: LEARNERS_GUIDES.glossary ?? [],
  "learners-council": LEARNERS_COUNCIL_GUIDES.glossary ?? [],
  events: EVENTS_GUIDES.glossary ?? [],
  "resource-management": RESOURCES_GUIDES.glossary ?? [],
  vac: VAC_GUIDES.glossary ?? [],
  okr: OKR_GUIDES.glossary ?? [],
  "schools-network": SCHOOLS_NETWORK_GUIDES.glossary ?? [],
  foundation: FOUNDATION_GUIDES.glossary ?? [],
  improvement: IMPROVEMENT_GUIDES.glossary ?? [],
  "ceo-rounds": CEO_ROUNDS_GUIDES.glossary ?? [],
  accreditation: ACCREDITATION_GUIDES.glossary ?? [],
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
    // Module's own label wins in its scoped guide; fall back to the canonical
    // platform identity when the module didn't override (HR / Billing / etc.).
    title: frag.title ?? meta.title,
    tagline: frag.tagline ?? meta.tagline,
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
