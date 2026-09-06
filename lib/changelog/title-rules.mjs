/**
 * Title rules for the What's New changelog.
 *
 * Extracted from scripts/generate-changelog.mjs so they can be TESTED. The
 * generator runs git at import time, so a test cannot import it; these three
 * rules decide what a reader does and does not see, and until this file existed
 * all of them could have silently stopped firing with the suite still green.
 *
 * Every pattern below is here because of a specific real entry that reached the
 * page, named in the comment beside it.
 */

/**
 * A trailing bracket or paren that holds nothing but bug-tracker ids. Our
 * auto-triage bot appends these, e.g.
 *   "Surface plain-English reasons when Move-to-Account is refused
 *    [auto-triage BUG-004394 BUG-004352]"
 * The ids mean nothing to a reader and eat the end of the line on a phone.
 *
 * Deliberately narrow: it only fires when the bracket is ENTIRELY bug ids (plus
 * "auto-triage", separators and a short tail like "+batch" or "#1552"). Brackets
 * that carry real meaning — "[dark]", "[supersedes #1769]", "[M2+M3]",
 * "[DRAFT — preview-verifying]" — are left alone. 110 titles are trimmed, and
 * every trimmed run verifiably contained a BUG marker; none is emptied.
 *
 * Applied repeatedly, because the bot also emits runs of them:
 * "…[BUG-004123][BUG-004121][BUG-004120][BUG-004119][BUG-004117][BUG-003960]".
 */
const BUG_REF_TAIL =
  /\s*[[(](?:auto-triage[\s,]*)?(?:#?BUG[-\s]?\d+)(?:[\s,/+&]*(?:#?BUG[-\s]?)?\d+[a-z]?)*(?:[\s,]*(?:\+batch|follow-up|reopened|#\d+|[a-z]?\d[a-z]?))*[\])]\s*$/i;

function stripBugRefs(s) {
  let out = s;
  for (let i = 0; i < 12 && BUG_REF_TAIL.test(out); i++) out = out.replace(BUG_REF_TAIL, '');
  return out;
}

/**
 * Subjects about the build toolchain rather than the product. Each pattern is
 * here because of a specific entry that reached the page and told a reader
 * nothing they could act on — the real titles are named beside each one. They
 * are matched on the whole subject, so a feature that merely *mentions* one of
 * these words in passing is not affected.
 *
 * Kept narrow on purpose. Keyword sweeps for "CI", "bump", "lint" were tried and
 * rejected: "RACI picker", "bump fetch limit 100 → 500" and "pre-commit dialog"
 * are all real user-facing news that a looser rule would have deleted.
 *
 * Notably NOT dropped: "await searchParams on check-in page (Next 16) so
 * enrollmentId reaches the form" — the framework wording is ugly, but it is
 * describing a real broken form, so it stays.
 */
const INTERNAL_ENGINEERING = [
  /\btypecheck\b/i,                    // "two type errors found by typecheck"
  /\btypescript errors?\b/i,           // "resolve 3 pre-existing TypeScript errors blocking CI"
  /\blint fixes?\b/i,                  // "PR 4b step 7 — lint fixes (no setState in effect)"
  /\bturbopack\b/i,                    // "export normalizeRoute so Turbopack dev can resolve the import"
  /\bsuspense boundary\b/i,            // "wrap useSearchParams in Suspense boundary"
  /\bcache components\b/i,             // "resolve Next.js 16 prerender build errors with Cache Components"
  /\bprerender\b/i,                    // (same commit; the two words co-occur)
  /\bdynamic route param issues\b/i,   // "resolve Next.js 16 dynamic route param issues in syllabi API"
  /\bawait dynamic params\b/i,         // "Await dynamic params in taxonomy API route (Next.js 16)"
  /\bbarrel export\b/i,                // "TabbedFormShell + barrel export"
  /\bcodeowners\b/i,                   // "safety infrastructure — CODEOWNERS + error reporting"
];

/**
 * Titles that name a place and nothing else: "bos issue" (five separate
 * commits), "import issue", "deploy issue", "ia issue". At most three words,
 * the last of which is a content-free noun. A reader learns strictly nothing
 * from these, and five identical "Bos issue" rows make the whole page look
 * untended.
 *
 * The word cap is what keeps this safe. Four-word titles that name a specific
 * screen — "parent portal login issue", "timetable Day-wise Attendance issue",
 * "board member permission issue" — are above the cap and stay. "fix" and
 * "error" are deliberately NOT in the noun list, so "bos examiner pdf alignment
 * fix" (which does say what changed) survives.
 */
const CONTENT_FREE = /^[\w][\w'’-]*(?:\s+[\w'’&/.-]+){0,1}\s+(issues?|updates?|changes?)$/i;

/** True when the subject is about the build toolchain rather than the product. */
export function isInternalEngineering(subject) {
  return INTERNAL_ENGINEERING.some((re) => re.test(subject));
}

/** True when the title names a place and nothing else ("bos issue"). */
export function isContentFree(subject) {
  return CONTENT_FREE.test(subject);
}

export { BUG_REF_TAIL, INTERNAL_ENGINEERING, CONTENT_FREE, stripBugRefs };

/**
 * Identifiers that should not travel with a change description.
 *
 * Commit subjects are written for other engineers, and one of them carried a
 * colleague's email address: "…+ add <someone>@jkkn.ac.in to write-mode
 * allowlist". That entry sits on a page a lot of staff can open. A sweep of all
 * 4,741 entries on 2026-09-06 found exactly one email, zero phone numbers, zero
 * roll numbers and zero record ids — so this is cheap insurance against the next
 * one rather than a cleanup job.
 *
 * Deliberately narrow. Only two shapes are removed, both unambiguous:
 *   - an email address
 *   - a 10-digit Indian mobile number (leading 6-9), which is the only bare
 *     number long enough to identify a person and short enough to appear in a
 *     title. Years, counts, amounts and bug ids are all left alone.
 *
 * The replacement says what was removed rather than deleting silently, so a
 * reader can see that something was taken out and ask if they need to.
 */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const MOBILE_10 = /\b[6-9]\d{9}\b/g;

export function redactIdentifiers(subject) {
  return subject.replace(EMAIL, '[email removed]').replace(MOBILE_10, '[number removed]');
}
