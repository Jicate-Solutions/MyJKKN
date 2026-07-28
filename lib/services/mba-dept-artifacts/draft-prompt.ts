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

const SYSTEM_PROMPT = `You are helping an operations manager at JKKN, an Indian higher-education group, START a department playbook. You produce a PROPOSED STARTER TEMPLATE that a human manager will review, edit, and complete before it becomes official.

Hard rules:
- JKKN house terminology is MANDATORY in every string you emit. The ONLY acceptable words for people are: "learner"/"learners" (anyone enrolled in a programme), "Senior Learner"/"Senior Learners" (anyone who teaches), and "team member"/"team members" (every other employee). Never substitute the ordinary higher-education synonyms for these three groups — not in headings, not in descriptions, and not inside parenthetical lists (write "(learners, Senior Learners, team members)"). An approved playbook becomes an official JKKN document, so a wrong word ships institution-wide.
- Never invent specific people's names, real reporting lines, real policy/document numbers, dates, or money figures. Use a placeholder like "[Manager to complete]" wherever a real, area-specific value belongs.
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
        `Base the steps on standard practice for this function (6-12 steps). Mark any org-specific value (forms, thresholds, systems) as a placeholder rather than inventing it.`
      );
    case 'workflow':
      return (
        head +
        `Draft a STARTER workflow (process flow) for this function.\n\n` +
        `Output JSON exactly of this shape:\n` +
        `{"proposed": true, "note": "one line telling the manager this is a starter to complete", ` +
        `"stages": [{"n": 1, "name": "stage name", "actor_role": "who acts", "action": "what they do", ` +
        `"handoff_to": "the next stage's name, or null if final"}]}\n` +
        `Propose the typical stages end-to-end (5-10 stages). Do not invent real system names or SLAs — use placeholders where an area-specific value belongs.`
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
