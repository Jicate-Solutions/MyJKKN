/**
 * AI Pulse Smart Guide — authored content (the actual product).
 *
 * Six persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes. Every step that happens on a page carries a "Take me there"
 * deep-link. Permission gating uses the shared REQUIRES keys below (imported by
 * detect-lane.ts so a rename is a compile error, not a silent fail-open lane).
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each staff lane. ONE source of truth — content.ts
 *  sets `requires`, detect-lane.ts checks the same key. */
export const REQUIRES = {
  admin: "aiPulse:policies.manage",
  champion: "aiPulse:cycles.manage",
  faculty: "aiPulse:lab.score",
  hod: "aiPulse:dept.heatmap",
  incharge: "aiPulse:attendance.mark",
} as const;

const IMG = "/images/ai-pulse-guide";

export const GUIDES: GuideBook = {
  lanes: {
    /* ── STUDENT (open lane — every learner) ───────────────────────────── */
    student: {
      persona: "student",
      title: "Student Guide",
      tagline:
        "Join the weekly session, take part, and get counted — here's how.",
      whyItMatters:
        "Every engaged week adds to your streak and your AI skills profile — and the best team work gets shown across the whole institution.",
      startHere: { label: "Go to My Pulse", href: "/ai-pulse/my-pulse" },
      journey: ["Join the session", "Hit all 4 gates", "Build the challenge", "See if you won Gold", "Climb the leaderboard"],
      sections: [
        {
          id: "join",
          title: "How to join",
          steps: [
            {
              action: "Open **My Pulse** and press the green **Open Live Session** button.",
              detail:
                "Use this button — not a meeting link someone shares. Only this records that you attended. It unlocks 15 minutes before the session starts.",
              prerequisite:
                "You must be enrolled in a section first — your Class Incharge adds you. If My Pulse says you're not on a team yet, ask them.",
              platforms: {
                web: "left sidebar → AI Pulse → My Pulse",
                mobile: "tap More (⋯) in the bottom bar → AI Pulse → My Pulse",
              },
              link: { label: "Go to My Pulse", href: "/ai-pulse/my-pulse" },
              image: {
                src: `${IMG}/my-pulse-card.png`,
                alt: "The My Pulse card with the Open Live Session button",
                width: 912,
                height: 728,
                highlight: { x: 4, y: 83, width: 39, height: 11, label: "Tap here" },
              },
            },
          ],
        },
        {
          id: "engaged",
          title: "How attendance is tracked",
          steps: [
            {
              action: "There's **no register to sign** — your attendance is recorded automatically from what you do in the session.",
              detail:
                "You count as engaged only when all four lights turn green: joined on time, answered the polls, stayed to the end, and passed the quiz. If there were no polls that week, that light passes on its own.",
              tip: "Missed the live session? You can still take the quiz for 48 hours (the async make-up window).",
              image: {
                src: `${IMG}/engagement-gates.png`,
                alt: "The four engagement gates",
                width: 1856,
                height: 704,
                highlight: { x: 2, y: 26, width: 34, height: 50, label: "All 4 turn green" },
              },
            },
          ],
        },
        {
          id: "challenge",
          title: "Your team's challenge",
          steps: [
            {
              action: "Read **this week's challenge** on your My Pulse card and build it with your team.",
              detail:
                "Your team uses the week's AI tool to build the challenge and submits a link. The best two teams per department become Gold and are shown to everyone.",
              link: { label: "Open My Pulse", href: "/ai-pulse/my-pulse" },
            },
          ],
        },
        {
          id: "leaderboard",
          title: "See where you stand",
          steps: [
            {
              action: "Open the **Leaderboard** to see your points, badges, and rank.",
              detail:
                "You earn points for taking part — build a prompt, take the quiz, use a weekly starter, or publish your work — and bonus points for doing it well. Everyone can see the board, and your department climbs when more of you take part.",
              tip: "Build a prompt that passes all four checks (role, context, task, format) to earn the Gold Prompt badge.",
              platforms: {
                web: "left sidebar → AI Pulse → Leaderboard",
                mobile: "tap More (⋯) in the bottom bar → AI Pulse → Leaderboard",
              },
              link: { label: "Open the Leaderboard", href: "/ai-pulse/leaderboard" },
            },
          ],
        },
      ],
    },

    /* ── CHAMPION ──────────────────────────────────────────────────────── */
    champion: {
      persona: "champion",
      title: "Champion Guide",
      tagline: "You set up each week and host the Thursday session.",
      whyItMatters:
        "A fully set-up week is the difference between real engagement and a week that scores 0%.",
      startHere: { label: "Open Champion · Cycles", href: "/ai-pulse/admin/cycles" },
      requires: REQUIRES.champion,
      journey: ["Pick tool + topic", "Write the challenge", "Set the Teams link", "Author the quiz", "Host Thursday"],
      sections: [
        {
          id: "setup",
          title: "Set up this week (before Thursday)",
          steps: [
            {
              action: "Open **Champion · Cycles** and click this week's cycle.",
              detail: "Everything below is one form — fill it top to bottom.",
              platforms: {
                web: "left sidebar → AI Pulse → Champion · Cycles",
                mobile: "tap More (⋯) in the bottom bar → AI Pulse → Champion · Cycles",
              },
              link: { label: "Open Champion · Cycles", href: "/ai-pulse/admin/cycles" },
            },
            {
              action: "Pick the **featured tool** and write the **briefing topic**.",
              detail: "Choose this week's AI tool (Lovable, Cursor, Gemini, ChatGPT, and more) and a one-line topic.",
            },
            {
              action: "Write **this week's challenge**.",
              detail: "What every team must build and submit. Students see it; faculty judge against it.",
              tip: "Skip the challenge and there's nothing for faculty to judge on Monday.",
              image: {
                src: `${IMG}/champion-checklist.png`,
                alt: "The cycle setup form, with the This week's challenge field",
                width: 1856,
                height: 1940,
                highlight: { x: 2, y: 53, width: 96, height: 10, label: "This field" },
              },
            },
            {
              action: "Paste the **meeting link** (Microsoft Teams).",
              detail: "Teams allows up to 1,000 people in one call — preferred over Meet.",
            },
            {
              action: "Create the **quiz**.",
              detail: "Open the cycle's Quiz page and use the ✨ suggest button to draft questions from the topic.",
              tip: "If you forget the quiz, the whole week honestly shows 0% engaged — on purpose.",
              link: { label: "Open Champion · Cycles", href: "/ai-pulse/admin/cycles" },
            },
            {
              action: "Answer last week's feedback in **You said, we changed**.",
              detail: "Read the anonymous comments at the bottom of the cycle page and reply in one line — students see it on My Pulse.",
            },
          ],
        },
      ],
    },

    /* ── FACULTY ───────────────────────────────────────────────────────── */
    faculty: {
      persona: "faculty",
      title: "Faculty Guide",
      tagline: "On Monday you judge the week's work and pick the best teams.",
      whyItMatters:
        "Your picks are the only work that counts as Gold for accreditation — your judgement is the scoreboard.",
      startHere: { label: "Open the Lab", href: "/ai-pulse/lab" },
      requires: REQUIRES.faculty,
      journey: ["Open the Lab", "Read submissions", "Score against the challenge", "Pick Top-2 Gold"],
      sections: [
        {
          id: "score",
          title: "Score the Monday Lab",
          steps: [
            {
              action: "Open the **Lab** — it lands on the most recent session whose Thursday has passed.",
              platforms: {
                web: "left sidebar → AI Pulse → Lab",
                mobile: "tap More (⋯) in the bottom bar → AI Pulse → Lab",
              },
              link: { label: "Open the Lab", href: "/ai-pulse/lab" },
            },
            {
              action: "Read each team's submission and **score it against the week's challenge**.",
              detail: "Does it actually solve the stated problem? That's the bar.",
            },
            {
              action: "Pick the **top 2 per department** as Gold Standard.",
              tip: "Only the teams you pick count as Gold for NAAC and the Agency Index — numbers a team claims about itself never do.",
            },
          ],
        },
      ],
    },

    /* ── HOD / PRINCIPAL ───────────────────────────────────────────────── */
    hod: {
      persona: "hod",
      title: "HOD Guide",
      tagline: "You watch how your department takes part, week over week.",
      whyItMatters:
        "The heatmap is your early warning — a row of misses is where you step in before it becomes a problem.",
      startHere: { label: "Open the Heatmap", href: "/ai-pulse/dept" },
      requires: REQUIRES.hod,
      journey: ["Open the heatmap", "Spot the pattern", "Intervene early"],
      sections: [
        {
          id: "watch",
          title: "Read the department heatmap",
          steps: [
            {
              action: "Open **Dept** — each row is a department, each cell is a week.",
              detail: "Green = engaged, faded = missed.",
              platforms: {
                web: "left sidebar → AI Pulse → Dept",
                mobile: "tap More (⋯) in the bottom bar → AI Pulse → Dept",
              },
              link: { label: "Open the Heatmap", href: "/ai-pulse/dept" },
            },
            {
              action: "Spot a **row of misses** for your department — that's the signal to step in.",
              detail: "The system tiers this from a gentle nudge to an academic flag as misses accumulate.",
            },
            {
              action: "Use the **Intervene** action to start an HOD conversation when a department keeps missing.",
            },
          ],
        },
      ],
    },

    /* ── CLASS INCHARGE (no single console — why-line only) ─────────────── */
    incharge: {
      persona: "incharge",
      title: "Class Incharge Guide",
      tagline: "You keep your section's participation on track.",
      whyItMatters:
        "The system counts each learner automatically — your job is the exceptions: excuse genuine absences and chase the misses.",
      requires: REQUIRES.incharge,
      journey: ["Attendance is automatic", "Mark the exceptions", "Chase absences"],
      sections: [
        {
          id: "overlay",
          title: "Your team-level overlay",
          steps: [
            {
              action: "Know that each learner's attendance is recorded **automatically** from the four gates — you don't take a roll-call.",
            },
            {
              action: "**Mark or adjust team attendance** when the automatic record needs a human correction.",
              detail: "Set a team Present, Absent, or Excused — e.g. when someone took part offline.",
            },
            {
              action: "**Follow up on absences** — the system flags a miss; chase it up or escalate to the Champion and HOD.",
            },
            {
              action: "Teams are **drawn for you** every Friday — 'everyone gets a turn.' You don't pick them by hand.",
            },
          ],
        },
      ],
    },

    /* ── ADMIN ─────────────────────────────────────────────────────────── */
    admin: {
      persona: "admin",
      title: "Admin Guide",
      tagline: "You set the rules the whole program runs on, and keep it honest.",
      whyItMatters:
        "These settings shape how the whole program behaves and stays fair.",
      startHere: { label: "Open Policies", href: "/ai-pulse/admin/policies" },
      requires: REQUIRES.admin,
      journey: ["Set the policies", "Set up each week's cycle", "Review anomalies", "Export NAAC evidence"],
      sections: [
        {
          id: "run",
          title: "Set the policies and run the program",
          steps: [
            {
              action: "Open **Admin · Policies** to tune how the whole program behaves.",
              detail:
                "One editor with 25+ settings, grouped: session timing (day, start/end, doors-open window, late threshold); quiz pass thresholds and the async make-up window; language and campus (bilingual mode + languages, multi-campus); the consequence tier thresholds for misses; gold-standard and bottom-N publication + visibility; the featured-tool rotation strategy and team-count thresholds; the engaged-state definition; the cron tick; and the Instagram post deadline + reach threshold. Changes apply on the next cycle — no deploy.",
              prerequisite:
                "The Policies editor is restricted to super-admins. If it is blocked, ask your platform admin — the program-admin permission alone does not open it.",
              link: { label: "Open Policies", href: "/ai-pulse/admin/policies" },
            },
            {
              action: "Oversee each week in **Champion · Cycles** — topic, featured tool, challenge, and quiz.",
              detail:
                "Every cycle is set up here: pick the week's featured AI tool from the master list, write the topic and challenge, set the meeting link, and author the quiz. This is where a week is made — skip the setup and it honestly shows 0% engaged.",
              prerequisite:
                "Cycles, Anomalies and NAAC Evidence (below) each need their OWN permission — they are not covered by the program-admin policy permission. They are usually granted to the same admins; if a page is blocked, ask for that permission.",
              link: { label: "Open Cycles", href: "/ai-pulse/admin/cycles" },
            },
            {
              action: "Review flagged activity at **Champion · Anomalies** (unusual scores, reach, or rotation).",
              link: { label: "Open Anomalies", href: "/ai-pulse/admin/anomalies" },
            },
            {
              action: "Export the accreditation evidence pack at **NAAC Evidence** when needed.",
              link: { label: "Open NAAC Evidence", href: "/ai-pulse/evidence/naac" },
            },
          ],
        },
        {
          id: "automatic",
          title: "What the system does for you",
          steps: [
            {
              action: "You never do these by hand: create next Thursday's session, draw the teams every Friday, flip the session live → finished by the clock, thank every student who passed the gates, and send the Director the weekly summary.",
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Cycle", def: "One week of AI Pulse — a Thursday session plus the work that follows." },
    { term: "Attendance", def: "Recorded automatically from the four gates during the live session — there's no register to sign. A Class Incharge can also mark a team present/absent by hand." },
    { term: "Engaged", def: "A student who passed all four gates that week: joined on time, answered polls, stayed to the end, passed the quiz." },
    { term: "Gold Standard", def: "The top 2 team projects per department, chosen by faculty on Monday." },
    { term: "Domain-Sync", def: "The thing a team builds and submits each week using that week's AI tool." },
    { term: "Champion", def: "The staff member who runs AI Pulse — sets up the week and hosts Thursday." },
    { term: "Async make-up", def: "A 48-hour window after the session to take the quiz if you missed it live." },
    { term: "NAAC", def: "The national college-accreditation body — Gold work becomes evidence for it." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};
