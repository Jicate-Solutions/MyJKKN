// ============================================================================
// Guard 3: a card with no INSTITUTIONAL photograph on file never reaches the
// printer, and there is no override.
//
// THE GUARD'S LIMIT IS PINNED HERE TOO. Every check is a SHAPE check on the
// stored value; none of them fetch. A well-formed but dead URL therefore passes
// the guard and the renderer draws initials after all. That is asserted below
// ("the documented limit") rather than left as an unstated gap, so the claim
// this suite supports stays the one the code actually delivers.
// Created 2026-08-26.
//
// WHAT WENT WRONG. POST /api/id-cards/jobs checked whether the person had left
// and whether a replacement was paid for — and then printed whatever it had.
// If no photograph existed, lib/id-cards/render-card.tsx fell back to
// `initialsFromName()` and drew two green letters where a face belongs. That
// card is indistinguishable from a real one at a gate. The QR beside it carries
// only a number, and a photograph of somebody else's card scans identically, so
// the card proved nothing about the person holding it.
//
// Measured read-only on production 2026-08-26: of 5,454 learners eligible for a
// card, 2,620 (48.0%) have no picture that would render, and 420 of 764 active
// team members store '' in their picture column — an empty string is a real
// stored value, so a null check alone would have passed every one of them.
// JKKN College of Engineering, which is already live and printed real cards on
// 20 and 21 August, is 808 of 1,019 (79%). Refusing those is the intended
// effect of the rule, not a regression.
//
// REVERSED (Director, 2026-09-03). An earlier ruling let a login-account
// picture print behind a confirmation click. WITHDRAWN — the click existed only
// in the endpoint's contract and no screen ever sent it, so it was unreachable.
// A login-account picture no longer qualifies at all: 30 learners move from
// "prints with a warning" to "refused", taking blocked from 2,575 to 2,605.
//
// WHY PURE-FUNCTION TESTED. vitest here defaults to environment: 'node'
// (vitest.config.js) and the rule lives inside a route handler. The decision is
// extracted to lib/id-cards/photo-quality.ts and lib/services/id-cards/
// reprint-eligibility.ts precisely so each verdict can be asserted directly,
// with no Supabase and no DOM — the same shape as reprint-guards.test.ts
// alongside this file.
//
// NEGATIVE CONTROL. Every refusal and every acknowledgement test below asserts
// an outcome the endpoint did not produce before this change: the unguarded
// endpoint read neither picture column, enqueued the job and returned 201 in
// all of these cases. The "still allowed" block is the opposite control — it
// pins the cases the guard must NOT break, so a later tightening that blocks a
// learner who has a perfectly good photograph fails here rather than in the
// print office.
//
// `student_photo_url`, `profile_picture`, `avatar_url` and `staff` are existing
// database identifiers (terminology-exempt); the copy a caller reads says
// "learner" and "team member".
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PHOTO_MISSING_CODE,
  classifyCardPhoto,
  describePhotoVerdict,
  isPrintablePhoto,
  isRenderablePhotoRef
} from '@/lib/id-cards/photo-quality';
import {
  POLICY_KEY_PHOTO_REQUIRED,
  isPolicyValueOff,
  judgeCardPhoto,
  readReplacementPolicy
} from '@/lib/services/id-cards/reprint-eligibility';

/** A picture the renderer can actually draw. */
const OFFICIAL = 'https://cdn.example.test/photos/learner.jpg';
const INLINE = 'data:image/png;base64,iVBORw0KGgo=';
/** A login-account picture. Renderable, but NOT an institutional photograph. */
const AVATAR = 'https://lh3.example.test/a/account-picture';

/** Guard 3 with the rule ON — the default posture. */
const gate = (
  photo: { officialPhotoUrl?: string | null },
  opts: { required?: boolean } = {}
) => judgeCardPhoto({ photo, required: opts.required ?? true });

// ---------------------------------------------------------------------------

