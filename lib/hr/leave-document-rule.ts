// lib/hr/leave-document-rule.ts
//
// Pure module (no DB, no React) deciding ONE question: does this leave request
// have to carry a supporting document?
//
// It lives on its own because the answer is needed in two places that must
// never disagree — the Apply Leave drawer, which decides whether to show the
// upload field and block the button, and LeaveService.createApplication, which
// is the authority. A drawer that asks for a file the server does not require
// is an annoyance; a drawer that does NOT ask for one the server requires is a
// dead end the user cannot get out of. Same function, both sides.
//
// THE EMERGENCY DEFERRAL IS GONE (2026-09-12). This used to take a third
// argument, `isEmergency`, and a request carrying it could be filed without the
// document on the promise that one would follow within 48 hours. HR removed the
// Emergency feature, so there is no longer anything that can excuse a missing
// document: a type that requires one requires it at submit, for every request.
// The parameter was dropped rather than defaulted to false, so that any call
// site still passing it fails to compile instead of silently losing a rule.

/** The slice of a leave type this rule reads. */
export interface LeaveDocumentPolicy {
  requires_documents: boolean;
  /**
   * Length in days above which the document becomes mandatory.
   * NULL = no threshold, so it is required for any length at all.
   * On-Duty is (true, null); Half Pay Leave is (true, 3).
   */
  document_required_after_days: number | null;
}

export interface LeaveDocumentRequirement {
  /** Whether THIS request must carry at least one document to be submitted. */
  required: boolean;
  /**
   * True when the type wants a document but this particular request is under
   * the threshold. Distinct from `required: false` on a type that never wants
   * one, because the UI still offers an OPTIONAL upload here rather than hiding
   * the field entirely.
   */
  optional: boolean;
  /** Why, in words the applicant can act on. Null when the type wants nothing. */
  reason: string | null;
}

export function leaveDocumentRequirement(
  policy: LeaveDocumentPolicy | null | undefined,
  totalDays: number,
): LeaveDocumentRequirement {
  if (!policy?.requires_documents) {
    return { required: false, optional: false, reason: null };
  }

  const threshold = policy.document_required_after_days;

  if (threshold != null && totalDays <= threshold) {
    return {
      required: false,
      optional: true,
      reason: `A supporting document is only required past ${threshold} day${threshold === 1 ? '' : 's'}. You may still attach one.`,
    };
  }

  return {
    required: true,
    optional: false,
    reason:
      threshold == null
        ? 'This leave type requires a supporting document.'
        : `This request is longer than ${threshold} day${threshold === 1 ? '' : 's'}, so a supporting document is required.`,
  };
}
