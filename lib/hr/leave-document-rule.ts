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
   * True when the type wants a document but this particular request is exempt
   * — under the threshold, or emergency. Distinct from `required: false` on a
   * type that never wants one, because the UI still offers an OPTIONAL upload
   * here rather than hiding the field entirely.
   */
  optional: boolean;
  /** Why, in words the applicant can act on. Null when the type wants nothing. */
  reason: string | null;
}

/**
 * EMERGENCY IS A DEFERRAL, NOT AN EXEMPTION. The drawer has always promised
 * "Bypasses advance notice; supporting documents required within 48h", and that
 * promise is the whole point of the flag: something happened and the paperwork
 * cannot exist yet. Blocking the request until a certificate is attached would
 * make emergency leave impossible to file in an emergency.
 *
 * So an emergency request submits without one and stays visibly outstanding —
 * see documentOutstanding() — rather than being quietly treated as complete.
 */
export function leaveDocumentRequirement(
  policy: LeaveDocumentPolicy | null | undefined,
  totalDays: number,
  isEmergency: boolean,
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

  if (isEmergency) {
    return {
      required: false,
      optional: true,
      reason:
        'Emergency requests can be filed without the document, but it must follow within 48 hours. Attach it now if you have it.',
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

/**
 * A submitted request that still owes its document — an emergency filed empty.
 * Approvers see this, so "the certificate is coming" is a visible state rather
 * than something everyone has to remember.
 */
export function documentOutstanding(
  policy: LeaveDocumentPolicy | null | undefined,
  totalDays: number,
  isEmergency: boolean,
  documentCount: number,
): boolean {
  if (documentCount > 0) return false;
  if (!policy?.requires_documents) return false;
  const threshold = policy.document_required_after_days;
  if (threshold != null && totalDays <= threshold) return false;
  // Only reachable for an emergency: a non-emergency request in this state
  // could not have been submitted in the first place.
  return isEmergency;
}
