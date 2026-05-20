/**
 * Campus Living — Hosteller Onboarding types.
 *
 * Wired against live prod tables (probed via information_schema 2026-05-20):
 *
 *   hostel_onboarding_templates
 *     id uuid pk
 *     institution_id uuid NOT NULL
 *     name text NOT NULL default 'Default Onboarding'
 *     items jsonb NOT NULL default '[]'
 *     is_active boolean default true
 *     created_at / updated_at timestamptz default now()
 *
 *   hostel_onboarding_checklists
 *     id uuid pk
 *     institution_id uuid NOT NULL
 *     allocation_id uuid NOT NULL
 *     learner_id uuid NOT NULL
 *     template_id uuid (nullable)
 *     status onboarding_status_enum NOT NULL default 'not_started'
 *       enum: 'not_started' | 'in_progress' | 'completed' | 'skipped'
 *     items jsonb NOT NULL default '[]'
 *     started_at / completed_at timestamptz (nullable)
 *     completed_by uuid (nullable)
 *     notes text (nullable)
 *     created_at / updated_at timestamptz default now()
 *
 * The `items` jsonb is a flat array. Each item is a checklist line with a
 * stable client-generated key + completed flag. Templates seed checklists
 * (template.items copied into checklist.items at create-time).
 */

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped';

/** Shape of a single checklist item (in `items` jsonb). */
export interface OnboardingItem {
  /** Stable key — generated client-side at create time so server/UI can match. */
  key: string;
  /** Display label e.g. "ID verification". */
  label: string;
  /** Optional longer description / instructions. */
  description?: string;
  /** Completion state. */
  completed: boolean;
  /** Who ticked it off (uuid). */
  completed_by?: string | null;
  /** When it was ticked off (ISO timestamp). */
  completed_at?: string | null;
}

/** Reusable template — institution-scoped. */
export interface OnboardingTemplate {
  id: string;
  institution_id: string;
  name: string;
  items: OnboardingItem[];
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Per-learner checklist instance. */
export interface OnboardingChecklist {
  id: string;
  institution_id: string;
  allocation_id: string;
  learner_id: string;
  template_id: string | null;
  status: OnboardingStatus;
  items: OnboardingItem[];
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Checklist row with optional Supabase joins. */
export interface OnboardingChecklistWithJoins extends OnboardingChecklist {
  learner?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  allocation?: {
    id: string;
    learner_id: string;
    block_id: string | null;
    room_id: string | null;
    bed_id: string | null;
  } | null;
}

// ── Write-side payloads ──────────────────────────────────────────────────

export interface CreateOnboardingTemplateInput {
  institution_id: string;
  name: string;
  items: OnboardingItem[];
  is_active?: boolean;
}

export interface UpdateOnboardingTemplateInput {
  name?: string;
  items?: OnboardingItem[];
  is_active?: boolean;
}

export interface CreateOnboardingChecklistInput {
  institution_id: string;
  allocation_id: string;
  learner_id: string;
  template_id?: string | null;
  items: OnboardingItem[];
  notes?: string | null;
}

export interface UpdateOnboardingChecklistInput {
  status?: OnboardingStatus;
  items?: OnboardingItem[];
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
}

/** Default starter items — used when no active template exists. */
export const DEFAULT_ONBOARDING_ITEMS: OnboardingItem[] = [
  { key: 'id-verification', label: 'ID & police verification', completed: false },
  { key: 'room-inspection', label: 'Room inspection', completed: false },
  { key: 'biometric-enrolment', label: 'Biometric enrolment', completed: false },
  { key: 'mess-registration', label: 'Mess registration', completed: false },
  { key: 'induction-briefing', label: 'Induction briefing', completed: false },
  { key: 'parent-signoff', label: 'Parent / guardian sign-off', completed: false },
];

/** Compute checklist status from items (used when items change). */
export function computeChecklistStatus(items: OnboardingItem[]): OnboardingStatus {
  if (!items.length) return 'not_started';
  const done = items.filter((i) => i.completed).length;
  if (done === 0) return 'not_started';
  if (done === items.length) return 'completed';
  return 'in_progress';
}

/** Progress as a 0–100 integer. */
export function computeChecklistProgress(items: OnboardingItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((i) => i.completed).length;
  return Math.round((done / items.length) * 100);
}