describe('guard 3 — no photograph, no card', () => {
  it('refuses when both picture slots are absent', () => {
    const verdict = gate({ officialPhotoUrl: null });
    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.code).toBe(PHOTO_MISSING_CODE);
  });

  it("refuses the empty string — 420 of 764 active team members store ''", () => {
    // A null check alone passes every one of these. The empty string is a real
    // stored value, not an absent one.
    expect(gate({ officialPhotoUrl: '' }).kind).toBe('refused');
    expect(gate({ officialPhotoUrl: '' }).kind).toBe('refused');
    expect(gate({ officialPhotoUrl: null }).kind).toBe('refused');
  });

  it('refuses whitespace-only values', () => {
    expect(gate({ officialPhotoUrl: '   ' }).kind).toBe('refused');
  });

  it('refuses values the renderer cannot draw, even though they are non-empty', () => {
    // Shapes measured on production 2026-07-25: a roll number typed into the
    // photo column, and a bare filename with no scheme. Zero such rows remain
    // today (re-measured 2026-08-26), so this changes no current count — it is
    // here so that junk re-entering the column is refused rather than printed
    // as initials, which is exactly what the renderer would do with it.
    expect(gate({ officialPhotoUrl: 'EM25305' }).kind).toBe('refused');
    expect(gate({ officialPhotoUrl: 'GRACIA.JPEG' }).kind).toBe('refused');
    expect(gate({ officialPhotoUrl: '/uploads/photo.jpg' }).kind).toBe('refused');
    expect(gate({ officialPhotoUrl: 'ftp://host/p.jpg' }).kind).toBe('refused');
  });

  it('has NO override — acknowledging does not rescue a faceless card', () => {
    // The point of the rule is that a card showing initials is not an identity
    // document. Confirming that would not make it one, so unlike the unofficial
    // -picture case there is deliberately no escape hatch here.
    const verdict = gate({ officialPhotoUrl: null });
    expect(verdict.kind).toBe('refused');
  });

  it('says what is wrong and what to do about it, never a generic error', () => {
    const message = describePhotoVerdict({ kind: 'missing' });
    expect(message).toMatch(/no photograph/i);
    expect(message).toMatch(/take their photograph/i);
    // The person at the counter must know nothing was consumed.
    expect(message).toMatch(/no ribbon was used/i);
  });
});

describe('guard 3 — a login-account picture does NOT qualify (reversed 2026-09-03)', () => {
  // These four asserted the OPPOSITE until 2026-09-03. The earlier ruling let an
  // account picture print behind a confirmation click; that click existed only
  // in the endpoint's contract — components/id-cards/bulk-print-dialog.tsx
  // understands only queued / already_queued and never sent it — so the promise
  // was unreachable and the Director withdrew it. 30 learners move here.

  it('refuses a person whose only picture is their login-account avatar', () => {
    // AVATAR is perfectly renderable; it is refused for WHAT it is, not its shape.
    expect(isRenderablePhotoRef(AVATAR)).toBe(true);
    const verdict = gate({ officialPhotoUrl: null });
    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.code).toBe(PHOTO_MISSING_CODE);
  });

  it('refuses an empty official column even when an avatar exists', () => {
    expect(gate({ officialPhotoUrl: '' }).kind).toBe('refused');
  });

  it('the account avatar never reaches the classifier at all', () => {
    // The field is gone from CardPhotoInput; only the institutional photo counts.
    expect(classifyCardPhoto({ officialPhotoUrl: null }).kind).toBe('missing');
    expect(classifyCardPhoto({ officialPhotoUrl: AVATAR }).kind).toBe('official');
  });

  it('the refusal message says why an account picture is not enough', () => {
    const message = describePhotoVerdict({ kind: 'missing' });
    expect(message).toMatch(/login account does not count/i);
    expect(message).toMatch(/photographed them/i);
  });
});

