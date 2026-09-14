/**
 * The owner desk's third door.
 *
 * The defect these tests pin: /accreditation/manage/owners is the ONLY screen
 * that calls fn_accreditation_assign_metric_owner, whose second entitlement
 * branch lets a body owner delegate inside their own body WITHOUT
 * accreditation.naac.narrative.manage — and the page refused anyone holding
 * neither accreditation key. Measured on production 2026-09-09: 7 of the 14
 * named body owners are role `faculty`, no role grants faculty either key, so
 * half the roster met the access-denied card on the one screen that can
 * exercise the right the database had already granted them.
 */

import { describe, it, expect } from 'vitest';
import {
  isNamedOwner,
  bodiesNamedOnAt,
  bodiesOwnedAt,
  claimableScope,
  namedOwnerScopeSentence,
  type NamedOwnerRow,
} from '@/app/(routes)/accreditation/manage/owners/_lib/named-owner-door';
import type { InstitutionBodyScope } from '@/app/(routes)/accreditation/_lib/institution-body-scope';

const DENTAL = '11111111-1111-1111-1111-111111111111';
const CET = '22222222-2222-2222-2222-222222222222';
const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SOMEBODY_ELSE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function row(over: Partial<NamedOwnerRow> = {}): NamedOwnerRow {
  return {
    institution_id: DENTAL,
    body_code: 'NAAC',
    metric_code: null,
    programme_id: null,
    owner_user_id: ME,
    assignment_status: 'pending',
    ...over,
  };
}

describe('isNamedOwner — the door itself', () => {
  it('opens for the body owner who holds no accreditation permission at all', () => {
    // santhosh.s / NIRF / Dental, live 2026-09-09: role faculty, both
    // accreditation keys false, one body-level row.
    expect(isNamedOwner([row({ body_code: 'NIRF' })], ME)).toBe(true);
  });

  it('stays shut for somebody with no row', () => {
    expect(isNamedOwner([row({ owner_user_id: SOMEBODY_ELSE })], ME)).toBe(false);
  });

  it('stays shut when there is no signed-in identity', () => {
    expect(isNamedOwner([row()], null)).toBe(false);
  });

  it('opens for a DECLINED owner — declining is answerable, not a lockout', () => {
    // fn_accreditation_acknowledge_ownership accepts 'confirmed' from a declined
    // row with no state guard, so a decline made by accident must not strand the
    // person outside the page that can undo it.
    expect(isNamedOwner([row({ assignment_status: 'declined' })], ME)).toBe(true);
  });

  it('opens for a metric-level delegate, who also has an assignment to answer', () => {
    expect(isNamedOwner([row({ metric_code: '3.1.1' })], ME)).toBe(true);
  });

  it('opens on a row at ANY campus — the door does not depend on the picker', () => {
    expect(isNamedOwner([row({ institution_id: CET })], ME)).toBe(true);
  });

  it('is not satisfied by rows the viewer can merely SEE', () => {
    // Once fn_accreditation_owns_body widens the SELECT policy, an unfiltered
    // read returns other people's rows too. The door must still ask "am I
    // named", not "can I read something".
    const visibleButNotMine = [
      row({ owner_user_id: SOMEBODY_ELSE, metric_code: '3.1.1' }),
      row({ owner_user_id: SOMEBODY_ELSE, metric_code: '3.1.2' }),
    ];
    expect(isNamedOwner(visibleButNotMine, ME)).toBe(false);
  });
});

describe('bodiesNamedOnAt — what such a viewer may be shown', () => {
  it('returns only this campus, sorted, de-duplicated', () => {
    const rows = [
      row({ body_code: 'NIRF' }),
      row({ body_code: 'NIRF', metric_code: '2.1.1' }),
      row({ body_code: 'DCI' }),
      row({ institution_id: CET, body_code: 'AICTE' }),
      row({ owner_user_id: SOMEBODY_ELSE, body_code: 'PCI' }),
    ];
    expect(bodiesNamedOnAt(rows, ME, DENTAL)).toEqual(['DCI', 'NIRF']);
    expect(bodiesNamedOnAt(rows, ME, CET)).toEqual(['AICTE']);
  });

  it('counts a metric-level row: a delegate holds a piece of that body', () => {
    expect(bodiesNamedOnAt([row({ metric_code: '3.1.1' })], ME, DENTAL)).toEqual([
      'NAAC',
    ]);
  });

  it('counts a declined row, matching the door that let them in', () => {
    expect(
      bodiesNamedOnAt([row({ assignment_status: 'declined' })], ME, DENTAL),
    ).toEqual(['NAAC']);
  });

  it('is empty with no campus chosen', () => {
    expect(bodiesNamedOnAt([row()], ME, null)).toEqual([]);
  });
});

