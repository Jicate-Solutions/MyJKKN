// app/(routes)/accreditation/naac/narratives/_lib/narrative-ui.ts
// ============================================================================
// Shared status + grounding vocabulary for the AI NAAC narrative drafter UI.
// The list page and the detail page render the same badges — keep the labels,
// order, and colours here so the two surfaces never drift.
// (feature: grounded per-metric accreditation narratives, human-verified)
// ============================================================================

/** The workflow states of one narrative (mirrors the DB CHECK constraint). */
export type NarrativeStatus =
  | 'ai_drafted'
  | 'owner_okayed'
  | 'principal_approved'
  | 'director_submitted'
  | 'revision_requested';

/** The deterministic grounding gate's verdict (null = not yet validated). */
export type GroundingVerdict = 'grounded' | 'ungrounded' | null;

/** Advance order used for the filter chips + the progress read-out. */
export const NARRATIVE_STATUS_ORDER: NarrativeStatus[] = [
  'ai_drafted',
  'revision_requested',
  'owner_okayed',
  'principal_approved',
  'director_submitted',
];

/** Human labels — JKKN vocabulary; role names (Principal/Director) kept as-is. */
export const STATUS_LABEL: Record<NarrativeStatus, string> = {
  ai_drafted: 'AI drafted',
  revision_requested: 'Revision requested',
  owner_okayed: 'Owner okayed',
  principal_approved: 'Principal approved',
  director_submitted: 'Director submitted',
};

/** Badge tint per status (light + dark). */
export const STATUS_BADGE_CLASS: Record<NarrativeStatus, string> = {
  ai_drafted:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  revision_requested:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  owner_okayed:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  principal_approved:
    'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  director_submitted:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
};

/** Shown when owner_user_id IS NULL — the draft sits in the IQAC/admin queue. */
export const UNASSIGNED_OWNER_LABEL = 'Unassigned — IQAC queue';
