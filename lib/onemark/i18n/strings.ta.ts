// lib/onemark/i18n/strings.ta.ts
// OneMark — the Tamil interface dictionary.
//
// NOTHING HERE IS NATIVE-REVIEWED YET. Every value below is one of two things:
//
//   1. A short phrase (five words or fewer) written against CLAUDE.md rule #24,
//      reusing vocabulary already shipped elsewhere in this codebase where one
//      existed. It still needs a native reviewer's tick — the PR body carries
//      the full sheet, and Lane 0 item 2 owns the review.
//   2. A `[TAMIL_TBD: <english>]` placeholder for anything longer. Rule #24
//      forbids generating long Tamil in a prompt: token-level corruption looks
//      plausible to anyone who cannot read the script, and this product's
//      readers can.
//
// A placeholder is NEVER rendered. resolveString() in ./index.ts detects the
// marker and returns the English phrase instead — ruling 10 of 2026-09-06:
// "show the English phrase quietly; the reviewer sheet lists what is still
// English." So this file is safe to ship half-finished, which is the point.
//
// The Record type is total: adding a key to strings.en.ts breaks this file
// until it is answered here, placeholder or not.

import { TAMIL_TBD_PREFIX } from './tbd';
import type { OneMarkStringKey } from './strings.en';

/** Build a placeholder from the English phrase, so a reviewer always sees what
 *  they are translating without opening the other file. */
const tbd = (english: string): string => `${TAMIL_TBD_PREFIX}${english}]`;

export const ONEMARK_STRINGS_TA: Record<OneMarkStringKey, string> = {
  // -- Hub -----------------------------------------------------------------
  'hub.subtitle': tbd(
    'One-score items lifted from past board papers: practise them, assemble them into a paper, or approve new drafts into the bank.',
  ),
  'hub.noAccess': tbd(
    "You don't have access to OneMark — contact your school's resource person.",
  ),

  'hub.card.practice.title': 'பயிற்சி',
  'hub.card.practice.description': tbd(
    'Answer one-score items from the live bank, unit by unit, and see your score as you go.',
  ),
  'hub.card.practice.audience': 'கற்பவர்கள்',

  'hub.card.paper.title': 'வினாத்தாள்',
  'hub.card.paper.description': tbd(
    'Assemble a one-score paper from the live bank against a unit list.',
  ),
  'hub.card.paper.audience': 'மூத்த கற்பவர்கள்',

  'hub.card.review.title': 'வரைவு சரிபார்ப்பு',
  'hub.card.review.description': tbd(
    'Read each draft against its source paper, set the answer and level, then tick it into the live bank.',
  ),
  'hub.card.review.audience': 'பாட மூத்த கற்பவர்கள்',

  // -- Mistake Vault panel --------------------------------------------------
  'vault.title': 'தவறுகள் பெட்டகம்',
  'vault.intro': tbd(
    'Every question you get wrong comes back here. Answer it correctly in two separate sittings, at least two days apart, and it leaves the vault.',
  ),
  'vault.empty': tbd('Nothing in your vault yet. It fills in as you practise.'),
  'vault.inVault': 'பெட்டகத்தில்',
  'vault.mastered': 'தேர்ச்சி',
  'vault.nextDue': 'அடுத்தது',
  'vault.comingBack': 'மீண்டும் வரும்',
  'vault.reviewDue': '{count} கேள்வி சரிபார்',
  'vault.nothingDue': 'இப்போது எதுவும் இல்லை',
  'vault.nothingDueTitle': 'இப்போது எதுவும் இல்லை',
  'vault.notSetUp': tbd('Vault review is not set up for this subject yet.'),

  // -- The language switch --------------------------------------------------
  'locale.label': 'மொழி',
  'locale.en': 'ஆங்கிலம்',
  'locale.ta': 'தமிழ்',
};
