/**
 * A tap-enabled list row's own link must ALSO be tappable.
 *
 * The original spec had four steps. Step 4 — "give that page's existing link(s)
 * the 44px treatment" — is the one with no mechanical backstop: it is applied
 * by hand, once per page, in a file CI never looks at. It was applied to 11 of
 * the 14 pages and missed on three. Every gate stayed green, because nothing in
 * this repository measures a tap target. Measured in a real browser at 390px,
 * billing/schedule's link rendered at 17px and admission/applications'
 * learner-name link at 20px — under half the 44px minimum, inside a PR whose
 * entire subject was tap targets.
 *
 * So this asserts over SOURCE TEXT. That is crude — it cannot see a rendered
 * box, and a class arriving through `cn()` or a variable would slip past it.
 * It is nonetheless the only thing here that can catch a missed page, and the
 * three real misses all had the shape it does catch: a literal className string
 * carrying `hover:text-primary` and no `min-h-[44px]`.
 *
 * The page list is NOT hardcoded. It is derived from the `rowHref=` wirings on
 * disk, so a fifteenth page opting into row navigation is measured the day it
 * lands rather than the day someone remembers to edit this file. The fourteen
 * this PR opted in are pinned separately, so one silently dropping out is also
 * a failure.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTES = path.resolve(process.cwd(), 'app/(routes)');

/** The tap target the Director chose: 44px, at every width. */
const TAP_TARGET = 'min-h-[44px]';

/**
 * The idiom every one of these name links is written in. Its presence is what
 * marks a string as "this is the row's own link", which is what step 4 is about.
 */
const LINK_IDIOM = 'hover:text-primary';

/**
 * How far back from a `<Link` to look for the idiom. On two pages the hover
 * classes sit on the element WRAPPING the link rather than on the link itself
 * (billing/schedule and academic/attendance/reports), and the link carries only
 * the tap target. A window this size reaches that wrapper and nothing further.
 */
const WRAPPER_WINDOW = 200;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Every `columns.tsx` whose sibling table opts its rows into navigation.
 * `rowHref=` is the opt-in; no filename convention is assumed.
 */
function tapEnabledColumnFiles(): string[] {
  const found = new Set<string>();

  for (const file of walk(ROUTES)) {
    if (!file.endsWith('.tsx')) continue;
    if (!readFileSync(file, 'utf8').includes('rowHref=')) continue;

    const columns = path.join(path.dirname(file), 'columns.tsx');
    if (existsSync(columns)) found.add(columns);
  }

  return [...found].sort();
}

/** One `<Link ...>` opening tag, plus the text immediately preceding it. */
function linkTags(source: string): Array<{ tag: string; before: string }> {
  const tags: Array<{ tag: string; before: string }> = [];

  for (let from = 0; ; ) {
    const start = source.indexOf('<Link', from);
    if (start === -1) break;

    const end = source.indexOf('>', start);
    expect(end, 'unterminated <Link tag').toBeGreaterThan(start);

    tags.push({
      tag: source.slice(start, end + 1),
      before: source.slice(Math.max(0, start - WRAPPER_WINDOW), start)
    });
    from = end + 1;
  }

  return tags;
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const TAP_ENABLED = tapEnabledColumnFiles();

/**
 * The fourteen this PR opted in. Pinned by path so a page losing its `rowHref=`
 * — and with it every assertion below — cannot pass as "nothing to check".
 */
const THE_FOURTEEN = [
  'academic/attendance/reports',
  'academic/staff-planning',
  'admission/applications',
  'admission/leads',
  'applications',
  'billing/schedule',
  'organizations/courses',
  'organizations/courses/mappings',
  'organizations/degrees',
  'organizations/departments',
  'organizations/programs',
  'organizations/sections',
  'organizations/semesters',
  'resource-management/maintenance'
];

describe('list row tap targets', () => {
  it('finds every page that opted a row into navigation', () => {
    expect(THE_FOURTEEN).toHaveLength(14);

    for (const page of THE_FOURTEEN) {
      expect(
        TAP_ENABLED,
        `${page} no longer wires rowHref= — its links stopped being checked`
      ).toContain(path.join(ROUTES, page, '_components', 'columns.tsx'));
    }
  });

  for (const file of TAP_ENABLED) {
    const page = path.relative(ROUTES, path.dirname(path.dirname(file)));
    const source = readFileSync(file, 'utf8');

    it(`${page}: every row link carries the 44px tap target`, () => {
      const tags = linkTags(source);
      expect(tags.length, `no <Link> found in ${page}/_components/columns.tsx`)
        .toBeGreaterThan(0);

      for (const { tag, before } of tags) {
        // If this fails the `>` scan above grabbed the wrong terminator and
        // every assertion under it would be meaningless.
        expect(tag, `<Link> tag extracted without its href in ${page}`)
          .toContain('href');

        const isRowLink =
          tag.includes(LINK_IDIOM) || before.includes(LINK_IDIOM);
        if (!isRowLink) continue;

        expect(
          tag,
          `${page}: this row link renders under 44px — give it ${TAP_TARGET}, ` +
            'the same treatment organizations/programs already has'
        ).toContain(TAP_TARGET);
      }
    });

    it(`${page}: no ${LINK_IDIOM} is left without a tap target`, () => {
      // The crude count the defect was found by. It catches the wrapper case
      // even if a future link nests deeper than WRAPPER_WINDOW reaches.
      expect(
        occurrences(source, TAP_TARGET),
        `${page}: ${occurrences(source, TAP_TARGET)} tap targets for ` +
          `${occurrences(source, LINK_IDIOM)} row links`
      ).toBeGreaterThanOrEqual(occurrences(source, LINK_IDIOM));
    });

    it(`${page}: the tap target is not width-gated`, () => {
      // The Director chose 44px at every width. A `max-md:` prefix would give
      // the desktop pointer a target the thumb never gets.
      expect(source).not.toContain(`max-md:${TAP_TARGET}`);
    });
  }
});
