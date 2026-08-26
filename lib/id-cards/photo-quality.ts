// ============================================================================
// Photo quality — decide whether an ID card may be printed for a person at all,
// and whether the picture it would print is the one the institution took.
// Created: 2026-08-26.
//
// WHY THIS EXISTS (Director decision, 2026-08-26)
//   The QR on a card carries a number. A photograph of somebody else's card
//   scans identically, so the number proves nothing on its own. The PHOTOGRAPH,
//   plus a person looking at it, IS the identity control.
//
//   Today a card with no photo still prints: lib/id-cards/render-card.tsx falls
//   back to `initialsFromName()` and draws two green letters where a face
//   belongs. That card is indistinguishable from a real one at a gate and
//   proves nothing about who is holding it. The rule refuses to print it.
//
//   Measured on production 2026-08-26: of 5,454 learners eligible for a card,
//   2,620 (48.0%) have no picture that would render. That is the intended
//   effect of the rule, not a side effect of it.
//
// THE THIRD OUTCOME (Director, 2026-08-26)
//   Some people have no official photograph but DO have a picture on their own
//   login account, which the render engine will happily draw. Measured: 26
//   learners. Those are not refused — the card prints — but the caller has to
//   confirm it deliberately, because an account picture can be anything and
//   nobody should print one without noticing. "Print any, but warn with an
//   extra click for a non-official photo."
//
// WHY THE SHAPE CHECK IS DUPLICATED HERE RATHER THAN IMPORTED
//   lib/id-cards/render-data.ts owns the canonical fetch, but it is a SERVER
//   module (it builds data: URIs with Buffer), so importing it into the browser
//   bundle is not an option. The test suite pins the two definitions against
//   each other so a change to the renderer turns this file red instead of
//   silently drifting — the same guarantee address-quality.ts relies on.
//
// WHAT THIS DOES NOT CHECK — THE HONEST LIMIT OF THE GUARD
//   Every function in this file is a SHAPE check on a stored value. It answers
//   "is this the kind of value the render engine would even try to draw?" — it
//   never answers "is there actually an image at the other end of it?" Nothing
//   here makes a network request.
//
//   So a well-formed but DEAD reference — a URL whose object was deleted, a
//   404, a non-image content-type, a host that times out — classifies as
//   `official`, passes the guard and reaches the render worker. There
//   `fetchImageAsDataUrl` returns null and render-card.tsx draws
//   `initialsFromName()` after all. This guard shuts the door on values that
//   could NEVER draw a face; it cannot shut it on values that merely fail to.
//   The claim it supports is "a card with no drawable photo REFERENCE on file
//   is refused", not "a card that would show no face never reaches the
//   printer".
//
//   That limit is deliberate, not an oversight. Re-checking at fetch time is
//   the render worker's job, and the estate does not currently justify paying
//   for it twice: measured read-only on production 2026-08-26, all 4,111
//   https photo references across the three columns
//   (learners_profiles.student_photo_url 3,306, staff.profile_picture 372,
//   profiles.avatar_url 433) are unsigned, non-expiring links — 3,793 of them
//   Supabase public-bucket URLs, and ZERO signed or expiring URLs anywhere.
//   The "valid when stored, dead by print time" case therefore has no
//   instances today. If signed or expiring URLs ever enter these columns this
//   limit stops being theoretical and the check belongs at fetch time.
//
// NOTE Column identifiers named in comments (learners_profiles.student_photo_url,
//   staff.profile_picture, profiles.avatar_url) are existing database
//   identifiers and are terminology-exempt. The prose a caller reads says
//   "learner" and "team member".
// ============================================================================

