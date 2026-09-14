/**
 * What's New — the rules that decide where a row sends the reader.
 *
 * These rules are the whole feature. Every entry on the page is about to become
 * clickable, and what makes a link worth having is that it is RIGHT: a dead one
 * is worse than none, because the reader follows it, lands on a 404 or a bounce,
 * and stops trusting the rest of the page. So the derivation is a pure function
 * over a file list and a membership test, and it is exercised here directly
 * rather than through the generator — the generator needs a git repository, and
 * a rule that can only be tested against real history is a rule nobody tests.
 *
 * Each block below is a way this can be wrong in production, not a way it can be
 * wrong in principle.
 */
import { describe, it, expect } from 'vitest';
// .mjs, imported from TypeScript, exactly as modules.mjs and title-rules.mjs
// are by the suites beside this one.
import { routeFromPageFile, entryHref, chooseEntryLink } from '@/lib/changelog/entry-link.mjs';

/** "Everything in the list exists" — the tree at a ref that changed nothing. */
const allExist = () => true;

/** A tree containing exactly these files and nothing else. */
const treeOf = (...files: string[]) => {
  const set = new Set(files);
  return (f: string) => set.has(f);
};

describe('routeFromPageFile — a page file becomes a URL', () => {
  it('strips the route group and the file name', () => {
    expect(routeFromPageFile('app/(routes)/hr/admin/recruitment-need/norms/page.tsx')).toBe(
      '/hr/admin/recruitment-need/norms'
    );
    expect(
      routeFromPageFile('app/(routes)/admission/consultants/attribution-orphans/page.tsx')
    ).toBe('/admission/consultants/attribution-orphans');
  });

  it('strips a route group nested inside (routes) too', () => {
    // There is no such group in the tree today, which is exactly why this is
    // pinned: the first one somebody adds must not put "/(dashboard)/hr" in
    // front of a reader. Next.js groups are organisational — they never appear
    // in a URL — so keeping one would produce a path that 404s.
    expect(routeFromPageFile('app/(routes)/(dashboard)/hr/page.tsx')).toBe('/hr');
    expect(routeFromPageFile('app/(routes)/(a)/(b)/billing/invoices/page.tsx')).toBe(
      '/billing/invoices'
    );
  });

  it('maps the route root to /', () => {
    expect(routeFromPageFile('app/(routes)/page.tsx')).toBe('/');
    expect(routeFromPageFile('app/(routes)/(dashboard)/page.tsx')).toBe('/');
  });

  it('refuses every shape of dynamic segment', () => {
    // No valid URL exists without a real id, and inventing one sends the reader
    // to a page that does not exist — or, worse, to somebody else's record.
    expect(routeFromPageFile('app/(routes)/learners/[id]/page.tsx')).toBeNull();
    expect(routeFromPageFile('app/(routes)/billing/[id]/receipts/page.tsx')).toBeNull();
    expect(routeFromPageFile('app/(routes)/docs/[...slug]/page.tsx')).toBeNull();
    expect(routeFromPageFile('app/(routes)/docs/[[...slug]]/page.tsx')).toBeNull();
  });

  it('reads only page files under app/(routes)', () => {
    // Layouts, components, services and API routes are not screens.
    expect(routeFromPageFile('app/(routes)/hr/layout.tsx')).toBeNull();
    expect(routeFromPageFile('app/(routes)/hr/components/table.tsx')).toBeNull();
    expect(routeFromPageFile('app/api/hr/route.ts')).toBeNull();
    expect(routeFromPageFile('lib/services/hr/norms-service.ts')).toBeNull();
    expect(routeFromPageFile('supabase/migrations/20261206120000_x.sql')).toBeNull();
    // Sign-in screens, the parent portal and the public pages are real routes
    // but are not places to send a reader of an internal changelog, and no
    // module's href points at them.
    expect(routeFromPageFile('app/auth/login/page.tsx')).toBeNull();
    expect(routeFromPageFile('app/(parent-portal)/parent/page.tsx')).toBeNull();
    expect(routeFromPageFile('app/(public)/events/page.tsx')).toBeNull();
  });
});