describe('guard 3 — opposite control: what must keep printing', () => {
  it('allows an institutional photograph', () => {
    expect(gate({ officialPhotoUrl: OFFICIAL }).kind).toBe('allowed');
  });

  it('allows an inline data: photograph', () => {
    expect(gate({ officialPhotoUrl: INLINE }).kind).toBe('allowed');
  });

  it('never asks to acknowledge when an official photo exists alongside an avatar', () => {
    // 2,808 eligible learners are in this shape. A guard that stopped them
    // would halt the whole print office.
    expect(gate({ officialPhotoUrl: OFFICIAL }).kind).toBe('allowed');
  });

  it('respects the config row when the rule is switched off', () => {
    // docs/architecture/config-table-pattern.md — a Director decision is a
    // config row, so it must be retunable without a deploy.
    expect(gate({ officialPhotoUrl: null }, { required: false }).kind).toBe(
      'allowed'
    );
  });
});

describe('classifyCardPhoto — which picture the card would actually print', () => {
  it('prefers the official photograph over the account avatar', () => {
    expect(classifyCardPhoto({ officialPhotoUrl: OFFICIAL }).kind).toBe(
      'official'
    );
  });

  it('does NOT fall back to the account avatar (reversed 2026-09-03)', () => {
    // The render engine still falls back to profiles.avatar_url, but nobody
    // reaches the renderer on the strength of one — this guard refuses first.
    expect(classifyCardPhoto({ officialPhotoUrl: null }).kind).toBe('missing');
  });

  it('isPrintablePhoto is true only for an institutional photograph', () => {
    expect(isPrintablePhoto({ kind: 'official' })).toBe(true);
    expect(isPrintablePhoto({ kind: 'missing' })).toBe(false);
  });
});

describe('drift guard against the renderer', () => {
  const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('accepts exactly what render-data.ts will fetch', () => {
    // This module copies the renderer's accept test because render-data.ts is a
    // server module (it builds data: URIs with Buffer) and cannot be imported
    // into a browser bundle. If the renderer starts accepting another shape,
    // this fails here instead of the worklist and the guard silently disagreeing
    // with what the printer does.
    const source = read('lib/id-cards/render-data.ts');
    expect(source).toContain("trimmed.startsWith('data:image/')");
    expect(source).toContain('/^https?:\\/\\//i.test(trimmed)');
  });

  it('agrees with the renderer on every shape the drift guard pins', () => {
    expect(isRenderablePhotoRef('data:image/jpeg;base64,abc')).toBe(true);
    expect(isRenderablePhotoRef('https://host/p.jpg')).toBe(true);
    expect(isRenderablePhotoRef('HTTP://host/p.jpg')).toBe(true);
    expect(isRenderablePhotoRef('data:text/plain;base64,abc')).toBe(false);
    expect(isRenderablePhotoRef(null)).toBe(false);
    expect(isRenderablePhotoRef(undefined)).toBe(false);
  });
});

// ============================================================================
// The off-switch. `id_card.photo.required` is a config row, and the file's own
// promise is that the rule is retunable without a deploy. The original
// `photoRequired !== false` kept that promise only for a JSON boolean: a row
// holding the STRING "false", or 0, left the rule ON while reading as off to
// whoever set it. Both halves are pinned here — a recognised off-value really
// turns it off, and anything absent or unreadable really leaves it on.
//
// No such row exists on production today (verified read-only 2026-08-26: the
// 18 live `id_card.*` policy keys do not include this one), so the live
// behaviour is the fail-closed branch.
// ============================================================================

/** Minimal platform_policies stub: `.from().select().eq().eq().in()` resolves. */
function stubPolicyClient(rows: Record<string, unknown>) {
  return {
    from: () => {
      let key = '';
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        if (column === 'policy_key') key = String(value);
        return builder;
      };
      builder.in = () =>
        Promise.resolve(
          Object.prototype.hasOwnProperty.call(rows, key)
            ? { data: [{ value: rows[key], scope_type: 'global' }], error: null }
            : { data: [], error: null }
        );
      return builder;
    }
  } as never;
}

