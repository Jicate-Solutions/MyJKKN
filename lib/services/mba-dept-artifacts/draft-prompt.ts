// lib/services/mba-dept-artifacts/draft-prompt.ts
// Assembles the AI draft prompt for one department playbook artifact.
//
// GROUNDING RULE (product integrity): every draft is a PROPOSED STARTER TEMPLATE
// that a human manager reviews, corrects, and completes before it is "official".
// The model MUST NOT invent specific people's names, real reporting lines, real
// policy numbers, dates, or money figures. Where a real detail belongs but is not
// supplied, it must emit a clearly-marked placeholder ("[Manager to complete]").
// Real per-area signals (improvement ideas / data gaps) are folded in WHEN THEY
// EXIST so the draft grows richer as the improvement board fills; today most areas
// have none, so the draft leans on the area's name + description alone — honestly
// labelled "Proposed", never presented as an existing record.

import type { ArtifactType } from './types';

export interface AreaContext {
  key: string;
  label: string;
  description: string | null;
  /** Real signals from this area's improvement board — [] when none exist yet. */
  ideaSignals: Array<{ title: string; problem: string | null }>;
}

// ---------------------------------------------------------------------------
// What MyJKKN actually is.
//
// Drafts used to emit "[Manager to complete: <the group's information system>]"
// for something the model could have named outright: JKKN runs its OWN platform,
// and every department in this playbook already works inside it. Leaving a
// placeholder there made managers fill in an answer the draft should have known.
//
// The inventory below is DERIVED from lib/sidebarMenuLink.ts (the real desktop
// navigation source) — group labels and their top-level entries, condensed. Keep
// it in step with that file when modules are added or renamed; it is a grounding
// aid, so a stale entry is worse than a missing one.
// ---------------------------------------------------------------------------
const MYJKKN_PLATFORM = `About the software this department already uses:
JKKN runs its own platform, MyJKKN (www.jkkn.ai). It is the group's information system, ERP and portal in one — there is no separate product to name. So when a step, stage or clause needs "the system", name MyJKKN and the specific module below instead of emitting a placeholder. Only use a placeholder for a system if the work genuinely happens outside MyJKKN (a government portal, a bank, an accreditation body's own site).

MyJKKN modules, by area:
- Admissions: Admission CRM (/admission) with Leads, Applications, GD-PI, Counselors, Consultants, Schools Network, Marketing, AI Insights, Data Quality; Application Hub (/application-hub)
- Academic delivery: Academic (/academic) for timetables, attendance, internal assessment and period planning; Board of Studies (/bos); Reading — RCLTP (/rcltp); Session Feedback (/academic/session-feedback); Lesson Spine Review (/academic/curriculum-review); Foundation Programme (/foundation); Induction (/events/induction)
- Learner self-service: Learners (/learners) — My Timetable, My Attendance, My Marks, My Bills, Leave / OnDuty, My Development Plan, My Profile
- Senior Learner workspace: (/faculty) and PDE (/pde) for demonstrations and clinical cases
- People: HR (/hr) for recruitment, onboarding, leave and additional roles; the team directory (/staff); Work Pulse (/work-pulse)
- Money: Billing (/billing) for fees, invoices, receipts and refunds; Procurement (/procurement); Inventory Management (/ims/dashboard)
- Campus: Campus Living (/campus-living) for hostel, mess, residents and facility; Resources (/resource-management); Service Requests (/service-requests)
- Careers: CDC (/cdc) for campus drives, placements, internships, development plans, clubs, mentor pairings, training programmes and employer requirements
- Quality and compliance: Accreditation (/accreditation); Audit Workflow (/audit); Feedback (/feedback); Improvement Board (/improvement-board)
- Wellbeing and community: Health & Wellness (/health); Events (/events); Learners Council (/learners-council); Family Moments (/moments); Startup Studio (/startup-studio)
- Coordination: Calendar (/calendar); Meetings (/meetings); Projects (/projects); Solution Hub (/solutions); Documents (/documents)
- Learning extras: Value Added Courses (/vac); AI Pulse (/ai-pulse)
- Platform administration: Users and Role Management (/users); Organizations (/organizations); Reference / Masters (/reference); ID Cards (/admin/id-cards); System (/system); AI Assistant (/ai-query); Guide (/guide)`;

const SYSTEM_PROMPT = `You are helping an operations manager at JKKN, an Indian higher-education group, START a department playbook. You produce a PROPOSED STARTER TEMPLATE that a human manager will review, edit, and complete before it becomes official.

${MYJKKN_PLATFORM}

Hard rules:
- JKKN house terminology is MANDATORY in every string you emit. The ONLY acceptable words for people are: "learner"/"learners" (anyone enrolled in a programme), "Senior Learner"/"Senior Learners" (anyone who teaches), and "team member"/"team members" (every other employee). Never substitute the ordinary higher-education synonyms for these three groups — not in headings, not in descriptions, and not inside parenthetical lists (write "(learners, Senior Learners, team members)"). An approved playbook becomes an official JKKN document, so a wrong word ships institution-wide.
- Never invent specific people's names, real reporting lines, real policy/document numbers, dates, or money figures. Use a placeholder like "[Manager to complete]" wherever a real, area-specific value belongs. A MyJKKN module name is NOT such a value — name it.
- Ground your proposal in the area's name and description and any real signals given. Do not assert facts you were not given.
- Output ONLY a single valid JSON object matching the requested schema. No prose, no markdown fences.`;

