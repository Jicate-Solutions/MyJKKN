/**
 * mess-scan-resolver — turns whatever a mess-door scan produced into the one
 * id `mess_meal_records.learner_id` will actually accept.
 *
 * WHY THIS EXISTS
 * `mess_meal_records.learner_id` is `FOREIGN KEY ... REFERENCES profiles(id)`
 * (migration 20260222000020). The printed learner card encodes something else
 * entirely: `lib/id-cards/render-data.ts` sets `qrValue = learner.id`, i.e. a
 * `learners_profiles.id`. Those two id spaces are disjoint — a card code fed
 * straight in as `learner_id` is a guaranteed 23503 foreign-key violation, for
 * every learner, every time. That is why `mess_meal_records` has never held a
 * single row.
 *
 * THE SHAPES THIS MUST ACCEPT
 * A sibling lane is moving the card QR from the raw UUID to the permanent JKKN
 * ID (`jkkn_identities.jkkn_id`, e.g. `348295-7`, Damm check digit and all).
 * Both card generations will be in wallets at the same time, so this screen
 * accepts both — plus free text, because the manual box's own label says
 * "Roll Number", and passing a roll number through as a uuid column yields a
 * raw Postgres 22P02 rather than anything a guard can act on.
 *
 *   looks like a UUID  -> learners_profiles.id, then profiles.id as a fallback
 *                         (an employee card encodes profiles.id directly)
 *   looks like 000000-0 -> jkkn_identities.jkkn_id, retired_at IS NULL
 *   anything else       -> roll number / register number
 *
 * DELIBERATELY LOCAL. The JKKN-ID lane has its own resolver; importing it would
 * couple two lanes that must stay independently mergeable. A follow-up
 * de-duplicates once both have landed.
 *
 * The lookup I/O is injected rather than imported so the decision logic above
 * is exercised directly by its test, instead of the test re-stating it.
 *
 * WHO IS REFUSED. A card outlives the person's place here, so a recognised
 * card is not automatically a valid one. The leaver rule is imported from
 * gate-scan-resolve rather than restated: the mess door and the gate must
 * refuse exactly the same people, or a leaver eats lunch on a card the guard
 * at the gate just turned red. It is a pure function — no database, no React.
 */

import { describeDeparture } from '@/lib/services/campus-living/gate-scan-resolve';

/** What the scanned string looks like, before any database is touched. */
export type ScannedCodeShape = 'uuid' | 'jkkn_id' | 'other';

/** How the subject was eventually found — surfaced to the guard for confidence. */
export type ScanMatchedBy = 'learner_profile_id' | 'profile_id' | 'jkkn_id' | 'roll_number';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JKKN_ID_RE = /^[0-9]{6}-[0-9]$/;

/**
 * Normalise then classify. Barcode wedges and camera decoders both like to
 * append a newline, and a hand-typed JKKN ID arrives with the dash missing or
 * padded — none of which should read as "card not recognised".
 */
export function classifyScannedCode(raw: string | null | undefined): {
  code: string;
  shape: ScannedCodeShape;
} {
  const code = (raw ?? '').replace(/[\r\n]/g, '').trim();
  if (UUID_RE.test(code)) return { code, shape: 'uuid' };
  const compact = code.replace(/[\s-]/g, '');
  if (/^[0-9]{7}$/.test(compact)) {
    return { code: `${compact.slice(0, 6)}-${compact.slice(6)}`, shape: 'jkkn_id' };
  }
  if (JKKN_ID_RE.test(code)) return { code, shape: 'jkkn_id' };
  return { code, shape: 'other' };
}

export interface ScannedLearner {
  /** learners_profiles.id */
  id: string;
  institutionId: string | null;
  fullName: string;
  rollNumber: string | null;
  /**
   * learners_profiles.lifecycle_status, read on THIS scan. A card keeps
   * working after its holder leaves, so the only place a dead card can be
   * caught is the moment it is presented. Null when unreadable, which reads as
   * "not shown to have left" — see describeDeparture.
   */
  lifecycleStatus: string | null;
}

/**
 * The database reads this resolver needs. Implemented over Supabase by
 * MessMealService; faked in tests.
 */