describe('isPolicyValueOff — what may switch a guard off', () => {
  it('accepts the values a person actually types for "off"', () => {
    expect(isPolicyValueOff(false)).toBe(true);
    expect(isPolicyValueOff(0)).toBe(true);
    expect(isPolicyValueOff('false')).toBe(true);
    expect(isPolicyValueOff('FALSE')).toBe(true);
    expect(isPolicyValueOff('  off  ')).toBe(true);
    expect(isPolicyValueOff('no')).toBe(true);
    expect(isPolicyValueOff('0')).toBe(true);
  });

  it('treats absent and unreadable as NOT off — fail-closed survives', () => {
    expect(isPolicyValueOff(undefined)).toBe(false);
    expect(isPolicyValueOff(null)).toBe(false);
    expect(isPolicyValueOff('')).toBe(false);
    expect(isPolicyValueOff('flase')).toBe(false);
    expect(isPolicyValueOff({})).toBe(false);
    expect(isPolicyValueOff([])).toBe(false);
    expect(isPolicyValueOff(NaN)).toBe(false);
  });

  it('never reads a truthy value as off', () => {
    expect(isPolicyValueOff(true)).toBe(false);
    expect(isPolicyValueOff('true')).toBe(false);
    expect(isPolicyValueOff(1)).toBe(false);
  });
});

describe('readReplacementPolicy — the photo rule end to end', () => {
  it('leaves the photograph REQUIRED when no config row exists', async () => {
    const policy = await readReplacementPolicy(stubPolicyClient({}), null);
    expect(policy.photoRequired).toBe(true);
  });

  it('leaves it REQUIRED when the row holds JSON null', async () => {
    const policy = await readReplacementPolicy(
      stubPolicyClient({ [POLICY_KEY_PHOTO_REQUIRED]: null }),
      null
    );
    expect(policy.photoRequired).toBe(true);
  });

  it('switches it OFF for a JSON boolean false', async () => {
    const policy = await readReplacementPolicy(
      stubPolicyClient({ [POLICY_KEY_PHOTO_REQUIRED]: false }),
      null
    );
    expect(policy.photoRequired).toBe(false);
  });

  it('switches it OFF for the STRING "false" — the case the old check missed', async () => {
    const policy = await readReplacementPolicy(
      stubPolicyClient({ [POLICY_KEY_PHOTO_REQUIRED]: 'false' }),
      null
    );
    expect(policy.photoRequired).toBe(false);
  });

  it('switches it OFF for 0 and "off" — also missed before', async () => {
    for (const value of [0, 'off']) {
      const policy = await readReplacementPolicy(
        stubPolicyClient({ [POLICY_KEY_PHOTO_REQUIRED]: value }),
        null
      );
      expect(policy.photoRequired).toBe(false);
    }
  });

  it('keeps it REQUIRED for a typo — an unreadable value cannot open the gate', async () => {
    const policy = await readReplacementPolicy(
      stubPolicyClient({ [POLICY_KEY_PHOTO_REQUIRED]: 'flase' }),
      null
    );
    expect(policy.photoRequired).toBe(true);
  });
});

describe('the documented limit — a shape check is not a reachability check', () => {
  it('classifies a well-formed but dead URL as official, and lets it print', () => {
    // Nothing in this module fetches, so a 404 / deleted object / non-image
    // response is indistinguishable here from a good photograph. The renderer
    // is where that value fails, falling back to initials. Documented in
    // lib/id-cards/photo-quality.ts; asserted here so the PR's claim and the
    // code cannot drift apart again.
    const dead = 'https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/student-photos/deleted.jpg';
    expect(isRenderablePhotoRef(dead)).toBe(true);
    expect(classifyCardPhoto({ officialPhotoUrl: dead }).kind).toBe('official');
    expect(
      judgeCardPhoto({ photo: { officialPhotoUrl: dead }, required: true }).kind
    ).toBe('allowed');
  });
});
