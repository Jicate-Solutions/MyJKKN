// ============================================================================
// AI ROUTINES REGISTRY — types + category metadata
// ============================================================================
// Created: 2026-07-01
// Backs the /admin/ai-routines control page: a single operator surface listing
// every AI/LLM-powered routine in MyJKKN (crons, endpoints, interactive tools),
// with human-readable schedule, what-it-does, config knobs, side-effects, and a
// permission-gated "Run now" trigger.
//
// V1 is a curated STATIC registry (build-time data, one file per category). This
// mirrors the honest cost of the alternative: making every cron's knobs runtime-
// editable is a per-cron refactor (Director's "config = a row + reader fn" rule),
// tracked as phase 2. V1 = see + trigger; phase 2 = edit schedules/thresholds.
// ============================================================================

export type RoutineType = 'cron' | 'endpoint' | 'interactive' | 'service';

export type RoutineCategoryId =
  | 'scf-session-feedback'
  | 'feedback-adapters'
  | 'ai-pulse'
  | 'admission-ai'
  | 'induction-ai'
  | 'curriculum-ai'
  | 'misc-ai';

export interface AIRoutine {
  /** stable kebab slug, unique across the registry */
  id: string;
  name: string;
  category: RoutineCategoryId;
  type: RoutineType;
  /** human-readable, e.g. "Daily · 5:47 UTC" or "On demand" */
  schedule: string;
  /** raw cron expression from vercel.json, if a cron */
  cronExpr?: string;
  /** the path an operator hits to run it now (crons: /api/cron/<name>) */
  triggerPath: string;
  /** does it actually call Claude/Anthropic (directly or via an AI service)? */
  callsClaude: boolean;
  /**
   * feature_key in ai_model_config for the model this routine's backing code
   * resolves at runtime. Drives the model+spend chip on /admin/ai-routines and
   * the "Used by" column on /admin/ai-models. Unset when the routine has no
   * config row (rules-based routines, or no matching seeded key).
   */
  featureKey?: string;
  /** 1-2 plain sentences a non-coder understands */
  whatItDoes: string;
  /** hardcoded constants/thresholds it uses (name=value pairs) or "none" */
  configKnobs: string;
  /** what a manual run writes/sends, or "read-only" */
  sideEffects: string;
  /** true if an on-demand run is safe/idempotent; false if it messages humans / is destructive */
  safeToManualTrigger: boolean;
  /**
   * true if this routine runs on the Director's Claude Max subscription via a
   * Mac-side scheduled runner (the "Max lane"); the API cron is the fallback.
   * Max-lane routines get a "Run on Max" button on /admin/ai-routines that
   * queues a request for the Mac poller to pick up (max_lane_requests).
   */
  maxLane?: boolean;
  notes?: string;
}

export interface RoutineCategory {
  id: RoutineCategoryId;
  label: string;
  blurb: string;
}

export const ROUTINE_CATEGORIES: RoutineCategory[] = [
  {
    id: 'scf-session-feedback',
    label: 'Session Feedback loop (SCF)',
    blurb:
      'Students rate how well they understood each class → AI coaches teachers, writes private notes to struggling learners, and measures whether the coaching worked.',
  },
  {
    id: 'feedback-adapters',
    label: 'Feedback intake adapters',
    blurb:
      'Pull feedback from many channels — class, mess, parent, Instagram DM/comments — into one spine, AI-classified into themes.',
  },
  {
    id: 'ai-pulse',
    label: 'AI Pulse',
    blurb:
      'Faculty AI-capability pulse cycles: quizzes, rotation ticks, anomaly scans, and the weekly digest.',
  },
  {
    id: 'admission-ai',
    label: 'Admission AI & Query',
    blurb:
      'AI-generated admission insights and the natural-language data-query interface.',
  },
  {
    id: 'induction-ai',
    label: 'Induction AI',
    blurb: 'Generates fresher-induction playbooks and scores session effectiveness.',
  },
  {
    id: 'curriculum-ai',
    label: 'Curriculum AI (lesson spine)',
    blurb:
      'Drafts a per-course teaching lesson spine (+ optional Concept-Application/capstone briefs) from BoS syllabi — always as unpublished drafts a faculty must review and approve.',
  },
  {
    id: 'misc-ai',
    label: 'Other AI routines',
    blurb:
      'Career guidance, exam question generation, work-pulse analysis/translation, and the attention-bar assistant.',
  },
];
