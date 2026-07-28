/**
 * Audit module — Smart Guide content (PURE DATA, no I/O, no JSX).
 *
 * The auditor (Lead Auditor / Registrar) had no guide: every other module ships
 * one, so the audit walk-in fell to a generic lane with zero auditor content.
 * This is the ONE audit lane — how to run a cycle end to end. The registry
 * (lib/guide/registry.ts) re-keys this onto the canonical `supervisor` (registrar)
 * and `external` (lead_auditor) lanes, each section gated by REQUIRES.auditor so
 * only a viewer who can actually open the parameter sheet sees it (fail-closed).
 *
 * Voice: 12th-grade plain English, imperative, no jargon. Links point at REAL
 * routes; cycle-scoped pages (which need a cycle id we don't have here) link to
 * the hub and the step text says "open your cycle first".
 */
import type { GuideLink, GuideSection } from "@/lib/guide/types";

/** Permission key that unlocks the audit lane + every section in it. Both the
 *  registrar and the lead_auditor hold audit.parameter.view; principals/HODs do
 *  not, so they never see auditor steps unless explicitly granted. */
export const REQUIRES = {
  auditor: "audit.parameter.view",
} as const;

interface AuditLane {
  title: string;
  tagline: string;
  whyItMatters?: string;
  startHere?: GuideLink;
  journey: string[];
  sections: GuideSection[];
}

const auditorSections: GuideSection[] = [
  {
    id: "open-the-cycle",
    title: "Open the audit cycle",
    steps: [
      {
        action: "Open the **Audit dashboard** to see the cycle that's running now.",
        detail:
          "The dashboard shows the active cycle, how much is signed off, and how many findings are still open. Everything you do starts from here.",
        link: { label: "Open the audit dashboard", href: "/audit/dashboard" },
      },
      {
        action: "Open the **cycle workspace** from the dashboard.",
        detail:
          "A cycle is one round of the audit — for a quarter or a term. Inside it are three tabs you'll use: Parameters (what to check), Findings (what fell short), and Attestations (signing the record).",
        link: { label: "See all cycles", href: "/audit/cycles" },
        tip: "If no cycle is running, ask an administrator to create one. You audit inside a cycle, never outside it.",
      },
    ],
  },
  {
    id: "walk-the-parameters",
    title: "Walk the parameter sheet",
    steps: [
      {
        action: "Open the **Parameters** tab and work down the lanes.",
        detail:
          "Each lane groups the things you check by the standard they serve — Teaching & Learning, Culture (CARRE), Loop Health, Exam Integrity. Each parameter is one thing to verify at one college.",
        link: { label: "See all cycles", href: "/audit/cycles" },
      },
      {
        action: "Read a parameter's **status pill** before you touch it.",
        detail:
          "Green means the evidence is in and the record is clean; amber or red means a finding is open there. A parameter clears only when every college in scope has signed it and no finding is left open.",
      },
      {
        action: "Notice the parameters marked **runs automatically**.",
        detail:
          "Loop Health and Exam Integrity check themselves from live data — you don't gather evidence for those by hand, you read what they already found. The rest are yours to verify in person.",
        tip: "Click a parameter row to read exactly what it means, which accreditation code it maps to, and what evidence it needs.",
      },
    ],
  },
  {
    id: "log-a-finding",
    title: "Log a finding when evidence falls short",
    steps: [
      {
        action: "On the **Findings** tab, press **Log finding**.",
        detail:
          "A finding is a ticket: a parameter, what fell short, an owner, and a deadline. Pick the college, pick the parameter, set the severity, and add a note about what you saw.",
        link: { label: "See all cycles", href: "/audit/cycles" },
      },
      {
        action: "Read the **parameter panel** that appears when you pick a parameter.",
        detail:
          "It shows what the parameter means, the evidence it expects, who owns it, and whether findings are already open there — so you're never logging blind.",
      },
      {
        action: "Use **Log & add another** when you're walking one college.",
        detail:
          "It keeps the college selected and clears just the parameter, so you can log several findings in a row without re-picking everything each time.",
        tip: "Red is a critical finding (P1); amber is a warning (P2); green is an observation. The owner and deadline are set for you from the parameter.",
      },
    ],
  },
  {
    id: "track-to-closure",
    title: "Track findings to closure",
    steps: [
      {
        action: "Filter the **Findings** list by severity, status, or owner.",
        detail:
          "The owner named on each finding fixes it and closes it. Your job is to keep watch: an open finding blocks that parameter from being signed.",
        link: { label: "My findings", href: "/audit/my-findings" },
      },
      {
        action: "Open a finding to see its history and current owner.",
        detail:
          "Click any row to open its detail. A finding stays open until its owner resolves it — then the parameter can be signed and, eventually, the cycle sealed.",
      },
    ],
  },
  {
    id: "sign-the-record",
    title: "Sign the record (attestation)",
    steps: [
      {
        action: "Open the **Attestations** tab — the grid of parameters × colleges.",
        detail:
          "Once you've checked the evidence for a parameter at a college, click that cell and sign it. Signing stamps the record with your name and the time — a brass “Attested” seal appears.",
        link: { label: "See all cycles", href: "/audit/cycles" },
      },
      {
        action: "You can't sign a parameter that has an **open finding**.",
        detail:
          "The Sign button is blocked and points you back to the finding. Close the finding first, then sign. This is deliberate — a signed record must mean the gap was actually fixed.",
        prerequisite:
          "Resolve every open finding on a parameter before you try to sign it, or signing stays blocked.",
      },
      {
        action: "Watch the **cycle seal** when everything's signed.",
        detail:
          "A parameter clears only when every college in scope has signed it and no finding remains open. When the whole sheet is clear, the cycle seals — ready to archive as accreditation evidence.",
      },
    ],
  },
];

export const GUIDES: { lanes: { auditor: AuditLane } } = {
  lanes: {
    auditor: {
      title: "Auditor Guide",
      tagline:
        "Run an audit cycle end to end: walk the parameters, log findings, close them, and sign the record.",
      whyItMatters:
        "The audit is how the institution proves — to itself first, and to accreditation bodies second — that what should be in place actually is. A signed cycle is the evidence.",
      startHere: { label: "Open the audit dashboard", href: "/audit/dashboard" },
      journey: [
        "Open the cycle",
        "Walk the parameters",
        "Log findings",
        "Close them",
        "Sign the record",
        "Seal the cycle",
      ],
      sections: auditorSections,
    },
  },
};
