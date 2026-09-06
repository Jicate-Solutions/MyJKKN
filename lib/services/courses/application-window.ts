/**
 * Whether a course is accepting applications is decided SOLELY by its
 * application window, and whether a package is on sale solely by its sale
 * window. There is deliberately no 'closed' status on course_events: two
 * independent switches controlling one behaviour is how intake states drift out
 * of sync (design spec §3.1).
 *
 * A NULL bound means "no limit on that side" — a course with no
 * `application_opens_at` accepts applications from the moment it is published.
 *
 * Lives here rather than in a route handler because three callers need it — the
 * public read route, the public apply route, and the public landing page — and a
 * route module importing another route module drags a whole handler into its
 * bundle for one comparison.
 */
export function isWindowOpen(
  opensAt: string | null | undefined,
  closesAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (opensAt) {
    const open = new Date(opensAt);
    if (!Number.isNaN(open.getTime()) && now < open) return false;
  }
  if (closesAt) {
    const close = new Date(closesAt);
    if (!Number.isNaN(close.getTime()) && now > close) return false;
  }
  return true;
}
