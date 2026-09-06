// lib/services/payments/fee-heads.ts
//
// Routing slots for the Razorpay credential vault.
//
// `razorpay_accounts.fee_head` decides WHICH merchant account a payment resolves to:
// fn_get_razorpay_account matches `fee_head = <asked> OR fee_head IS NULL`, most
// specific first. It is free text in the database, which is convenient — a new slot
// needs no migration — but it means a typo silently resolves to the wrong account,
// or to none at all and thence to the common env account.
//
// So any slot referenced from more than one place belongs here, imported by both the
// admin UI that creates the account row and the service that later asks for it.

/**
 * Counter sales in the IMS point-of-sale.
 *
 * Deliberately its own slot rather than reusing 'other': store takings must be
 * routable — and reportable — separately from fee income, and 'other' is a
 * catch-all that some future fee type will reasonably want.
 *
 * NOTE the consequence of this being a distinct slot: an institution whose only
 * account sits under 'tuition' will NOT match a POS request, and resolution falls
 * through to the common env account. Callers must therefore verify they received an
 * institution-scoped account (`RazorpayCredentials.source === 'institution'`) and
 * refuse rather than collect counter money into the wrong merchant account.
 */
export const IMS_POS_FEE_HEAD = 'ims_pos';

/**
 * Paid course events (/courses) — fees an external participant pays for a
 * short course, as opposed to a learner's academic tuition.
 *
 * Its own slot rather than reusing 'tuition' because the money is different in
 * kind: course income is a discrete commercial programme an institution may
 * want settled, reconciled and reported apart from academic fees, and reusing
 * 'tuition' would make that permanently impossible to separate after the fact.
 *
 * The consequence, per the note above, is deliberate: an institution whose only
 * account sits under another head will NOT match, resolution falls through to
 * the common env account, and the course payment route REFUSES rather than
 * collecting a college's course fees into the shared merchant account. Routing
 * somebody's money is a decision an administrator makes, not one a fallback
 * makes silently.
 */
export const COURSE_FEE_HEAD = 'course';