export interface MessScanLookup {
  learnerByLearnerProfileId(id: string): Promise<ScannedLearner | null>;
  learnerByRollNumber(rollOrRegister: string): Promise<ScannedLearner | null>;
  learnerProfileIdByJkknId(jkknId: string): Promise<string | null>;
  /** profiles.id whose learner_id == learners_profiles.id (strictly 1:1). */
  profileIdForLearner(learnerProfileId: string): Promise<string | null>;
  /** The scanned uuid may already BE a profiles.id — an employee card. */
  profileById(id: string): Promise<{
    id: string;
    institutionId: string | null;
    fullName: string;
    /**
     * staff.is_active for this person — the employment flag, NOT staff.status
     * (a profile-page publish state that says nothing about whether they still
     * work here). Null when there is no team-member record to read.
     */
    teamMemberIsActive: boolean | null;
  } | null>;
}

export type MessScanResolution =
  | {
      status: 'ok';
      /** The value to write to mess_meal_records.learner_id. */
      profileId: string;
      /** Taken from the LEARNER, never from the scanning guard. */
      institutionId: string | null;
      displayName: string;
      rollNumber: string | null;
      matchedBy: ScanMatchedBy;
    }
  /** The code matched nothing — an unknown card, or one that has been retired. */
  | { status: 'not_recognised'; code: string; shape: ScannedCodeShape }
  /**
   * A real, recognised card belonging to somebody who has LEFT. Distinct from
   * 'not_recognised' on purpose: the card scans perfectly, so telling the
   * server "card not recognised" would send them to fix a reader that is
   * working. `reason` names the actual status behind the refusal.
   */
  | { status: 'has_left'; code: string; displayName: string; reason: string }
  /**
   * A real learner, but no login profile to hang the record on. ~1,190 of
   * 7,235 learners_profiles rows have no profiles row, so roughly one card in
   * six lands here. It must read as a data gap, not as broken hardware.
   */
  | { status: 'no_login_profile'; code: string; displayName: string };

/**
 * Resolve a scanned code to the profiles.id a meal record can be written
 * against. Never throws for an unrecognised code — an unknown card is an
 * answer, not an error.
 */
export async function resolveScannedCode(
  raw: string | null | undefined,
  lookup: MessScanLookup
): Promise<MessScanResolution> {
  const { code, shape } = classifyScannedCode(raw);
  if (!code) return { status: 'not_recognised', code, shape };

  let learner: ScannedLearner | null = null;
  let matchedBy: ScanMatchedBy = 'learner_profile_id';

  if (shape === 'uuid') {
    learner = await lookup.learnerByLearnerProfileId(code);
    if (!learner) {
      // Employee cards encode profiles.id directly (render-data.ts:755), and
      // that id is already what the FK wants — no bridge needed.
      const profile = await lookup.profileById(code);
      if (profile) {
        const gone = describeDeparture({
          kind: 'team_member',
          isActive: profile.teamMemberIsActive,
        });
        if (gone) {
          return {
            status: 'has_left',
            code,
            displayName: profile.fullName || code,
            reason: gone,
          };
        }
        return {
          status: 'ok',
          profileId: profile.id,
          institutionId: profile.institutionId,
          displayName: profile.fullName || code,
          rollNumber: null,
          matchedBy: 'profile_id',
        };
      }
    }
  } else if (shape === 'jkkn_id') {
    const learnerProfileId = await lookup.learnerProfileIdByJkknId(code);
    if (learnerProfileId) {
      learner = await lookup.learnerByLearnerProfileId(learnerProfileId);
      matchedBy = 'jkkn_id';
    }
  } else {
    learner = await lookup.learnerByRollNumber(code);
    matchedBy = 'roll_number';
  }

  if (!learner) return { status: 'not_recognised', code, shape };

  // Judged BEFORE the login-profile bridge: a leaver with no login account
  // should hear that their card is dead, not that a login is missing.
  const gone = describeDeparture({
    kind: 'learner',
    lifecycleStatus: learner.lifecycleStatus,
  });
  if (gone) {
    return { status: 'has_left', code, displayName: learner.fullName || code, reason: gone };
  }

  const profileId = await lookup.profileIdForLearner(learner.id);
  if (!profileId) {
    return { status: 'no_login_profile', code, displayName: learner.fullName || code };
  }

  return {
    status: 'ok',
    profileId,
    institutionId: learner.institutionId,
    displayName: learner.fullName || code,
    rollNumber: learner.rollNumber,
    matchedBy,
  };
}