describe('bodiesOwnedAt — what such a viewer may DELEGATE inside', () => {
  it('is body-level only: holding one metric is not holding the body', () => {
    expect(bodiesOwnedAt([row({ metric_code: '3.1.1' })], ME, DENTAL)).toEqual([]);
  });

  it('excludes a declined body row, exactly as the RPC does', () => {
    expect(
      bodiesOwnedAt([row({ assignment_status: 'declined' })], ME, DENTAL),
    ).toEqual([]);
  });

  it('excludes a programme-scoped NBA row — a different axis of ownership', () => {
    expect(bodiesOwnedAt([row({ programme_id: 'prog-1' })], ME, DENTAL)).toEqual([]);
  });

  it('is narrower than the door: named on three, may delegate inside one', () => {
    const rows = [
      row({ body_code: 'NIRF' }),
      row({ body_code: 'DCI', assignment_status: 'declined' }),
      row({ body_code: 'PCI', metric_code: '4.2.1' }),
    ];
    expect(bodiesNamedOnAt(rows, ME, DENTAL)).toEqual(['DCI', 'NIRF', 'PCI']);
    expect(bodiesOwnedAt(rows, ME, DENTAL)).toEqual(['NIRF']);
  });
});

describe('claimableScope — the denominator moves with the list', () => {
  const campus: InstitutionBodyScope = {
    kind: 'known',
    bodies: ['DCI', 'NAAC', 'NIRF', 'PCI'],
  };

  it('is the campus scope untouched for a permitted viewer', () => {
    expect(claimableScope(campus, null)).toBe(campus);
  });

  it('narrows to the bodies the named viewer holds', () => {
    expect(claimableScope(campus, ['NIRF'])).toEqual({
      kind: 'known',
      bodies: ['NIRF'],
    });
  });

  it('drops a body the campus no longer answers to', () => {
    // An owner row can outlive the campus-to-body mapping. A stale row must not
    // resurrect a body the campus has stopped being measured against.
    expect(claimableScope(campus, ['NIRF', 'ABET'])).toEqual({
      kind: 'known',
      bodies: ['NIRF'],
    });
  });

  it('narrows even against an unprovisioned campus scope', () => {
    // isBodyInScope admits every body when the mapping could not be read, so
    // the intersection keeps what the viewer holds instead of failing open to
    // the whole framework, which is what they cannot read.
    expect(claimableScope({ kind: 'unprovisioned' }, ['QS'])).toEqual({
      kind: 'known',
      bodies: ['QS'],
    });
  });

  it('yields an empty KNOWN scope, never unprovisioned, when nothing is held here', () => {
    // 'known' with no bodies is what makes the tables narrow and the sentence
    // explain. 'unprovisioned' would fail open and show the entire framework.
    expect(claimableScope(campus, [])).toEqual({ kind: 'known', bodies: [] });
  });
});

describe('namedOwnerScopeSentence — says what is withheld, not that it is empty', () => {
  it('names the bodies in view and calls the rest withheld, not unowned', () => {
    const s = namedOwnerScopeSentence(['NIRF'], 'JKKN Dental College and Hospital');
    expect(s).toContain('NIRF');
    expect(s).toContain('JKKN Dental College and Hospital');
    expect(s).toContain('not visible to you');
    expect(s).toContain('not a');
  });

  it('uses the singular for one body', () => {
    expect(namedOwnerScopeSentence(['QS'], 'JKKN College of Pharmacy')).toContain(
      'the awarding body you are named on',
    );
  });

  it('counts when there are several', () => {
    expect(namedOwnerScopeSentence(['DCI', 'NIRF'], 'X')).toContain(
      '2 awarding bodies',
    );
  });

  it('explains an empty view instead of implying the campus has nothing', () => {
    const s = namedOwnerScopeSentence([], 'JKKN College of Engineering');
    expect(s).toContain('not for any awarding body');
    expect(s).not.toMatch(/\bno owners?\b/i);
  });

  it('carries no metric count and no claim about how full the desk is', () => {
    // Both rot. The page's own accuracy note bans hard-coded counts and the
    // state claims that behave like them.
    const s = namedOwnerScopeSentence(['NAAC', 'NIRF'], 'X');
    expect(s).not.toMatch(/\b107\b|\bof 107\b|\bempty\b/i);
  });
});
