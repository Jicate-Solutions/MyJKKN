/**
 * CEO Rounds Log — Smart Guide (authored content).
 *
 * CEO Rounds is the MBA teaching-enterprise "daily round": a Senior Learner (or
 * CEO) logs the day's theme + decision, records who took part and grades their
 * participation, captures follow-up tasks (optionally linked to an Improvement
 * Board idea), and a rotating MBA Associate writes the round summary that the
 * Senior Learner then approves.
 *
 * TWO canonical lanes, authored from the REAL production surface (jicate/main —
 * app/(routes)/ceo-rounds/*):
 *   - learner    → the rotating MBA Associate assigned to write a round's
 *                  summary (and, as an attendee, the person whose participation
 *                  is graded). Every learner section is gated by
 *                  ceo_rounds.summary.write, so CEO Rounds content never leaks
 *                  into the open learner floor — a learner who is not an assigned
 *                  summary author simply sees none of these sections.
 *   - supervisor → the Senior Learner / CEO who logs rounds, grades
 *                  participation, adds follow-up tasks, and reviews + approves the
 *                  summary. Gated by ceo_rounds.log (applied uniformly in the
 *                  registry with withRequires, matching HR/OKR manager lanes).
 *
 * ACCURACY NOTES (verified against code, not assumed):
 *   - Participation is graded on four levels — Absent, Present, Contributed, Led
 *     — worth 0 / 1 / 2 / 3 points (ceo-rounds-service PARTICIPATION_WEIGHT). A
 *     round card shows the "present" count and the total "participation pts".
 *   - The summary is NEVER a direct table write. The assigned Associate's only
 *     path is the SECURITY DEFINER RPC fn_ceo_round_write_summary; approval is
 *     fn_ceo_round_approve_summary (a Senior Learner gate). Summary status runs
 *     pending → submitted → approved, and once approved it is locked from edits.
 *   - Follow-up tasks can be linked to an open Improvement Board idea, so a round
 *     decision and a filed idea stay connected.
 *
 * Gating: the REQUIRES keys below are the REAL keys from
 * lib/constants/permissions.ts ('ceo_rounds' category) and the same keys that
 * gate the /ceo-rounds route in lib/sidebarMenuLink.ts MENU_PERMISSIONS. The
 * registry re-keys and (for the supervisor lane) re-applies them, so a rename is
 * a compile error, not a silent fail-open lane.
 */

import type { CanonicalPersona, GlossaryTerm, PersonaGuide } from '../../guide/types';

/**
 * Permission keys gating what a viewer sees. ONE source of truth, read by the
 * registry.
 *   - log     : can log a round + grade participation + add tasks + approve the
 *               summary (the Senior Learner / CEO). Also the /ceo-rounds route
 *               gate in MENU_PERMISSIONS.
 *   - summary : can write + submit a round's summary when assigned to it (the
 *               rotating MBA Associate).
 * Both exist in lib/constants/permissions.ts under the 'ceo_rounds' key.
 */
export const REQUIRES = {
  log: 'ceo_rounds.log',
  summary: 'ceo_rounds.summary.write',
} as const;

/** The two canonical personas this module fills — a closed record it satisfies
 *  in full (so no missing-persona type error), while keeping `persona` typed as
 *  the shared CanonicalPersona. */
type CeoRoundsPersona = Extract<CanonicalPersona, 'learner' | 'supervisor'>;

interface CeoRoundsGuideBook {
  lanes: Record<CeoRoundsPersona, PersonaGuide>;
  glossary: GlossaryTerm[];
  plannedLocaleNote?: string;
}

