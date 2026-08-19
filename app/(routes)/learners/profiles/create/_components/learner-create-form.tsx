'use client';

// ============================================
// LEARNER CREATE FORM — WRAPPER COMPONENT
// ============================================
// Created: 2026-05-22
// Purpose: Wraps EnquiryForm for single-record learner creation
// flow at /learners/profiles/create. Provides strict validation
// (createLearnerSchema), custom submit handler, and post-create
// navigation to /learners/profiles/{id}.
// Spec: docs/superpowers/specs/2026-05-22-learners-create-form-design.md
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/card';
import { EnquiryForm } from '../../../enquiries/_components/enquiry-form';
import { useCreateLearnerProfile } from '@/hooks/use-learner-profiles';
import {
  createLearnerSchema,
  createLearnerWithDefaults,
} from '@/lib/validations/learner-create-schema';
import { getErrorMessage } from '@/lib/utils';
import type { CreateLearnerProfileDto } from '@/types/learner-profile';

// EnquiryForm tab IDs — order must match ALL_TABS in enquiry-form.tsx.
const VISIBLE_TABS = [
  'basic-details',
  'contact-details',
  'course-selection',
  'academic-information',
  'accommodation-preferences',
] as const;

export function LearnerCreateForm() {
  const router = useRouter();
  const createMutation = useCreateLearnerProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Called by EnquiryForm.commitSubmit with the DB-ready payload
   * (after formatFormDataForAPI). The form early-returns after this
   * resolves, so we own:
   *  1. strict 28-field validation
   *  2. service call (createLearnerProfile)
   *  3. success/error toasts
   *  4. navigation
   */
  const handleStrictSubmit = async (data: Record<string, unknown>) => {
    if (isSubmitting || createMutation.isPending) return; // double-submit guard

    const parsed = createLearnerSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(form)'}: ${i.message}`)
        .slice(0, 6); // cap to keep toast readable
      const more =
        parsed.error.issues.length > 6
          ? ` (+${parsed.error.issues.length - 6} more)`
          : '';
      toast.error(
        `Please fill all required fields:\n${fieldErrors.join('\n')}${more}`,
        { duration: 7000 },
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = createLearnerWithDefaults(parsed.data);

      const created = await createMutation.mutateAsync(
        // CreateLearnerProfileDto is structurally compatible — payload has
        // a strict subset of the DTO fields. Cast avoids surfacing every
        // DTO-internal optional field from learner-profile.ts here.
        payload as unknown as CreateLearnerProfileDto,
      );

      toast.success(
        created.is_profile_complete
          ? 'Learner created and activated.'
          : 'Learner created.',
      );
      router.push(`/learners/profiles/${created.id}`);
    } catch (err) {
      toast.error(`Could not create learner: ${getErrorMessage(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <EnquiryForm
        // `learner` undefined → create mode in the shared form
        learner={undefined}
        // 5 tabs only; Finance hidden (matches bulk upload coverage)
        visibleTabs={[...VISIBLE_TABS]}
        // Suppress "Save Draft" — create flow is strict, single-shot
        hideDraft={true}
        // Profiles covers learners joining at any stage (transfers, back-dated
        // records, re-admissions), so any department stays selectable and the
        // semester isn't auto-rewritten. That policy is admission-capture
        // only — it lives in the enquiry flow.
        enforceAdmissionRules={false}
        // Tamil-script name inputs on Basic Details. Scoped to the Learner
        // Profiles screens — the enquiry and student self-fill flows that share
        // this form stay as they were.
        showTamilNames
        // ABC ID / EMIS / UMIS — same Profiles-only scoping.
        showLearnerIdentifiers
        submitLabel="Create Learner"
        // Custom submit — form's commitSubmit early-returns after this
        onSubmit={handleStrictSubmit}
        // onSuccess is intentionally NOT passed: when onSubmit is set,
        // EnquiryForm.commitSubmit returns early and never invokes onSuccess.
        // We handle navigation inside handleStrictSubmit above.
      />
    </Card>
  );
}
