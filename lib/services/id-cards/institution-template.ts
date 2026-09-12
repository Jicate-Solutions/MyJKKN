// ============================================================================
// lib/services/id-cards/institution-template.ts
// Created: 2026-09-05 — Person → institution → applicable ACTIVE template.
//
// An institution keeps SEVERAL active templates (Learners, Senior Learners,
// Administrators…). Selection: the person's institution, the audience implied
// by who they are (learner vs team member), then the purpose the operator
// chose (or the institution's default for that audience). The picker's value
// is only a fallback for institutions with no usable template.
// ============================================================================

import type { IdCardTemplateOption } from './print-jobs-client';
import {
  selectTemplateForPerson,
  type TemplateAudience
} from '@/lib/id-cards/template-purpose';

export interface TemplateChoice {
  template: IdCardTemplateOption;
  /** True when the institution had no usable template and the fallback was used. */
  usedFallback: boolean;
}

/**
 * Pick the template for a person: their institution's active template for the
 * audience (and purpose when given), else the fallback, else null.
 */
export function pickTemplateForInstitution(
  templates: readonly IdCardTemplateOption[],
  institutionId: string | null | undefined,
  fallbackTemplateId: string | null | undefined,
  options: { audience?: TemplateAudience; purposeKey?: string | null } = {}
): TemplateChoice | null {
  const audience = options.audience ?? 'learner';
  const own = selectTemplateForPerson(templates, institutionId, audience, options.purposeKey);
  if (own) return { template: own, usedFallback: false };
  const fallback = fallbackTemplateId
    ? templates.find((t) => t.id === fallbackTemplateId) ?? null
    : null;
  return fallback ? { template: fallback, usedFallback: true } : null;
}
