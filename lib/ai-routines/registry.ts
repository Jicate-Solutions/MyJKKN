// ============================================================================
// AI ROUTINES REGISTRY — merged index + lookup helpers
// ============================================================================
// One curated static registry of every AI/LLM routine in MyJKKN, assembled from
// per-category files (each owned by one discovery agent, non-overlapping). The
// /admin/ai-routines page reads this; the trigger API resolves routines by id.
// ============================================================================

import { type AIRoutine, type RoutineCategoryId } from './types';
import { SCF_ROUTINES } from './scf-session-feedback';
import { FEEDBACK_ADAPTER_ROUTINES } from './feedback-adapters';
import { AI_PULSE_ROUTINES } from './ai-pulse';
import { ADMISSION_AI_ROUTINES } from './admission-ai';
import { INDUCTION_AI_ROUTINES } from './induction-ai';
import { CURRICULUM_AI_ROUTINES } from './curriculum-ai';
import { MISC_AI_ROUTINES } from './misc-ai';
import { LOOP_GOVERNANCE_ROUTINES } from './loop-governance';

export const AI_ROUTINES: AIRoutine[] = [
  ...SCF_ROUTINES,
  ...FEEDBACK_ADAPTER_ROUTINES,
  ...AI_PULSE_ROUTINES,
  ...ADMISSION_AI_ROUTINES,
  ...INDUCTION_AI_ROUTINES,
  ...CURRICULUM_AI_ROUTINES,
  ...MISC_AI_ROUTINES,
  ...LOOP_GOVERNANCE_ROUTINES,
];

export function getRoutineById(id: string): AIRoutine | undefined {
  return AI_ROUTINES.find((r) => r.id === id);
}

export function routinesByCategory(categoryId: RoutineCategoryId): AIRoutine[] {
  return AI_ROUTINES.filter((r) => r.category === categoryId);
}

/** Count of routines that are safe to fire on demand (for the header summary). */
export function triggerableCount(): number {
  return AI_ROUTINES.filter((r) => r.type === 'cron' && r.safeToManualTrigger).length;
}
