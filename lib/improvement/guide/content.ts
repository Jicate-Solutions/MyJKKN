/**
 * MBA Improvement Board — Smart Guide (authored content).
 *
 * The Improvement Board is the MBA teaching-enterprise pipeline where an MBA
 * Associate turns an everyday problem into a short business case, a Senior Learner
 * reviews it and moves the strong ones to real impact, and contributors are
 * recognised on an Impact Leaderboard.
 *
 * TWO canonical lanes, authored from the REAL production surface (jicate/main —
 * app/(routes)/improvement-board/*):
 *   - learner    → the MBA Associate who files ideas + tracks them + climbs the
 *                  leaderboard, PLUS a view-only reader. Sections are gated
 *                  per-section: "read the board" / "leaderboard" need only
 *                  improvement.ideas.view (so a view-only teammate sees them);
 *                  "file" / "track" need improvement.ideas.create (contributors).
 *   - supervisor → the Senior Learner / CEO who reviews, approves, applies,
 *                  verifies, scores, and reads the AI priority. Gated by
 *                  improvement.board.manage (applied uniformly in the registry).
 *
 * ACCURACY NOTES (verified against code, not assumed):
 *   - The pipeline is exactly six board columns: Logged → Under Review →
 *     Approved → Applied → Verified → Closed, plus the off-board outcomes
 *     Rejected / Withdrawn / Not Pursued (board-constants.ts BOARD_COLUMNS +
 *     STATUS_LABEL + ALLOWED_MANAGER_TRANSITIONS).
 *   - Every status move goes through the SECURITY DEFINER RPC
 *     `fn_improvement_set_status` (improvement-service.ts) — the UI only offers
 *     the legal next steps; the RPC is the real authority.
 *   - Board order = "AI ranks, humans adjust": a human `score` wins, else the
 *     latest AI rank, else newest first (improvement-board-client.tsx byPriority).
 *   - The Impact Leaderboard only ever shows the top N + the viewer's own rank —
 *     never a bottom / "worst" list (impact-leaderboard.tsx safeguard).
 *
 * Gating: the REQUIRES keys below are REAL keys from lib/constants/permissions.ts
 * ('improvement' category). content.ts sets `requires`; the registry re-keys and
 * (for the supervisor lane) re-applies them, so a rename is a compile error, not
 * a silent fail-open lane.
 */

import type { CanonicalPersona, GlossaryTerm, PersonaGuide } from '../../guide/types';

/**
 * Permission keys gating what a viewer sees. ONE source of truth, read by the
 * registry.
 *   - view   : can open the board + leaderboard (route gate, MENU_PERMISSIONS).
 *   - create : can file an idea ("File an idea" button, board client).
 *   - manage : can review / approve / apply / verify / score (Senior Learner/CEO).
 * All three exist in lib/constants/permissions.ts under the 'improvement' key.
 */
export const REQUIRES = {
  view: 'improvement.ideas.view',
  create: 'improvement.ideas.create',
  manage: 'improvement.board.manage',
} as const;

/** The two canonical personas this module fills — a closed record it satisfies
 *  in full (so no missing-persona type error), while keeping `persona` typed as
 *  the shared CanonicalPersona. */
type ImprovementPersona = Extract<CanonicalPersona, 'learner' | 'supervisor'>;

interface ImprovementGuideBook {
  lanes: Record<ImprovementPersona, PersonaGuide>;
  glossary: GlossaryTerm[];
  plannedLocaleNote?: string;
}