export const GUIDES: CeoRoundsGuideBook = {
  lanes: {
    /* ─────────────────────────── ASSOCIATE (learner) ─────────────────────────
     * The rotating MBA Associate assigned to write a round's summary — and, as an
     * attendee, the person whose participation is graded. EVERY section is gated
     * by ceo_rounds.summary.write (passed through verbatim by the registry), so a
     * learner who is not an assigned summary author sees none of it. */
    learner: {
      persona: 'learner',
      title: 'Round Summary Author',
      tagline:
        'When it is your turn, capture the daily round in a clear summary the Senior Learner can approve.',
      whyItMatters:
        'The summary is the round’s memory. When you write it clearly and promptly, the decision and the follow-ups are on record for everyone who could not be there — and your name is on the write-up. It is a small, visible way to show you can turn a busy discussion into something people can act on.',
      requires: REQUIRES.summary,
      startHere: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
      journey: [
        'Understand what a daily round is',
        'Take part and earn participation points',
        'Write the summary of the round you were assigned',
        'Get it approved by your Senior Learner',
      ],
      sections: [
        {
          id: 'understand-the-round',
          title: 'Understand the daily round',
          requires: REQUIRES.summary,
          steps: [
            {
              action: 'Open **CEO Rounds** to see the daily rounds log.',
              detail:
                'Each card is one day’s round: the date, the **theme** (what it was mainly about), the **decision** taken, how many people were **present**, and the total **participation points**.',
              platforms: {
                web: 'Left sidebar → **CEO Rounds**.',
                mobile: 'Tap the menu (**☰**) → **CEO Rounds**.',
              },
              link: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
            },
            {
              action: 'Click a round card to open the full round.',
              detail:
                'Inside you see the decision, everyone who took part with their participation grade, the follow-up tasks, and the round summary.',
            },
            {
              action:
                'Learn how participation is graded: **Absent**, **Present**, **Contributed**, or **Led**.',
              detail:
                'They are worth **0, 1, 2, and 3 points**. Turning up counts; speaking up counts more; leading part of the round counts most. Your Senior Learner sets the grade for each person who took part.',
              tip: 'You cannot change your own grade — grading is the Senior Learner’s job. Focus on contributing and leading; the points follow.',
            },
          ],
        },
        {
          id: 'write-the-summary',
          title: 'Write the round summary',
          requires: REQUIRES.summary,
          steps: [
            {
              action: 'Open the round your Senior Learner assigned you to write up.',
              detail:
                'When a round is logged, a Senior Learner picks who writes its summary. If that is you, open that round’s card to find the **Round summary** box.',
              prerequisite:
                'You can only write the summary for a round you were assigned as its author. If you open a round and there is no summary box, you are not the assigned author for that one — ask your Senior Learner to assign you.',
              link: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
            },
            {
              action: 'Write the summary in the **Round summary** box.',
              detail:
                'Capture what the round was about, the decision taken, and the follow-ups agreed. Keep it short and plain — someone who missed the round should understand it in under a minute.',
            },
            {
              action: 'Click **Submit summary**.',
              detail:
                'Your summary moves to **submitted** and goes to your Senior Learner for approval. You can revise and submit again until it is approved.',
            },
            {
              action: 'Watch for **approved**.',
              detail:
                'Once your Senior Learner approves it, the summary is locked in as the official record of that round — no more edits. That is the round closed on your side.',
            },
          ],
        },
      ],
    },

    /* ─────────────────────── SENIOR LEARNER (supervisor) ─────────────────────
     * The Senior Learner / CEO who logs rounds, grades participation, adds
     * follow-up tasks, and reviews + approves the summary. Gated by
     * ceo_rounds.log (applied uniformly by the registry with withRequires). */
    supervisor: {
      persona: 'supervisor',
      title: 'Senior Learner Guide',
      tagline:
        'Log each daily round, grade how people took part, capture the follow-ups, and approve the write-up.',
      whyItMatters:
        'The round is where the day’s decision gets made and owned. When you log it, grade participation honestly, and approve a clear summary, everyone can see what was decided and who is driving it — and your associates learn that taking part and leading is noticed and counts.',
      requires: REQUIRES.log,
      startHere: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
      journey: [
        'Log the daily round',
        'Record who took part and grade participation',
        'Capture the follow-up tasks',
        'Review and approve the rotating summary',
      ],
      sections: [
        {
          id: 'log-a-round',
          title: 'Log a round',
          steps: [
            {
              action: 'Open **CEO Rounds** and click **Log a round**.',
              detail:
                'This opens a short form for the day’s round. Nothing is shared until you save it.',
              platforms: {
                web: 'Left sidebar → **CEO Rounds** → **Log a round**.',
                mobile: 'Tap the menu (**☰**) → **CEO Rounds** → **Log a round**.',
              },
              link: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
            },
            {
              action: 'Set the **Date** and the **Theme** (both required).',
              detail:
                'The theme is one line naming what the round was mainly about. Add the **Decision** if a clear one was taken — that is optional.',
            },
            {
              action: 'Assign **Summary written by** to the rotating MBA Associate.',
              detail:
                'Pick the associate whose turn it is to write this round up. Only they (or you) can then write its summary. You can leave it unassigned and set it later.',
              tip: 'Rotating this each round spreads the write-up practice across your associates.',
            },
            {
              action: 'Click **Log round**.',
              detail:
                'The round is saved and appears at the top of the log, ready for you to add who took part and the follow-up tasks.',
            },
          ],
        },
        {
          id: 'grade-participation',
          title: 'Record who took part and grade participation',
          steps: [
            {
              action: 'Open the round card, then add people under **Participation**.',
              detail:
                'Use **Add someone who took part…** to add each attendee. Everyone you add starts as **Present**.',
              link: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
            },
            {
              action:
                'Set each person’s grade: **Absent**, **Present**, **Contributed**, or **Led**.',
              detail:
                'These are worth **0, 1, 2, and 3 points**. Contributed is for someone who added something real; Led is for someone who ran part of the round. The round’s total **participation pts** updates as you grade.',
              tip: 'Grade honestly and consistently — the points are the recognition, and associates notice when leading actually counts.',
            },
          ],
        },
        {
          id: 'follow-up-tasks',
          title: 'Capture the follow-up tasks',
          steps: [
            {
              action: 'Under **Follow-up tasks**, add each action the round agreed.',
              detail:
                'Type the task, set an **owner** and a **due date** so it is clear who is doing what by when.',
              link: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
            },
            {
              action: 'Optionally **link a Board idea** to a task.',
              detail:
                'Use **Link a Board idea…** to connect the task to an open Improvement Board idea, so a round decision and the idea it belongs to stay joined up.',
              tip: 'Tick a task’s circle to mark it **done** once it is finished.',
            },
          ],
        },
        {
          id: 'review-approve-summary',
          title: 'Review and approve the summary',
          steps: [
            {
              action: 'Read the summary the assigned associate submitted.',
              detail:
                'When the summary status shows **submitted**, open the round and read the **Round summary**. Check it captures the theme, the decision, and the follow-ups.',
              link: { label: 'Open CEO Rounds', href: '/ceo-rounds' },
            },
            {
              action: 'Click **Approve summary** when it is right.',
              detail:
                'Approving locks the summary in as the official record of the round. If it needs work, you can revise it yourself in the box before approving.',
              tip: 'Approve promptly. A quick approval tells the associate their write-up mattered — and keeps them writing.',
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: 'CEO Round', def: 'The daily teaching-enterprise round: the theme discussed, the decision taken, who took part, and the follow-up tasks — all logged in one place.' },
    { term: 'Theme', def: 'One line naming what a round was mainly about. Required when a round is logged.' },
    { term: 'Decision', def: 'The key decision taken in a round, if there was one. Recorded on the round so it is on the record.' },
    { term: 'Participation grade', def: 'How each person took part in a round: Absent, Present, Contributed, or Led — worth 0, 1, 2, and 3 points. Set by the Senior Learner.' },
    { term: 'Participation points', def: 'The total of every attendee’s participation grade for a round. Shown on the card as "participation pts" and the recognition for taking part.' },
    { term: 'Round summary', def: 'A short write-up of a round, written by the assigned associate and approved by a Senior Learner. It becomes the official record once approved.' },
    { term: 'Summary author', def: 'The rotating MBA Associate assigned to write a particular round’s summary. Only they (or a Senior Learner) can write it.' },
    { term: 'Summary status', def: 'Where a summary is: pending (not written), submitted (written, waiting on approval), or approved (locked in as the record).' },
    { term: 'Follow-up task', def: 'An action a round agreed, with an owner and a due date. Can be linked to an open Improvement Board idea.' },
    { term: 'Linked Board idea', def: 'An Improvement Board idea joined to a follow-up task, so a round decision and the idea it belongs to stay connected.' },
    { term: 'Senior Learner', def: 'The Senior Learner (or CEO) who logs rounds, grades participation, adds tasks, and approves summaries.' },
    { term: 'MBA Associate', def: 'An MBA Management Associate — here, the person who takes part in a round and, when it is their turn, writes its summary.' },
  ],

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};
