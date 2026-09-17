// lib/onemark/i18n/tbd.ts
// The one place that knows what an unreviewed Tamil phrase looks like.
//
// CLAUDE.md rule #24: any Tamil string longer than five words ships as
// `[TAMIL_TBD: <english>]` until a native reviewer replaces it. Both the
// dictionary that writes those markers and the resolver that hides them read
// the marker from here, so the shape can never drift between writer and
// reader.

export const TAMIL_TBD_PREFIX = '[TAMIL_TBD: ';

/** True when this value is a placeholder awaiting a native reviewer, not a
 *  phrase a learner should ever be shown. */
export function isTamilTbd(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(TAMIL_TBD_PREFIX) && value.endsWith(']');
}