/**
 * Can the render engine actually draw this value?
 *
 * Mirrors the accept test in `fetchImageAsDataUrl` (lib/id-cards/render-data.ts):
 * an inline `data:image/` URI is taken as-is, an `http(s)` URL is fetched, and
 * EVERYTHING ELSE returns null before a request is ever made. True here means
 * the renderer would ATTEMPT this value — not that the attempt will succeed.
 *
 * This matters because the photo columns hold real junk on this estate — a
 * roll number typed into the photo field, a bare filename like `GRACIA.JPEG`
 * with no scheme. Those are stored values, so a plain null/empty check calls
 * them a photo. The renderer would draw initials for every one of them.
 */
export function isRenderablePhotoRef(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return false;
  return trimmed.startsWith('data:image/') || /^https?:\/\//i.test(trimmed);
}

/**
 * The two picture slots that feed a card, in the order the render engine
 * consults them.
 *
 * `officialPhotoUrl` is the picture the institution took and holds on the
 * person's own record — learners_profiles.student_photo_url for a learner,
 * staff.profile_picture for a team member.
 *
 * `accountAvatarUrl` is profiles.avatar_url: whatever picture is on their login
 * account. The render engine falls back to it (render-data.ts step 3), so a
 * card WILL print off it — but it is not evidence the institution photographed
 * anyone.
 */
export interface CardPhotoInput {
  officialPhotoUrl?: string | null;
  accountAvatarUrl?: string | null;
}

/**
 * String-tagged deliberately. This repo compiles with `strictNullChecks: false`
 * (tsconfig.json), and under that setting TypeScript does NOT narrow a union
 * keyed on a boolean literal — a `{ ok: true } | { ok: false; code }` shape
 * fails to compile at every use site. A string tag narrows correctly.
 */
export type PhotoVerdict =
  /** An official photograph will print. Nothing to confirm. */
  | { kind: 'official' }
  /**
   * No official photograph, but the account picture will render. The card is
   * printable and is NOT refused — the caller confirms it knowingly.
   */
  | { kind: 'account_only' }
  /** No drawable reference anywhere. The card would print initials. Refuse. */
  | { kind: 'missing' };

/** Which picture, if any, this card would actually print. */
export function classifyCardPhoto(input: CardPhotoInput): PhotoVerdict {
  if (isRenderablePhotoRef(input.officialPhotoUrl)) return { kind: 'official' };
  if (isRenderablePhotoRef(input.accountAvatarUrl)) return { kind: 'account_only' };
  return { kind: 'missing' };
}

/**
 * True when this person can be handed a card at all — the worklist's question.
 * `account_only` counts as printable: the Director's rule refuses an EMPTY
 * card, not an unofficial one.
 */
export function isPrintablePhoto(verdict: PhotoVerdict): boolean {
  return verdict.kind !== 'missing';
}

/**
 * The refusal code a caller receives. Kept beside the verdict so the endpoint
 * and the worklist cannot drift on what they call the same situation.
 */
export const PHOTO_MISSING_CODE = 'photo_missing';
export const PHOTO_UNOFFICIAL_CODE = 'unofficial_photo_requires_acknowledgement';

/**
 * What the person at the counter reads. Refusals here are never generic and
 * never silent (CLAUDE.md #27): each says what is wrong, what it means, and
 * the single next action that fixes it.
 */
export function describePhotoVerdict(verdict: PhotoVerdict): string {
  switch (verdict.kind) {
    case 'official':
      return 'An official photograph is on file — the card will print with it.';
    case 'account_only':
      return (
        'The only picture on file for this person is the one from their own login account, ' +
        'not a photograph taken by the institution. The card WILL print, using that picture. ' +
        'Re-submit with "unofficial_photo_acknowledged": true to print it as it is, or take ' +
        'an official photograph and add it to their record first.'
      );
    case 'missing':
      return (
        'No photograph is on file for this person, so an ID card cannot be printed. ' +
        'A card with no face on it shows only initials, which proves nothing at a gate — ' +
        'the photograph is the identity check. Take their photograph, add it to their ' +
        'record, then print the card. Nothing was printed and no ribbon was used.'
      );
  }
}