export const GUIDES: ImprovementGuideBook = {
  lanes: {
    /* ─────────────────────────── ASSOCIATE (learner) ─────────────────────────
     * The MBA Associate who files ideas + tracks them + climbs the leaderboard,
     * and the view-only reader. Section-gated: read/leaderboard need `view`;
     * file/track need `create`. */
    learner: {
      persona: 'learner',
      title: 'Associate Guide',
      tagline:
        'Turn an everyday problem into a business case the institution can act on — and follow it through to real impact.',
      whyItMatters:
        "This is how a good idea from the floor actually gets heard. You write a short business case, a Senior Learner reviews it, and the strong ones get applied for real — with your name on the impact. It is the difference between complaining about a problem and being the person who fixed it.",
      requires: REQUIRES.view,
      startHere: { label: 'Open the Improvement Board', href: '/improvement-board' },
      journey: [
        'Open and read the board',
        'File an idea as a short business case',
        'Track it through review to impact',
        'Climb the Impact Leaderboard',
        'Read your department analytics as an MBA Analyst',
        'See which department your team works with this rotation',
      ],
      sections: [
        {
          id: 'read-the-board',
          title: 'Find and read the board',
          requires: REQUIRES.view,
          steps: [
            {
              action: 'Open the **Improvement Board** to see every idea in one place.',
              detail:
                'The board is a set of columns. Each card is one idea, and where it sits tells you how far it has travelled.',
              platforms: {
                web: 'Left sidebar → **Improvement Board** → **Board**.',
                mobile: 'Tap the menu (**☰**) → **Improvement Board** → **Board**.',
              },
              link: { label: 'Open the board', href: '/improvement-board' },
            },
            {
              action:
                'Read the six columns left to right: **Logged → Under Review → Approved → Applied → Verified → Closed**.',
              detail:
                'That is the whole journey of an idea — from just filed (Logged) to reviewed, approved, actually done (Applied), checked (Verified), and finished (Closed).',
            },
            {
              action: 'Read the badges on each card.',
              detail:
                'A **⚡ lightning** badge means the idea was marked urgent (fast-track review). A **🔒 lock** means it is sensitive and only Senior Learners can see it. An **AI priority #N** badge is the AI’s suggested ranking, and **pts** is the score a Senior Learner has given.',
            },
            {
              action: 'Use the **area filter** at the top to focus on one area.',
              detail:
                'Pick an area (for example a department or a theme) to see only its ideas, or leave it on **All areas**.',
            },
            {
              action: 'Click any card to open its full **business case** and **activity timeline**.',
              detail:
                'The detail view shows the problem, the proposed fix, the expected impact, the evidence, who contributed, and every step the idea has taken so far.',
            },
          ],
        },
        {
          id: 'file-an-idea',
          title: 'File an improvement idea',
          requires: REQUIRES.create,
          steps: [
            {
              action: 'Click **File an idea** (top right of the board).',
              detail:
                'This opens a short form — a mini business case. Nothing is shared until you submit it.',
              prerequisite:
                'You need contributor access to file. If you can open the board but do not see a **File an idea** button, you have view-only access — ask your Senior Learner to enable filing for you.',
              link: { label: 'Open the board', href: '/improvement-board' },
            },
            {
              action: 'Give it a clear **Title** and pick an **Area**.',
              detail:
                'Both are required. The title is one line that names the improvement; the area files it under the right theme so the right people see it.',
              tip: 'You can also point it at a **target department** if the fix belongs to one specific team — leave it on "Not specific" if it does not.',
            },
            {
              action: 'Write **The problem** and your **Proposed fix**.',
              detail:
                'Both are required. Say what is not working today and who it affects, then say — concretely — what you would change.',
            },
            {
              action: 'Add **Expected impact** and **Evidence**.',
              detail:
                'These are optional, but they are what get an idea approved. Expected impact is what improves — time, cost, quality, experience. Evidence is which numbers, feedback, or records back it up.',
              tip: 'Credit anyone who helped in the **Contributors** note, and tick **Mark as urgent** only if it genuinely needs fast-track review.',
            },
            {
              action: 'Click **File idea**.',
              detail:
                'Your idea lands in the **Logged** column at the start of the pipeline, ready for a Senior Learner to review.',
            },
          ],
        },
        {
          id: 'track-your-idea',
          title: 'Track your idea to impact',
          requires: REQUIRES.create,
          steps: [
            {
              action: 'While your idea is still **Logged**, you can **Edit** or **Withdraw** it.',
              detail:
                'Open your card — as the author you will see Edit and Withdraw. Once a Senior Learner starts reviewing it (it moves past Logged), it is locked from editing so the review stays honest.',
              link: { label: 'Open the board', href: '/improvement-board' },
            },
            {
              action: 'Watch it move along the pipeline.',
              detail:
                'Under Review → Approved → Applied → Verified → Closed. The **activity timeline** on the card shows who moved it, when, and any note they left.',
            },
            {
              action: 'Read your **score** once a Senior Learner sets one.',
              detail:
                'A score (out of 100) appears on the card as **pts**. It is the recognition for your idea and it feeds your standing on the Impact Leaderboard.',
            },
            {
              action: 'If it is marked **Not Pursued** or **Rejected**, read the reason.',
              detail:
                'The reason is shown on the card. It is not a dead end — use it to sharpen the idea and file a stronger version.',
            },
          ],
        },
        {
          id: 'leaderboard',
          title: 'Climb the Impact Leaderboard',
          requires: REQUIRES.view,
          steps: [
            {
              action: 'Open the **Impact Leaderboard**.',
              detail:
                'Use the **Impact Leaderboard** button at the top of the board, or open it from the sidebar.',
              link: { label: 'Open the Impact Leaderboard', href: '/improvement-board/leaderboard' },
            },
            {
              action: 'Find the **top contributors** and **your own rank**.',
              detail:
                'It ranks people by their total improvement score. It only ever shows the top of the list and where you stand — never a "worst" list.',
            },
            {
              action: 'Keep filing well-evidenced, high-impact ideas to climb.',
              detail:
                'Scores add up across every idea you file, so a steady stream of small, solid improvements adds up as much as one big one.',
            },
          ],
        },
        {
          id: 'department-analytics',
          title: 'Read your department analytics (MBA Analyst)',
          requires: REQUIRES.view,
          steps: [
            {
              action: 'Open **My Analytics** to see the analytics for the department(s) you cover.',
              detail:
                'If you are posted to a department as an MBA Analyst, this is your read-only view of how that department is doing — the figures behind the improvement work.',
              prerequisite:
                'You see data here only once a manager assigns you to a department. Until then the page shows "No department assigned yet".',
              platforms: {
                web: 'Left sidebar → **Improvement Board** → **My Analytics**.',
                mobile: 'Tap the menu (**☰**) → **Improvement Board** → **My Analytics**.',
              },
              link: { label: 'Open My Analytics', href: '/improvement-board/analytics' },
            },
            {
              action: 'Read each department’s views, grouped by department.',
              detail:
                'Every department you cover has its own section. Each card is one view (for example an attendance or activity summary) shown as a simple table.',
            },
            {
              action: 'Understand that the figures are **de-identified** and small groups are **hidden**.',
              detail:
                'The numbers are aggregated, never named. Any group smaller than five is suppressed to protect privacy, so a card may show "No rows to show" — that means the group was too small, not that nothing happened.',
              tip: 'Views marked **Financial — de-identified, k≥5 suppressed** are sensitive money figures, shown the same privacy-safe way.',
            },
          ],
        },
        {
          id: 'view-rotation',
          title: 'See your team rotation',
          requires: REQUIRES.view,
          steps: [
            {
              action: 'Open **Team Rotation** to see the rota chart for your cycle.',
              detail:
                'The rota is a grid. Each row is a team, each column is a period (a block of time), and each cell shows the department that team works with during that period.',
              platforms: {
                web: 'Left sidebar → **Improvement Board** → **Team Rotation**.',
                mobile: 'Tap the menu (**☰**) → **Improvement Board** → **Team Rotation**.',
              },
              link: { label: 'Open Team Rotation', href: '/improvement-board/rotation' },
            },
            {
              action: 'Find the **highlighted period** — that is the one running now.',
              detail:
                'The current period is marked on the chart, so you can read straight across your team’s row to see which department you are paired with this block.',
            },
            {
              action: 'Read across your team’s row to see where you go next.',
              detail:
                'The cells to the right of the current period are the departments your team rotates to in the blocks ahead, so you can see what is coming.',
              tip: 'The rota is set by a Senior Learner. If a period looks empty, the schedule for that block has not been generated yet — it is not a mistake on your side.',
            },
          ],
        },
      ],
    },

    /* ─────────────────────── SENIOR LEARNER (supervisor) ─────────────────────
     * The Senior Learner / CEO who reviews, approves, applies, verifies, scores,
     * and reads the AI priority. Gated by improvement.board.manage (applied
     * uniformly by the registry). */
    supervisor: {
      persona: 'supervisor',
      title: 'Senior Learner Guide',
      tagline:
        'Review the ideas your associates file, move the strong ones to real impact, and recognise the best.',
      whyItMatters:
        "Your review is the moment an idea becomes real or dies quietly. When you move ideas promptly and leave a clear note on every step, associates see that filing an idea is worth it — and they keep coming. A note is the single biggest lever on whether the board stays alive.",
      requires: REQUIRES.manage,
      startHere: { label: 'Open the Improvement Board', href: '/improvement-board' },
      journey: [
        'Review the pipeline (you see everything, including sensitive ideas)',
        'Move an idea forward, step by step',
        'Score it and weigh the AI priority',
        'Recognise impact on the leaderboard',
        'Assign MBA Associates to the departments they analyse',
        'Build teams and run the team rotation',
      ],
      sections: [
        {
          id: 'review-pipeline',
          title: 'Review the pipeline',
          steps: [
            {
              action: 'Open the **Improvement Board** to see every idea across all six columns.',
              detail:
                'As a Senior Learner you see everything — including the **🔒 sensitive** ideas that are hidden from ordinary viewers.',
              platforms: {
                web: 'Left sidebar → **Improvement Board** → **Board**.',
                mobile: 'Tap the menu (**☰**) → **Improvement Board** → **Board**.',
              },
              link: { label: 'Open the board', href: '/improvement-board' },
            },
            {
              action: 'Read the order within each column: **AI ranks, you adjust**.',
              detail:
                'Cards are ordered by an **AI priority** (#1 is highest) with a short reason, until you give one a score — any idea you have scored floats to the top, so your judgement always shows over the AI’s suggestion.',
            },
            {
              action: 'Open a card to read the full business case and its **activity timeline**.',
              detail:
                'You get the problem, proposed fix, expected impact, evidence, contributors, the AI priority reason, and every move made so far.',
            },
          ],
        },
        {
          id: 'move-forward',
          title: 'Move an idea forward',
          steps: [
            {
              action: 'On an open card, use **Review actions** → **Move to…** to pick the next status.',
              detail:
                'The forward path is **Logged → Under Review → Approved → Applied → Verified → Closed**. You can also send an idea to **Not Pursued** or **Rejected** with a reason.',
              link: { label: 'Open the board', href: '/improvement-board' },
            },
            {
              action: 'Add a **note**, then click **Apply**.',
              detail:
                'Only the legal next steps are offered, and the move is checked again on the server — so you cannot skip a stage by accident.',
              tip: 'Leave a note on every move. The associate reads it on the timeline, and it is the feedback that keeps them filing.',
            },
            {
              action: 'Mark an idea **Applied**, then **Verified**, once the fix is actually live and checked.',
              detail:
                '**Applied** means the change was made; **Verified** means someone confirmed it worked. This is what turns a good idea into recorded impact.',
            },
          ],
        },
        {
          id: 'score',
          title: 'Score ideas and weigh the AI priority',
          steps: [
            {
              action: 'On the card, set a **Score** (0–100) and click **Save score**.',
              detail:
                'The score is the recognition for the idea. It drives the associate’s standing on the Impact Leaderboard, and a score you set overrides the AI’s suggested order on the board.',
              link: { label: 'Open the board', href: '/improvement-board' },
            },
            {
              action: 'Treat the **AI priority** as a suggestion, not a verdict.',
              detail:
                'The AI proposes an order with a reason (impact, feasibility, strategic fit). You decide — your score always wins over the AI rank.',
            },
          ],
        },
        {
          id: 'recognise',
          title: 'Recognise impact',
          steps: [
            {
              action: 'Open the **Impact Leaderboard** to see who is turning problems into applied improvements.',
              detail:
                'It ranks contributors by total score (top of the list only — never a "worst" list). Use it in reviews and rounds to recognise the associates driving real change.',
              link: { label: 'Open the Impact Leaderboard', href: '/improvement-board/leaderboard' },
            },
          ],
        },
        {
          id: 'assign-analysts',
          title: 'Assign analysts to departments',
          steps: [
            {
              action: 'Open **Analyst Assignments** to decide which MBA Associate covers which department.',
              detail:
                'This is where you post associates onto departments. An associate can cover more than one department, and only the department(s) you assign them show up on their **My Analytics** page.',
              platforms: {
                web: 'Left sidebar → **Improvement Board** → **Analyst Assignments**.',
                mobile: 'Tap the menu (**☰**) → **Improvement Board** → **Analyst Assignments**.',
              },
              link: { label: 'Open Analyst Assignments', href: '/improvement-board/postings' },
            },
            {
              action: 'Find an associate, then use **Add department** to assign one.',
              detail:
                'Search by name or email, then pick a department from the associate’s **Add department** menu. Assign as many as you need — each one appears as a chip on their card.',
              tip: 'The MBA Associate roster is kept in sync automatically each day, so you do not add people by hand — you only decide which departments they cover.',
            },
            {
              action: 'Remove a department with the **✕** on its chip.',
              detail:
                'Taking a department off an associate immediately stops that department’s analytics from showing on their My Analytics page.',
            },
          ],
        },
        {
          id: 'set-up-rotation',
          title: 'Build teams and run the rotation',
          steps: [
            {
              action: 'Open **Rotation Teams** to build teams of MBA Associates by hand.',
              detail:
                'Group your associates into the teams that will rotate together. You decide who is on each team.',
              platforms: {
                web: 'Left sidebar → **Improvement Board** → **Rotation Teams**.',
                mobile: 'Tap the menu (**☰**) → **Improvement Board** → **Rotation Teams**.',
              },
              link: { label: 'Open Rotation Teams', href: '/improvement-board/rotation/teams' },
            },
            {
              action: 'Open **Rotation Setup** to configure the cycle and generate the rota.',
              detail:
                'Set the period length, the start date, and which departments are in the rotation, then generate the schedule. Add exam or holiday blackouts so no team is rotated during a break.',
              link: { label: 'Open Rotation Setup', href: '/improvement-board/rotation/config' },
            },
            {
              action: 'Open **Team Rotation** to check the generated rota.',
              detail:
                'The chart shows every team’s department for every period, with the current period highlighted. Associates see this same chart (read-only), so they always know where their team is posted.',
              link: { label: 'Open Team Rotation', href: '/improvement-board/rotation' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: 'Improvement Board', def: 'The pipeline where an everyday problem is filed as a short business case, reviewed, and moved through to real, recorded impact.' },
    { term: 'Business case', def: 'The short form behind every idea: the problem, the proposed fix, the expected impact, and the evidence that shows it matters.' },
    { term: 'Area', def: 'The theme or department an idea is filed under, so the right people see it. You pick one when you file.' },
    { term: 'The pipeline', def: 'The six board columns an idea travels through: Logged, Under Review, Approved, Applied, Verified, Closed.' },
    { term: 'Logged', def: 'A freshly filed idea, waiting for a Senior Learner to review it. While Logged, the author can still edit or withdraw it.' },
    { term: 'Applied', def: 'The proposed change has actually been made — the point where an idea becomes real impact rather than a suggestion.' },
    { term: 'Verified', def: 'Someone has confirmed the applied change actually worked. The strongest form of a completed idea.' },
    { term: 'Not Pursued', def: 'An idea that was reviewed but not taken forward, with a reason recorded on the card. Not a dead end — a prompt to sharpen and refile.' },
    { term: 'Urgent (⚡)', def: 'A flag the author can set to request fast-track review. Shown as a lightning badge on the card.' },
    { term: 'Sensitive (🔒)', def: 'An idea hidden from ordinary viewers; only Senior Learners can see it. Shown as a lock badge.' },
    { term: 'AI priority', def: 'The AI’s suggested ranking of an idea (#1 is highest) with a short reason. A Senior Learner’s score always overrides it.' },
    { term: 'Score', def: 'A number out of 100 a Senior Learner sets on an idea. It is the recognition for the idea and it feeds the Impact Leaderboard.' },
    { term: 'Impact Leaderboard', def: 'Top contributors ranked by their total improvement score, plus your own rank. It never shows a bottom or "worst" list.' },
    { term: 'Associate', def: 'An MBA Management Associate — the person who spots a problem and files it as an improvement idea.' },
    { term: 'Senior Learner', def: 'The Senior Learner (or CEO) who reviews ideas, moves them through the pipeline, scores them, and recognises impact.' },
    { term: 'MBA Analyst', def: 'An MBA Associate posted to a department to read its analytics. The "My Analytics" page shows the department(s) they cover.' },
    { term: 'Analyst assignment', def: 'Posting an associate onto a department so that department’s analytics appear on their My Analytics page. Managed on the Analyst Assignments page; an associate can cover several departments.' },
    { term: 'De-identified / k≥5 suppressed', def: 'How the analytics are shown: figures are aggregated and never named, and any group smaller than five is hidden to protect privacy.' },
    { term: 'Team rotation', def: 'The schedule that pairs each MBA Associate team with a department for a block of time, then rotates them to another — so associates learn how several departments really run.' },
    { term: 'Rota chart', def: 'The grid on the Team Rotation page: rows are teams, columns are periods, and each cell is the department that team works with that period. The current period is highlighted.' },
    { term: 'Period (rotation)', def: 'One block of time in a rotation cycle. A team stays with one department for a period, then moves to the next department in the following period.' },
  ],

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};