function signalsBlock(ctx: AreaContext): string {
  if (!ctx.ideaSignals.length) {
    return 'Real signals from this area\'s improvement board: NONE on record yet. Base your proposal on the area name/description and standard practice for this function; mark every area-specific value as a placeholder.';
  }
  const lines = ctx.ideaSignals
    .slice(0, 12)
    .map((s, i) => `  ${i + 1}. ${s.title}${s.problem ? ` — ${s.problem}` : ''}`)
    .join('\n');
  return `Real signals from this area's improvement board (ground your proposal in these where relevant):\n${lines}`;
}

function userPrompt(ctx: AreaContext, type: ArtifactType): string {
  const head =
    `Functional area: "${ctx.label}" (key: ${ctx.key}).\n` +
    `Area description: ${ctx.description?.trim() || '(none provided)'}\n` +
    `${signalsBlock(ctx)}\n\n`;

  switch (type) {
    case 'organogram':
      return (
        head +
        `Propose a STARTER reporting structure (organogram) for this function at an Indian college group. ` +
        `JKKN stores no reporting-line data, so this is a template the manager will complete with real people.\n\n` +
        `Output JSON exactly of this shape:\n` +
        `{"proposed": true, "note": "one line telling the manager this is a starter to complete", ` +
        `"roles": [{"title": "role title", "reports_to": "title of the role this reports to, or null for the top", ` +
        `"responsibilities": "short summary", "holder": "[Manager to complete]"}]}\n` +
        `Propose the typical roles for this function (5-9 roles). Set "holder" to "[Manager to complete]" for EVERY role — never invent a person.`
      );
    case 'sop':
      return (
        head +
        `Draft a STARTER Standard Operating Procedure for this function.\n\n` +
        `Output JSON exactly of this shape:\n` +
        `{"proposed": true, "note": "one line telling the manager this is a starter to complete", ` +
        `"purpose": "what this SOP governs", ` +
        `"steps": [{"n": 1, "title": "step title", "detail": "what happens", "owner_role": "role responsible"}], ` +
        `"placeholders": ["list any area-specific value the manager must fill in"]}\n` +
        `Base the steps on standard practice for this function (6-12 steps). Where a step happens in the platform, name the MyJKKN module — that is a known fact, not a placeholder. Mark only genuinely area-specific values (paper forms, thresholds, external systems) as placeholders rather than inventing them.`
      );
    case 'workflow':
      return (
        head +
        `Draft a STARTER workflow (process flow) for this function.\n\n` +
        `Output JSON exactly of this shape:\n` +
        `{"proposed": true, "note": "one line telling the manager this is a starter to complete", ` +
        `"stages": [{"n": 1, "name": "stage name", "actor_role": "who acts", "action": "what they do", ` +
        `"handoff_to": "the next stage's name, or null if final"}]}\n` +
        `Propose the typical stages end-to-end (5-10 stages). Name the MyJKKN module where a stage happens inside the platform; use placeholders only for values that are genuinely area-specific (thresholds, SLAs, external bodies).`
      );
    case 'policy':
      return (
        head +
        `Draft a STARTER department POLICY for this function — the short rulebook that says what this department will and will not do, and who is accountable. ` +
        `An officer (CEO / CAO / EAO) reviews and signs it off, or replaces it entirely by uploading the department's real policy document.\n\n` +
        `Output JSON exactly of this shape:\n` +
        `{"proposed": true, "note": "one line telling the reviewer this is a starter to complete", ` +
        `"purpose": "what this policy exists to protect or guarantee", ` +
        `"scope": "who and what it covers", ` +
        `"clauses": [{"n": 1, "title": "clause title", "text": "the rule, stated as one plain sentence", "owner_role": "role accountable for it"}], ` +
        `"review_cycle": "how often this policy should be reviewed", ` +
        `"placeholders": ["list any area-specific value the reviewer must fill in"]}\n` +
        `Write 6-12 clauses covering standard practice for this function at an Indian college group. State each rule plainly — no legal boilerplate. ` +
        `Where a rule is carried out in MyJKKN, name the module. Never invent a real policy number, an approval authority by name, a statutory citation, a penalty amount, or a date — mark those as placeholders.`
      );
  }
}

/** Returns the { system, prompt } pair to send on the ₹0 Max lane. */
export function assembleArtifactPrompt(
  ctx: AreaContext,
  type: ArtifactType,
): { system: string; prompt: string } {
  return { system: SYSTEM_PROMPT, prompt: userPrompt(ctx, type) };
}

/**
 * Tolerantly pull the first JSON object out of a model's text response.
 * Returns null if no parseable object is found (caller records a failure).
 */
export function extractJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
