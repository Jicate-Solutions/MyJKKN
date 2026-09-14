/**
 * What's New — turn the files a commit touched into the screen a reader can open.
 *
 * THE PROBLEM. The page tells a reader "colleges genuinely over the limit will
 * now correctly show as red or amber" and then leaves them to go and find it.
 * Until this existed the whole list rendered exactly ONE link — the module's own
 * `href`, and only after the reader had already filtered to that module. The
 * Director, 2026-09-13: "a normal user by reading what is there in the what's
 * new page will not be able to see where that change has happened unless if
 * there is some link to be clickable which takes him directly to the page".
 *
 * WHY THE CHANGED FILES ARE THE ANSWER. A conventional-commit subject says what
 * changed and never where; the paths say where exactly. A commit that edited
 * app/(routes)/hr/admin/recruitment-need/norms/page.tsx changed the screen at
 * /hr/admin/recruitment-need/norms, and Next.js's App Router makes that mapping
 * total rather than a guess: the directory IS the URL.
 *
 * WHY IT IS PURE. It takes a file list and a membership test and returns a
 * string or null — no git, no clock, no database. The rules below decide what
 * ~4,900 readers are sent to, so they are tested directly
 * (__tests__/lib/changelog/entry-link.test.ts) rather than through the
 * generator.
 *
 * WHAT IT DELIBERATELY WILL NOT DO — return a link it cannot stand behind. A
 * dead link on a changelog is worse than no link: the reader follows it, lands
 * on a 404 or a bounce, and stops trusting every other row on the page. So a
 * dynamic route is refused (no valid URL exists without a real id) and a page
 * whose file is no longer in the tree is refused (the commit may be six months
 * old and the screen since renamed or deleted). Both fall back to the module's
 * own href, which the page already knows how to render.
 */

/**
 * The route tree. Only `app/(routes)/…` is read.
 *
 * The other page roots in this repository — app/(parent-portal), app/(public),
 * app/auth, a dozen one-off top-level pages — are deliberately out of scope.
 * They are sign-in screens, public landing pages and portals outside the signed
 * -in app, and none of them is a place to send a reader of an internal
 * changelog. Every module in changelog_modules.href points inside (routes).
 */
const ROUTES_PAGE_RE = /^app\/\(routes\)\/(.*)page\.tsx$/;

/**
 * A Next.js route group: a directory whose name is wrapped in parentheses.
 *
 * Groups are organisational only — they let files be filed together without
 * appearing in the URL — so they must be REMOVED from the path, not kept.
 * `(routes)` is stripped by the pattern above; this catches any group nested
 * inside it. There are none in the tree today, which is exactly why it is
 * handled here rather than discovered later by a reader landing on
 * /(dashboard)/hr.
 */
const ROUTE_GROUP_RE = /^\(.+\)$/;

/**
 * A dynamic segment: [id], [slug], [...rest], [[...optional]].
 *
 * Detected by the bracket alone rather than by a shape, because every form of
 * it has the same consequence here: there is no URL without a real value to put
 * in it, and inventing one ("/learners/[id]", or worse, some id that happened
 * to be in the diff) sends the reader somewhere that does not exist or somewhere
 * that is not theirs.
 */
function hasDynamicSegment(path) {
  return path.includes('[');
}

/**
 * One page file -> the URL it serves, or null if it does not serve one.
 *
 * Exported for the tests; the generator uses entryHref() below.
 */
export function routeFromPageFile(file) {
  const m = ROUTES_PAGE_RE.exec(file);
  if (!m) return null;
  const inner = m[1];
  if (hasDynamicSegment(inner)) return null;
  const segments = inner
    .split('/')
    .filter(Boolean)
    .filter((s) => !ROUTE_GROUP_RE.test(s));
  // `app/(routes)/page.tsx` — and any path that is nothing but route groups —
  // is the root of the signed-in app, which is a real destination.
  return `/${segments.join('/')}`;
}

/** How deep a URL is. '/' is 0, '/hr' is 1, '/hr/admin/norms' is 3. */
function depth(href) {
  return href.split('/').filter(Boolean).length;
}

/**
 * The one link for a commit, from the files it touched.
 *
 * @param {string[]} files          the commit's changed paths
 * @param {(file: string) => boolean} pageStillExists
 *        Membership test against the CURRENT tree at the ref being synced. The
 *        file list comes from history, so a path in it is evidence about the
 *        past, not about now.
 * @returns {{ href: string | null, dropped: boolean }}
 *        `dropped` is true when this commit HAD a derivable link and lost it
 *        because the page is gone — reported by the sync so the count is
 *        visible rather than inferred from a shrinking number of links.
 */
export function entryHref(files, pageStillExists) {
  const candidates = [];
  let anyBeforeValidation = false;

  for (const f of files) {
    const href = routeFromPageFile(f);
    if (href === null) continue;
    anyBeforeValidation = true;
    if (!pageStillExists(f)) continue;
    candidates.push(href);
  }

  if (candidates.length === 0) {
    return { href: null, dropped: anyBeforeValidation };
  }

  /*
   * DEEPEST FIRST, then alphabetically — and both halves are load-bearing.
   *
   * Deepest because a commit that touches both /hr and /hr/admin/norms almost
   * always did the work in the specific screen and touched the parent in
   * passing (a link, a count, a tab). Sending the reader to the specific one
   * costs them nothing if they wanted the parent; the reverse leaves them
   * hunting again, which is the complaint this change exists to answer.
   *
   * Alphabetically because ties must break the SAME way every run. The file
   * list's order is git's, and the derivation runs over all ~7,000 commits on
   * every sync: a tie broken by arrival order would flip with an unrelated
   * rename, mark the row changed, and rewrite it — the exact churn the
   * fingerprint in scripts/sync-changelog-db.mjs exists to prevent.
   */
  candidates.sort((a, b) => depth(b) - depth(a) || (a < b ? -1 : a > b ? 1 : 0));
  return { href: candidates[0], dropped: false };
}