describe('entryHref — one link per commit', () => {
  it('returns null when the commit touched no page at all', () => {
    // ~73% of user-facing commits. The honest answer, and the page falls back
    // to the module's own href for it.
    expect(
      entryHref(
        ['supabase/migrations/20261206120000_x.sql', 'lib/services/hr/norms-service.ts'],
        allExist
      )
    ).toEqual({ href: null, dropped: false });
  });

  it('picks the deepest page when a commit touched several', () => {
    const files = [
      'app/(routes)/hr/page.tsx',
      'app/(routes)/hr/admin/recruitment-need/norms/page.tsx',
      'app/(routes)/hr/admin/page.tsx',
    ];
    // The work was done in the specific screen; the parents were touched in
    // passing — a link, a count, a tab. Sending the reader to the specific one
    // costs nothing if they wanted the parent; the reverse leaves them hunting,
    // which is the complaint this whole change exists to answer.
    expect(entryHref(files, allExist).href).toBe('/hr/admin/recruitment-need/norms');
  });

  it('breaks a same-depth tie alphabetically, whatever order the files arrive in', () => {
    // Determinism is not tidiness here. The derivation runs over all ~7,000
    // commits on every sync and the result is fingerprinted: a tie broken by
    // arrival order would flip on an unrelated rename, mark the row changed and
    // rewrite it — the exact churn the fingerprint exists to prevent.
    const a = ['app/(routes)/zebra/page.tsx', 'app/(routes)/alpha/page.tsx'];
    const b = [...a].reverse();
    expect(entryHref(a, allExist).href).toBe('/alpha');
    expect(entryHref(b, allExist).href).toBe('/alpha');
  });

  it('prefers a deep page over an alphabetically earlier shallow one', () => {
    // Depth wins first; the alphabet only settles ties. Written out because the
    // two rules pull in opposite directions here and a swapped comparator would
    // still pass every other case in this file.
    const files = ['app/(routes)/alpha/page.tsx', 'app/(routes)/zebra/deep/page.tsx'];
    expect(entryHref(files, allExist).href).toBe('/zebra/deep');
  });

  it('falls back to a static sibling rather than linking a dynamic route', () => {
    const files = [
      'app/(routes)/learners/[id]/page.tsx',
      'app/(routes)/learners/page.tsx',
    ];
    expect(entryHref(files, allExist).href).toBe('/learners');
  });

  it('reports null — not a dynamic URL — when the only page touched is dynamic', () => {
    const files = ['app/(routes)/learners/[id]/page.tsx'];
    const out = entryHref(files, allExist);
    expect(out.href).toBeNull();
    // NOT counted as dropped: nothing was lost to a deleted page. A dynamic
    // route never had a link to lose, and conflating the two would inflate the
    // number the sync reports as "pages that no longer exist".
    expect(out.dropped).toBe(false);
  });

  it('drops a link whose page has since been deleted, and says that it did', () => {
    // The file list is evidence about the day the commit landed — possibly
    // months ago. A page renamed or removed since still produces a perfectly
    // well-formed URL pointing at a 404.
    const files = ['app/(routes)/hr/admin/old-screen/page.tsx'];
    expect(entryHref(files, treeOf())).toEqual({ href: null, dropped: true });
  });

  it('keeps the surviving page when a commit touched one that was later deleted', () => {
    const files = [
      'app/(routes)/hr/admin/old-screen/deep/page.tsx', // deeper, but gone
      'app/(routes)/hr/admin/norms/page.tsx', // shallower, still there
    ];
    const out = entryHref(files, treeOf('app/(routes)/hr/admin/norms/page.tsx'));
    // Depth must not override existence: the deepest candidate is checked for
    // membership BEFORE it can win, or the deepest deleted page would beat every
    // live one and the validation would be decorative.
    expect(out).toEqual({ href: '/hr/admin/norms', dropped: false });
  });

  it('drops every link when the tree could not be read', () => {
    // An empty tree means "we could not check", and the safe direction is no
    // link rather than an unverified one: a page that looks like last week's is
    // recoverable on the next sync, a page full of 404s is not.
    const files = ['app/(routes)/hr/page.tsx', 'app/(routes)/billing/page.tsx'];
    expect(entryHref(files, treeOf()).href).toBeNull();
  });
});

/**
 * chooseEntryLink — the SECOND question, asked per reader.
 *
 * entryHref above decides whether a link points at a real screen. These rules
 * decide whether the person looking at the row may open it. They exist because
 * on production, 2026-09-14, they did not: a super admin opened
 * /cdc/admin/exam-topic-map from a Foundation entry, and a learner following the
 * same row got "Access Denied — Required Permission: cdc.training.edit".
 */
describe('chooseEntryLink — a link the reader cannot open is not offered', () => {
  /** Everything is open — the super-admin case. */
  const openToAll = () => true;
  /** A reader who may open exactly these paths and nothing else. */
  const canOpenOnly = (...paths: string[]) => {
    const set = new Set(paths);
    return (p: string) => set.has(p);
  };

  it('offers the exact screen to a reader who can open it', () => {
    expect(
      chooseEntryLink('/cdc/admin/exam-topic-map', '/cdc', 'CDC', openToAll)
    ).toEqual({ href: '/cdc/admin/exam-topic-map', label: 'Open this page' });
  });

  it('falls back to the module when the exact screen is closed to this reader', () => {
    // The row is visible because the reader holds SOMETHING in the cdc
    // namespace; the deep screen carries its own, finer key. That gap is the
    // whole defect: module visibility and page permission are different tests.
    expect(
      chooseEntryLink('/cdc/admin/exam-topic-map', '/cdc', 'CDC', canOpenOnly('/cdc'))
    ).toEqual({ href: '/cdc', label: 'Open CDC' });
  });

  it('offers nothing when the module landing page is closed too', () => {
    // The fallback is RE-TESTED, never assumed. A module whose news reaches a
    // reader is not a module whose landing page their role opens — observed on
    // production for faculty and /admission/consultants/attribution-orphans,
    // whose module link /admission carries admission.dashboard.view.
    expect(
      chooseEntryLink(
        '/admission/consultants/attribution-orphans',
        '/admission',
        'Admission',
        canOpenOnly()
      )
    ).toBeNull();
  });

  it('offers nothing rather than a dead anchor when the module has no href', () => {
    // `platform` and `cohort-programmes` have no href of their own. A reader who
    // can open anything still gets no link here, because there is nothing to link.
    expect(chooseEntryLink(null, null, 'Platform', openToAll)).toBeNull();
  });

  it('goes straight to the module when the entry derived no screen of its own', () => {
    // ~70% of entries: a migration, a service, a shared component. Unchanged
    // behaviour, still gated.
    expect(chooseEntryLink(null, '/billing', 'Billing', openToAll)).toEqual({
      href: '/billing',
      label: 'Open Billing',
    });
  });

  it('never asks about a path it is not going to offer', () => {
    // The predicate reaches the app's permission stack. Calling it for a
    // candidate already ruled out would be wasted work on 60 rows per screen,
    // and — more to the point — asking about the module link after the exact
    // screen already won would make the module's own gate look load-bearing
    // when it is not.
    const asked: string[] = [];
    chooseEntryLink('/billing/receipts', '/billing', 'Billing', (p) => {
      asked.push(p);
      return true;
    });
    expect(asked).toEqual(['/billing/receipts']);
  });
});
