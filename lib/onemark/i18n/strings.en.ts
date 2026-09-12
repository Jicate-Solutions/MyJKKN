// lib/onemark/i18n/strings.en.ts
// OneMark — the English interface dictionary. THE source of truth for keys.
//
// Decision 5 (specs/onemark-decisions-2026-09-02.md) gives every person their
// own interface language. Ruling 5 of 2026-09-06
// (specs/onemark-wave3-2026-09-06.md) scopes this wave to LEARNER surfaces —
// the paper wizard and the review queue stay English until the next wave, so
// their copy is deliberately absent from this file.
//
// Two rules govern every entry:
//   * English is the fallback for everything. A key that has no reviewed Tamil
//     renders its English phrase quietly (ruling 10) — a learner never sees a
//     placeholder and never sees an empty control.
//   * Question CONTENT is not here. Stems and options are bilingual in the
//     bank (fp_items.stem_ta / options_ta) and are rendered by the practice
//     components' own Bilingual block. This file is chrome only.
//
// Interpolation: a phrase may carry {name} slots, filled by the `t` helper in
// ./index.ts. Slots are the same in both languages.
//
// Keys are added HERE first; strings.ta.ts is typed against this object, so a
// new key fails to compile until Tamil (or its [TAMIL_TBD:] placeholder) is
// written for it. That is the parity gate, enforced by the compiler as well as
// by __tests__/onemark/i18n-strings.test.ts.

export const ONEMARK_STRINGS_EN = {
  // -- Hub (/foundation/onemark) ------------------------------------------
  'hub.subtitle':
    'One-score items lifted from past board papers: practise them, assemble them into a paper, or approve new drafts into the bank.',
  'hub.noAccess':
    "You don't have access to OneMark — contact your school's resource person.",

  'hub.card.practice.title': 'Practice',
  'hub.card.practice.description':
    'Answer one-score items from the live bank, unit by unit, and see your score as you go.',
  'hub.card.practice.audience': 'Learners',

  'hub.card.paper.title': 'Paper',
  'hub.card.paper.description':
    'Assemble a one-score paper from the live bank against a unit list.',
  'hub.card.paper.audience': 'Senior Learners',

  'hub.card.review.title': 'Review drafts',
  'hub.card.review.description':
    'Read each draft against its source paper, set the answer and level, then tick it into the live bank.',
  'hub.card.review.audience': 'Subject Senior Learners',

  // -- Mistake Vault panel (learner) --------------------------------------
  'vault.title': 'Mistake Vault',
  'vault.intro':
    'Every question you get wrong comes back here. Answer it correctly in two separate sittings, at least two days apart, and it leaves the vault.',
  'vault.empty': 'Nothing in your vault yet. It fills in as you practise.',
  'vault.inVault': 'in the vault',
  'vault.mastered': 'mastered',
  'vault.nextDue': 'next due',
  'vault.comingBack': 'Coming back',
  'vault.reviewDue': 'Review {count} due now',
  'vault.nothingDue': 'Nothing due yet',
  'vault.nothingDueTitle': 'Nothing is due yet.',
  'vault.notSetUp': 'Vault review is not set up for this subject yet.',

  // -- The language switch itself -----------------------------------------
  'locale.label': 'Interface language',
  'locale.en': 'English',
  'locale.ta': 'Tamil',
} as const;

/** Every key the interface may ask for. */
export type OneMarkStringKey = keyof typeof ONEMARK_STRINGS_EN;
