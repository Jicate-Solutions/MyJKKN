/**
 * HR Onboarding — TypeScript contracts for the per-cadre onboarding checklist
 * TEMPLATE table.
 *
 * Created: 2026-05-10 (T3.1).
 * Spec: specs/hr-module-decomposition-2026-05-09.md
 *
 * Mirrors `hr_onboarding_checklists` schema. This is a TEMPLATE table — one
 * row per (HR organization × cadre) defining the steps a new joinee in that
 * cadre is expected to complete (ID card issued, email setup, HOD intro, …).
 *
 * IMPORTANT: There is NO companion instance table in production yet. The
 * service + UI built on these types are admin-CRUD on the templates. Per-
 * staff progress tracking (one row per joinee × step with completion state)
 * is a Phase 2 gap — see PR body for the schema needed.
 */

// ---------------------------------------------------------------------------
// Step shape inside the JSONB `steps` column.
// ---------------------------------------------------------------------------

/**
 * One ordered step in an onboarding checklist template. Mirrors the seed
 * shape verified in production:
 *   { "order": 1, "title": "ID card issued", "expected_by_day": 1 }
 */
export interface HROnboardingStep {
  /** 1-based position. Used to sort the step list. */
  order: number;
  /** Plain English step description shown to staff + HR. */
  title: string;
  /**
   * Days from start date by which this step is expected to complete.
   * Optional — some steps (e.g. "30-day probation") are calendar-based
   * already, others (welcome meeting) are flexible.
   */
  expected_by_day?: number;
}

// ---------------------------------------------------------------------------
// Template row — verbatim from the production schema.
// ---------------------------------------------------------------------------

export interface HROnboardingChecklist {
  id: string;
  hr_organization_id: string;
  /** Null = applies to all cadres in this org (catch-all default). */
  applies_to_cadre_id: string | null;
  checklist_name: string;
  steps: HROnboardingStep[];
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  superseded_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HROnboardingChecklistInsert {
  hr_organization_id: string;
  applies_to_cadre_id?: string | null;
  checklist_name: string;
  steps: HROnboardingStep[];
  is_active?: boolean;
}

export type HROnboardingChecklistUpdate = Partial<
  Pick<
    HROnboardingChecklist,
    | 'applies_to_cadre_id'
    | 'checklist_name'
    | 'steps'
    | 'is_active'
    | 'valid_until'
    | 'superseded_by'
  >
>;

export interface OnboardingChecklistFilters {
  hrOrganizationId?: string | null;
  cadreId?: string | null;
  /** When set, only active rows are returned. Defaults to true in service. */
  activeOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Joined / view shapes for UI rendering.
// ---------------------------------------------------------------------------

/**
 * Checklist row + denormalized organization + cadre display fields. The
 * service composes this from a Supabase select with FK embeds.
 */
export interface HROnboardingChecklistView extends HROnboardingChecklist {
  organization_name: string | null;
  cadre_name: string | null;
  cadre_code: string | null;
}

// ---------------------------------------------------------------------------
// Step parsing helpers (used by both service + admin UI).
// ---------------------------------------------------------------------------

/**
 * Render the steps[] array as a human-editable text block, one step per line:
 *
 *   1. ID card issued (by day 1)
 *   2. JKKN email setup (by day 2)
 *   3. Principal welcome meeting (by day 2)
 *
 * Round-trips cleanly through parseStepsText. The "by day N" suffix is
 * optional in input — the parser accepts a leading "1." through "10.", a
 * step title, and an optional trailing "(by day N)" / "(day N)" / "(N days)".
 */
export function formatStepsText(steps: HROnboardingStep[]): string {
  if (!Array.isArray(steps) || steps.length === 0) return '';
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const day = s.expected_by_day;
      const suffix = typeof day === 'number' ? ` (by day ${day})` : '';
      return `${s.order}. ${s.title}${suffix}`;
    })
    .join('\n');
}

/**
 * Parse a text block (one step per line) back to a HROnboardingStep[]. Each
 * non-empty line becomes one step. Order is auto-assigned 1..N based on
 * line position — any leading "N." in the text is ignored. Trailing
 * "(by day N)" / "(day N)" / "(N days)" parsed into expected_by_day.
 *
 * Throws on empty input or lines with no title text after stripping the
 * leading number.
 */
export function parseStepsText(input: unknown): HROnboardingStep[] {
  if (typeof input !== 'string') {
    throw new Error('Steps must be text — one step per line.');
  }
  const lines = input
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error('Add at least one step. One step per line.');
  }

  const out: HROnboardingStep[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Strip leading "1.", "2.", "10.", etc. (optional).
    const titleAndDay = line.replace(/^\s*\d+\.\s*/, '');
    // Pull off optional trailing "(by day N)" / "(day N)" / "(N days)".
    const dayMatch = titleAndDay.match(
      /\s*\((?:by\s+day\s+|day\s+)?(\d+)(?:\s*days?)?\)\s*$/i,
    );
    let title = titleAndDay;
    let expectedByDay: number | undefined;
    if (dayMatch) {
      title = titleAndDay.slice(0, dayMatch.index).trim();
      expectedByDay = Number.parseInt(dayMatch[1]!, 10);
      if (!Number.isFinite(expectedByDay) || expectedByDay < 0) {
        expectedByDay = undefined;
      }
    }
    title = title.trim();
    if (!title) {
      throw new Error(
        `Step ${i + 1} has no description. Each line needs a title.`,
      );
    }
    const step: HROnboardingStep = { order: i + 1, title };
    if (typeof expectedByDay === 'number') {
      step.expected_by_day = expectedByDay;
    }
    out.push(step);
  }
  return out;
}
