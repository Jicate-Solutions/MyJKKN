import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// THE DEFECT THIS GUARDS (found 2026-09-09, production ref kvizhngldtiuufknvehv)
//
// /accreditation/naac/narratives/owners upserted with a THREE-column conflict
// target, `institution_id,body_code,metric_code`. The only matching unique
// index in production is four columns:
//
//   accreditation_metric_owners_scope_key
//     UNIQUE NULLS NOT DISTINCT (institution_id, body_code, metric_code,
//                                programme_id)
//
// Postgres infers an arbiter index only when the ON CONFLICT specification
// matches the index columns EXACTLY — it does not fall back to a wider index.
// So every save on that desk failed at parse-analysis with
//   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
//          specification
// and the page's catch block rendered the raw Postgres string in a toast. The
// delete branch uses no ON CONFLICT, so the desk could un-assign but never
// assign. Reproduced on a throwaway database against a copy of the live schema,
// with the four-column form as the negative control (it plans, naming
// accreditation_metric_owners_scope_key as its Conflict Arbiter Index).
//
// WHY THIS IS A SOURCE-READING TEST
// The bug lives entirely inside a string literal handed to PostgREST. No type
// checker, no lint rule and no render test can see it; only the database can,
// and only at run time. Reading the source is the one check that runs in CI.
// It deliberately asserts the SHAPE of the write, not a re-derivation of
// PostgREST's SQL — re-implementing the generator would only prove this file
// agrees with itself.
// ---------------------------------------------------------------------------

const NARRATIVE_DESK = 'app/(routes)/accreditation/naac/narratives/owners/page.tsx';
const MANAGE_DESK = 'app/(routes)/accreditation/manage/owners/page.tsx';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** Every column of accreditation_metric_owners_scope_key, in index order. */
const SCOPE_COLUMNS = 'institution_id,body_code,metric_code,programme_id';

describe('accreditation_metric_owners upserts name the whole scope key', () => {
  for (const [label, path] of [
    ['NAAC narrative owner desk', NARRATIVE_DESK],
    ['accreditation manage owner desk', MANAGE_DESK],
  ] as const) {
    it(`🛑 ${label} declares the four-column conflict target`, () => {
      const src = read(path);
      expect(src).toContain(`'${SCOPE_COLUMNS}'`);
    });

    it(`🛑 ${label} never sends a short conflict target`, () => {
      const src = read(path);
      // The exact literal that shipped the 42P10, plus any other subset that
      // omits programme_id. A conflict target for this table that stops at
      // metric_code cannot resolve to an index that exists.
      expect(src).not.toContain("'institution_id,body_code,metric_code'");
      expect(src).not.toMatch(/onConflict:\s*'[^']*metric_code'\s*[,}]/);
    });
  }
});

describe('the NAAC narrative desk writes an honest row when ownership moves', () => {
  const src = read(NARRATIVE_DESK);

  it('sends programme_id explicitly rather than leaning on the column default', () => {
    // The desk manages INSTITUTION-level ownership only, and the delete branch
    // already filters `.is('programme_id', null)`. The write has to key on the
    // same axis or the two halves disagree about which row they mean.
    expect(src).toMatch(/programme_id:\s*null/);
  });

  it("🛑 clears the previous holder's acknowledgement on a re-assignment", () => {
    // Re-assignment always hands the metric to a DIFFERENT person (the handler
    // returns early when the pick equals the current owner). Carrying
    // assignment_status across would move a 'declined' — which still stops mail
    // — onto somebody who never declined, and a 'confirmed' would contradict
    // the first_seen_at the database trigger has just reset to NULL.
    expect(src).toMatch(/assignment_status:\s*'pending'/);
    expect(src).toMatch(/acknowledged_at:\s*null/);
    expect(src).toMatch(/acknowledged_by:\s*null/);
  });

  it('records who held the metric before, so "moved from" names the right person', () => {
    // previous_owner_user_id / owner_changed_at are rendered by the sibling
    // desk and read by the my-gaps worklist. Left unstamped they keep naming
    // whoever held the row two moves ago.
    expect(src).toMatch(/previous_owner_user_id:\s*current/);
    expect(src).toMatch(/owner_changed_at:\s*current\s*\?/);
  });
});
