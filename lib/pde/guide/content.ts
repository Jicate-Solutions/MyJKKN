/**
 * PDE (Personalized Development Engine) — Smart Guide content.
 *
 * Installed via the /smart-guide skill (2026-06-14), mirroring the campus-living
 * install: ONE GuideBook drives the full page, the in-app drawer, and the "?Help"
 * FAB on every PDE screen, so the three surfaces can never drift.
 *
 * Three lanes, authored from the REAL production routes (jicate/main):
 *   - learner  (ungated baseline) → /pde/learn/*
 *   - faculty  (pde.faculty.view) → /pde/faculty/*
 *   - admin    (pde.admin.view)   → /pde/admin/*
 *
 * ACCURACY NOTES (verified against code, not assumed):
 *   - Learner submissions + admin compliance use the SEVEN durable-value
 *     categories (judgment / embodied / problem_finding / accountability /
 *     social_leadership / cultural_civic / credential — lib/types/pde-demonstrations.ts).
 *   - The faculty demonstrations FILTER and the capabilities tree use a
 *     SEPARATE "capability category" taxonomy (technical / analytical / creative
 *     / ai_fluency / domain_ai …). This is a real product split, not a guide
 *     error — each lane is described accurately to its own screen, and the
 *     mismatch is logged in UX-UI-FRICTION.md rather than papered over.
 */

import type { GuideBook } from './types';

/**
 * Permission keys gating which lanes a NON-owner viewer may switch to. Defined
 * ONCE here and read by use-guide-lane.ts (via lanes[p].requires), so a rename
 * is a compile error, not a silently fail-open lane (auth-adapters.md rule).
 * Keys are real pde.* strings from lib/sidebarMenuLink.ts MENU_PERMISSIONS.
 * The learner lane is intentionally ungated — the universal instructional
 * baseline (like campus-living's resident lane).
 */
export const REQUIRES = {
  faculty: 'pde.faculty.view',
  admin: 'pde.admin.view',
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ──────────────────────────── LEARNER ──────────────────────────── */
    learner: {
      persona: 'learner',
      title: 'Learner Guide',
      tagline:
        "Log evidence of skills you've built, get a validator's feedback, and grow a verified transcript.",
      whyItMatters:
        'Exams show what you memorised; PDE shows what you can actually do. Every demonstration a faculty member validates becomes part of a transcript employers and accreditors trust — the record of your real, durable skills, owned by you.',
      startHere: { label: 'Go to My Demonstrations', href: '/pde/learn/demonstrations' },
      journey: [
        'Log evidence of a skill you can show',
        'A validator reviews it — they validate, score, ask for changes, or reject',
        'Read your score and feedback',
        'See how you compare to your cohort',
        'Print your verified transcript',
      ],
      sections: [
        {
          id: 'log-first-skill',
          title: 'Log your first skill',
          steps: [
            {
              action: 'Open **My Demonstrations** — your hub for every skill you submit.',
              detail:
                'Drafts, submitted work, scores, and validator feedback all live here.',
              prerequisite:
                "Your programme must have PDE switched on. If you don't see **PDE** in the menu, ask your department coordinator to enable it for your class.",
              platforms: {
                web: 'Left sidebar → **PDE** → **Learner** → **My Demonstrations**.',
                mobile: 'Tap the menu (**☰**) at the top, then **PDE → My Demonstrations** — PDE lives in the side menu, not the bottom bar.',
              },
              link: { label: 'Take me there', href: '/pde/learn/demonstrations' },
            },
            {
              action: 'Click **New demonstration** to capture a skill.',
              detail:
                'Evidence can be a video, an OSCE score, a written write-up, a GitHub repo, a simulator pass, or an external credential.',
              tip: 'First pick which of the seven durable-value categories the skill fits: Judgment, Embodied Practice, Problem Finding, Accountability, Social & Leadership, Cultural & Civic, or Credential.',
              image: {
                src: '/pde/guides/learner-new-demonstration.png',
                alt: 'My Demonstrations page with the New demonstration button highlighted at the top right.',
                width: 1440,
                height: 900,
                highlight: { x: 84, y: 35, width: 13, height: 4, label: 'New demonstration' },
              },
              link: { label: 'Take me there', href: '/pde/learn/demonstrations/new' },
            },
            {
              action: 'Pick your **skill category** from the dropdown.',
              detail:
                'Each category shows a hint. Judgment is decisions under uncertainty; Embodied Practice is hands-on clinical or technical skill.',
            },
            {
              action: 'Name the skill and say what kind of evidence you have.',
              detail:
                "For example: 'Venipuncture on a moving patient' (Embodied), 'Pneumonia from a chest X-ray' (Judgment), or 'Led a community health camp' (Social & Leadership).",
              tip: 'If the skill came from a course, use the curriculum link to tag it to course outcomes — that tells faculty where it fits.',
            },
            {
              action: 'Add a link to your evidence and any notes.',
              detail:
                'Paste a video/Drive link, upload a document to Drive and paste the link, screenshot a simulator pass, or attach a credential PDF.',
            },
            {
              action: 'Choose **Save as draft** or **Submit for review**.',
              detail:
                'A draft stays private and editable. Submitting sends it to a validator, who will score, validate, reject, or ask for a revision.',
            },
          ],
        },
        {
          id: 'track-status',
          title: 'Track your evidence',
          steps: [
            {
              action: 'Return to **My Demonstrations** to watch each skill move through review.',
              detail:
                'Each card carries a status: Draft, Submitted, Under Review, Validated, Scored, Rejected, or Withdrawn.',
              link: { label: 'Take me there', href: '/pde/learn/demonstrations' },
            },
            {
              action: 'Read the **status badge** and score on each card.',
              detail:
                'Once a skill is Scored you see a score out of 100 — higher is better (around 50 meets the starting bar). The card also shows the category, evidence type, and any validator note.',
              tip: "When a validator leaves feedback it appears in a green box. Use 'Thank your validator' to let them know it landed.",
            },
            {
              action: 'If a skill is rejected or needs changes, read the feedback and resubmit.',
              detail:
                "You can withdraw a draft or submitted skill anytime — it isn't deleted, just marked withdrawn.",
            },
          ],
        },
        {
          id: 'compare-cohort',
          title: 'Compare to your cohort',
          steps: [
            {
              action: 'Open **Cohort Comparison** to see how your scores stack up.',
              detail:
                'For each of the seven categories you see your best score, the cohort average, and your percentile rank.',
              tip: 'No demonstrations yet? You will see an empty state — submit your first skill and come back.',
              link: { label: 'Take me there', href: '/pde/learn/cohort' },
            },
            {
              action: 'Read the tier label: Below benchmark, Approaching, Meets, or Exceeds.',
              detail:
                'Out of 100: under 50 is Below benchmark, 50–70 Approaching, 70–90 Meets, 90+ Exceeds. Your faculty set the benchmark.',
            },
            {
              action: 'Use the chart to find your strong categories and where to focus next.',
              detail:
                "If the cohort average is 75 and you're at 60, that category is where more evidence helps most.",
            },
          ],
        },
        {
          id: 'build-transcript',
          title: 'Build your transcript',
          steps: [
            {
              action: 'Open **My PDE Transcript** — a formal, print-ready record of your verified skills.',
              detail:
                'It is NAAC/NBA-ready: every validated and scored demonstration, your category totals, and your agency index (how much independent judgment you showed).',
              tip: 'Only validated or scored demonstrations appear — drafts and rejected ones do not.',
              link: { label: 'Take me there', href: '/pde/learn/transcript' },
            },
            {
              action: 'Print it to PDF (Cmd+P / Ctrl+P) and save it.',
              detail:
                'Share it with employers, for further study, or for an accreditation audit — formal proof you own these skills.',
            },
          ],
        },
      ],
    },

    /* ──────────────────────────── FACULTY ──────────────────────────── */
    faculty: {
      persona: 'faculty',
      title: 'Faculty Guide',
      tagline:
        'Validate learner demonstrations, author cases and quests, and watch your cohort grow.',
      whyItMatters:
        "Your job is to confirm learners are building durable skills, not just passing tests. When you validate within the 7-day window and leave a specific note, learners iterate faster and trust the process — the single biggest lever on whether PDE takes hold in your group.",
      requires: REQUIRES.faculty,
      startHere: { label: 'Go to Dashboard', href: '/pde/faculty/dashboard' },
      journey: [
        'Spot at-risk learners and aging reviews on your dashboard',
        'Clear the validation inbox',
        'Author clinical cases and watch quests',
        'Run assessments',
        'Read analytics and adjust your coaching',
      ],
      sections: [
        {
          id: 'dashboard',
          title: 'Dashboard: the big picture',
          steps: [
            {
              action: 'Open your **Faculty Impact Dashboard** for at-a-glance metrics.',
              detail:
                'Enrolled learners, who is active this week, completion rates, and engagement scores.',
              prerequisite:
                'You need the **PDE faculty (validator) role**. If this page is blocked, ask your administrator to grant it.',
              link: { label: 'Go to Dashboard', href: '/pde/faculty/dashboard' },
            },
            {
              action: 'Scan the tabs: Quests, Capabilities, Agency, Assessments, At-Risk, Impact.',
              detail: 'Start with At-Risk if you need to prioritise who to reach today.',
            },
            {
              action: 'Check **At-Risk Learners** for critical, warning, or struggling students.',
              detail: 'You see days inactive, average score, and risk level.',
              tip: 'Critical learners need contact within 2–3 days; over 7 days inactive usually means they have disengaged.',
            },
            {
              action: 'Read the **Agency Index** spread to find dependent learners.',
              detail:
                'Learners at the Dependent level need scaffolding to build independence; the trend line shows whether agency is rising.',
            },
          ],
        },
        {
          id: 'validate',
          title: 'Validate learner evidence',
          steps: [
            {
              action: 'Open **Demonstrations** to see pending learner submissions, oldest first.',
              detail: 'Learners log evidence of a skill; you review, approve, or ask for changes.',
              link: { label: 'Go to Demonstrations', href: '/pde/faculty/demonstrations' },
            },
            {
              action: 'Filter by **capability category** (Technical, Analytical, Creative, and more) to focus on one skill area.',
              detail:
                'This inbox filters by capability category — a different lens from the seven durable-value categories a learner picks when submitting.',
            },
            {
              action: 'Watch the **pending review** count and clear it within the 7-day SLA.',
              tip: 'Past 7 days, learners lose momentum and may abandon the effort. Even a quick "needs one more thing" reply keeps them engaged.',
            },
            {
              action: 'Click **View** on a demonstration to read the evidence, then **Approve** or **Revise**.',
              detail:
                "Approving counts it toward the learner's transcript. A revision request should be specific: name what is missing or unclear.",
            },
          ],
        },
        {
          id: 'cases',
          title: 'Clinical cases: AI-coached practice',
          steps: [
            {
              action: 'Open **Clinical Cases** to manage your case library.',
              detail:
                'A case is a scenario where learners answer questions and get AI coaching feedback, then iterate — how you inject real decision-making into the curriculum.',
              link: { label: 'Go to Clinical Cases', href: '/pde/faculty/cases' },
            },
            {
              action: 'Click **New Case** and choose the Form Builder or Paste JSON.',
              detail:
                'Form Builder is visual and step-by-step; Paste JSON is for an existing template.',
              tip: 'Pick one path and stay in it — switching between Builder and JSON can lose unsaved work.',
              link: { label: 'Create a new case', href: '/pde/faculty/cases/new' },
            },
            {
              action: 'Fill in the scenario and add questions step by step.',
              detail:
                'Multiple-choice, open-ended, or image-region questions. Each question can carry a coaching prompt the AI uses to give guiding (Socratic) feedback.',
            },
            {
              action: 'Save as a draft, then **Preview** to walk it as a learner would.',
              detail: 'Nothing is recorded in preview — use it to catch clunky wording or flow issues.',
              link: { label: 'Open Clinical Cases', href: '/pde/faculty/cases' },
            },
            {
              action: 'Publish when ready, then check the **Cohort** view to see how learners did.',
              detail:
                'You see attempt counts and OSCE domain scores (data gathering, hypothesis, management, communication, professionalism), with per-learner drill-downs.',
            },
          ],
        },
        {
          id: 'quests',
          title: 'Quests: real-world projects',
          steps: [
            {
              action: 'Open **Quests** to see what your learners are building.',
              detail:
                'A quest is a bigger project — an app, a protocol, a research analysis — run over a week or a term.',
              link: { label: 'Go to Quests', href: '/pde/faculty/quests' },
            },
            {
              action: 'Use the status filter (Open / In Progress / Completed) and scan Enrolled vs Submissions.',
              detail: 'If enrolled is higher than submissions, some learners have not turned in work yet.',
            },
            {
              action: 'Click **Review** to open a quest, read submissions, and leave feedback.',
              tip: 'Mark a quest completed when its learning arc is done. NIF-eligible quests can feed accreditation and placement signals.',
            },
          ],
        },
        {
          id: 'assessments',
          title: 'Assessments',
          steps: [
            {
              action: 'Open **Assessments** and pick a course to see its tests.',
              detail: 'Assessments are quizzes and exams mapped to a course, each with a pass threshold.',
              link: { label: 'Go to Assessments', href: '/pde/faculty/assessments' },
            },
            {
              action: 'Create or edit an assessment, and watch the pass rate.',
              detail:
                'A low pass rate often means a poorly worded question or learners who need more prep. Inactive assessments stay hidden from learners until you flip them Active.',
            },
          ],
        },
        {
          id: 'analytics',
          title: 'Analytics: read and adjust',
          steps: [
            {
              action: 'Open **Analytics** and pick a course (or all courses).',
              detail: 'Engagement trend, completion rates, Fink dimensions, and top / at-risk performers.',
              link: { label: 'Go to Analytics', href: '/pde/faculty/analytics' },
            },
            {
              action: 'Read the **Fink dimensions** tab to balance the kind of learning happening.',
              detail:
                "Shown as the Fink's Dimensions tab, it maps assessment performance to the six dimensions of significant learning. If Knowledge is high but Human Dimension is low, learners know facts but are not connecting them.",
            },
            {
              action: 'Use **Export CSV** to pull data for reports or curriculum reviews.',
              detail: 'Useful for accreditation, grade submission, or a deeper look in a spreadsheet.',
            },
          ],
        },
      ],
    },

    /* ──────────────────────────── ADMIN ──────────────────────────── */
    admin: {
      persona: 'admin',
      title: 'Admin Guide',
      tagline:
        'Set the rules, run the validation loop, watch outcomes, and produce accreditation evidence.',
      whyItMatters:
        'You control the rules and the feedback loop that turn learner work into durable skills on a transcript. How you value skills (rubrics, scoring), what counts (quests, assessments), who validates, and whether targets are hit — all ripple into grades, employer signals, and accreditation evidence.',
      requires: REQUIRES.admin,
      startHere: { label: 'Go to Capabilities', href: '/pde/admin/capabilities' },
      journey: [
        'Define the skills, rubrics, scoring rules, and policies',
        'Build the quests and assessments learners use',
        'Run the validation loop',
        'Watch engagement, risk, and per-college compliance',
        'Produce accreditation evidence and placement signals',
      ],
      sections: [
        {
          id: 'foundations',
          title: '1. Configure the foundations',
          steps: [
            {
              action: 'Define the **skill tree** in Capabilities.',
              detail:
                'Capabilities are the skills learners demonstrate. Add each with a name, capability category (AI Fluency, Domain AI, Technical, and so on), level (1–5), and whether it is core or elective.',
              prerequisite:
                'You need **PDE admin access** (Super Admin, IQAC, or a lifecycle lead) for this page. Note: the **policy editors and rubrics in this section are super-admin (Director) only** — if one is blocked, that is why; ask your platform admin.',
              link: { label: 'Capability Management', href: '/pde/admin/capabilities' },
            },
            {
              action: 'Set **scoring and integrity rules** in the Scoring & Integrity policy.',
              detail:
                'How raw scores become weighted scores, peer-bias thresholds, and the validation SLA target. The editor shows when each change takes effect.',
              link: { label: 'Scoring & Integrity Policy', href: '/pde/admin/policies/scoring' },
            },
            {
              action: 'Set **rollout and compliance targets** in the Rollout & Compliance policy.',
              detail:
                'Per-college category targets, coordinator onboarding pace, and HOD escalation thresholds.',
              link: { label: 'Rollout & Compliance Policy', href: '/pde/admin/policies/rollout' },
            },
            {
              action: 'Set **visibility rules** in the Visibility & Transparency policy.',
              detail:
                'What learners see about their own scores, when the Agency Index appears, and how much cohort comparison shows.',
              link: { label: 'Visibility & Transparency Policy', href: '/pde/admin/policies/visibility' },
            },
            {
              action: 'Set **quest sourcing rules** in the Quests & Supply policy.',
              detail:
                'Which sources (internal, industry, community) may propose quests, risk tiers, and contributor terms.',
              link: { label: 'Quests & Supply Policy', href: '/pde/admin/policies/quests' },
            },
            {
              action: 'Set **gamification defenses and placement rules** in the Gamification & Defense policy.',
              detail:
                'Gaming-defense thresholds, 360-feedback anonymity, placement-signal behaviour, and framework branding. (The screen is titled "Gamification & Defense"; its URL says governance.)',
              link: { label: 'Gamification & Defense Policy', href: '/pde/admin/policies/governance' },
            },
            {
              action: 'Set **clinical-reasoning rules** in the Clinical Reasoning policy.',
              detail:
                'The policy behind AI-coached clinical-case practice (used by health programmes) — how cases are scored and coached.',
              link: { label: 'Clinical Reasoning Policy', href: '/pde/admin/policies/clinical-reasoning' },
            },
            {
              action: 'Define the scoring **Rubrics** — what earns a score in each durable-value category.',
              detail:
                'Rubrics are the criteria and weights a validator scores against, with a separate editor per category (Cultural & Civic, Embodied Practice, Social & Leadership). This is the OTHER half of scoring: the Scoring policy decides how raw scores combine; the rubrics decide what earns them. Don\'t set scoring rules without setting these.',
              link: { label: 'Rubrics', href: '/pde/admin/rubrics' },
            },
            {
              action: 'Connect external tools via **LTI** integration.',
              detail:
                'Register an LTI 1.3 tool (name, launch URL, client ID) so an external learning platform can launch into PDE.',
              link: { label: 'LTI Integration', href: '/pde/admin/lti' },
            },
          ],
        },
        {
          id: 'content',
          title: '2. Build quests and assessments',
          steps: [
            {
              action: 'Create **quests** learners tackle for reputation points.',
              detail:
                'A quest is a real-world problem (solo, team, community, or industry). Set title, type, difficulty, points, time estimate, and description. Save as Draft, then publish to Open.',
              link: { label: 'Quest Management', href: '/pde/admin/quests' },
            },
            {
              action: 'Create **assessments** linked to courses.',
              detail:
                'Quizzes and portfolio entries with a pass threshold, attempt limit, and a Fink dimension per question.',
              link: { label: 'Assessment Management', href: '/pde/admin/assessments' },
            },
            {
              action: 'Approve **proposed quests** from industry, students, or community.',
              detail: 'In Quest Supply, review pending quests and Approve to make them Active so learners see them.',
              link: { label: 'Quest Supply', href: '/pde/admin/quest-supply' },
            },
          ],
        },
        {
          id: 'validation-loop',
          title: '3. Run the validation loop',
          steps: [
            {
              action: 'Open the **Demonstrations inbox** — pending learner work, oldest first.',
              detail:
                'Each row shows submission date, age with an SLA indicator, category, and the skill claimed.',
              tip: 'Watch the SLA badge: green = within SLA, amber = approaching, red = overdue. Aim to acknowledge within the window (default 7 days).',
              link: { label: 'Demonstrations Inbox', href: '/pde/admin/demonstrations' },
            },
            {
              action: 'Click **Validate** to record your review.',
              detail:
                'Read the evidence, write notes (which may be moderated for anonymity), and assign a raw score. The engine applies peer-bias detection and weighting; your feedback reaches the learner under the identity rules.',
              tip: 'Be specific: what was strong, what could be stronger? That guides the next attempt.',
            },
            {
              action: 'Clear the **Feedback Moderation** queue when notes are flagged.',
              detail:
                'Depending on the identity policy (fully anonymous, anonymised, or identified), some notes await an identity or sensitivity check. Approve, redact, or reject each.',
              link: { label: 'Feedback Moderation', href: '/pde/admin/feedback-moderation' },
            },
          ],
        },
        {
          id: 'oversight',
          title: '4. Watch engagement and compliance',
          steps: [
            {
              action: 'View **engagement metrics** across courses to catch disengagement early.',
              detail:
                'Active learners, average time, engagement scores, and a live feed of recent actions. Filter by course.',
              link: { label: 'Engagement Dashboard', href: '/pde/admin/engagement' },
            },
            {
              action: 'Check **at-risk learners** by inactivity, low scores, or low engagement.',
              detail:
                'Flagged Critical (7+ days inactive), Warning (3–7 days), or Struggling (avg below 50%). Click a learner for details.',
              tip: 'Use this to trigger early outreach, pacing changes, or extra support.',
              link: { label: 'At-Risk Learners', href: '/pde/admin/at-risk' },
            },
            {
              action: 'Review **per-college compliance** against your category targets.',
              detail:
                'The matrix shows each college’s pass rate per durable-value category versus target. Red cells are below target. The **Compliance** hub above it gives the institution-wide overview.',
              link: { label: 'Per-College Compliance', href: '/pde/admin/compliance/per-college' },
            },
            {
              action: 'Monitor the **KPI dashboard** for adoption.',
              detail:
                'The headline metric is the coordinator active-use ratio — the share of coordinators onboarded in the last 90 days who are actually logging in and validating, not just registered. Target is 60%.',
              tip: 'Lagging adoption usually means onboarding friction or an engagement barrier to address in policy or outreach.',
              link: { label: 'KPI Dashboard', href: '/pde/admin/kpi' },
            },
            {
              action: 'View **cohort comparison** for institution-wide patterns.',
              detail: 'A heatmap of institution × category strength, to spot where to send support.',
              link: { label: 'Cohort Comparison', href: '/pde/admin/cohort' },
            },
          ],
        },
        {
          id: 'evidence',
          title: '5. Evidence and placement signals',
          steps: [
            {
              action: 'Open **Accreditation Evidence** by body (NAAC and others).',
              detail:
                'PDE demonstrations grouped by category and mapped to syllabus outcomes — the feed for your accreditation dossier.',
              link: { label: 'Accreditation Evidence', href: '/pde/admin/accreditation-evidence' },
            },
            {
              action: 'Review **BoS evidence** for each course under review.',
              detail:
                'The demonstrations captured for a course and how they map to its learning outcomes — proof of durable-skill attainment for the Board of Studies report.',
              link: { label: 'BoS PDE Evidence', href: '/pde/admin/bos-evidence' },
            },
            {
              action: 'Open a learner’s **Transcript** to see their validated, print-ready record.',
              detail:
                'The admin view of any learner’s formal transcript of validated and scored skills — the NAAC/NBA-ready proof for employers, further study, or audits.',
              link: { label: 'Admin Transcript', href: '/pde/admin/transcript' },
            },
            {
              action: 'Trigger **placement signals** for learners past the threshold.',
              detail:
                'Learners with passed demonstrations in 3+ categories become eligible for employer briefings. Review the list and brief partners, or keep it dashboard-only per policy.',
              link: { label: 'Placement Signals', href: '/pde/admin/placement-signals' },
            },
            {
              action: 'Run the **legacy bridge** once to migrate old achievements.',
              detail:
                'Map legacy certificates and passed quests onto the new seven-category substrate.',
              tip: 'Dry-run first to see what would change before you commit.',
              link: { label: 'Legacy Bridge', href: '/pde/admin/bridge' },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    ['Demonstration', 'Evidence of a durable skill — a video, score, document, or artifact that shows what someone can actually do. The core unit of PDE.'],
    ['Durable-value category', 'One of seven skill areas that matter beyond exams: Judgment, Embodied Practice, Problem Finding, Accountability, Social & Leadership, Cultural & Civic, and Credential. Learners pick one when they submit.'],
    ['Capability', 'A named skill in the skill tree (e.g. Prompt Engineering). Each is filed under a capability category and rolls up into the durable-value categories used for compliance.'],
    ['Capability category', 'The taxonomy used by the skill tree and the faculty demonstrations filter (Technical, Analytical, Creative, AI Fluency, Domain AI…). Note: this is a different lens from the seven durable-value categories a learner picks at submission.'],
    ['Validation', 'A validator reviewing a demonstration, confirming it is real and meets the bar, and assigning a score. Only validated or scored work reaches the transcript.'],
    ['Validator', 'A faculty member, supervisor, or trained peer who reviews and scores demonstrations and leaves feedback.'],
    ['Status', 'Where a demonstration is: Draft, Submitted, Under Review, Validated, Scored, Rejected, or Withdrawn.'],
    ['Rubric', 'A scoring guide that lists what counts as meeting the bar for a skill. A validator may use one when scoring.'],
    ['OSCE', 'Objective Structured Clinical Examination — a hands-on practical exam (common in health programs) where you are scored at stations performing real clinical tasks.'],
    ['Cohort', 'The group of learners being evaluated alongside you. Cohort Comparison shows how your scores compare.'],
    ['Percentile', 'Your rank within your cohort — 80th percentile means you are ahead of 80% of peers in that area.'],
    ['Benchmark', 'The minimum score faculty decide counts as good enough for a category — the line between Below benchmark and Approaching.'],
    ['Agency Index', 'A measure of how much independent judgment a learner shows across their demonstrations. Levels run Dependent → Guided → Collaborative → Self-Directed → Principal; higher is the goal.'],
    ['Transcript', 'A formal, print-ready record of validated and scored skills — NAAC/NBA-ready proof for employers, further study, or audits.'],
    ['Attainment', 'The result of a passed demonstration: the learner is recorded as having earned a capability in a category.'],
    ['Clinical Case', 'A scenario where a learner answers questions, gets AI coaching feedback, and iterates — used to train diagnostic or decision-making thinking.'],
    ['Quest', 'A larger real-world project (an app, an experiment, a protocol) run over days or weeks, then submitted for assessment.'],
    ['At-Risk', 'A learner flagged Critical (7+ days inactive), Warning (3–7 days), or Struggling (avg below 50%) — a prompt to intervene.'],
    ['SLA', 'Service Level Agreement — the expected turnaround for validation. The standard is 7 days; 48 hours is the gold standard.'],
    ["Fink's dimensions", 'The six dimensions of significant learning (Foundational Knowledge, Application, Integration, Human Dimension, Caring, Learning How to Learn) that assessments map to, to keep skill development balanced.'],
    ['NIF', 'National Innovation Forum — a quest or demonstration that meets innovation/accreditation standards can feed placement signals or recognition.'],
    ['BoS', 'Board of Studies — the committee that oversees course design and outcomes. PDE evidence feeds its compliance reports.'],
    ['Accreditation Evidence', 'PDE demonstrations aggregated by category and outcome to document compliance with standards like NAAC.'],
    ['Placement Signal', 'A flag that a learner has passed demonstrations in 3+ categories and is ready for an employer briefing.'],
    ['Policy', 'A system rule (scoring, visibility, rollout, gamification, quest sourcing) set in the policy editors. The editor shows when a change takes effect.'],
    ['Coordinator', 'The institutional point person who onboards learners and drives PDE adoption. The KPI tracks their active-use ratio.'],
  ].map(([term, def]) => ({ term, def })),

  plannedLocaleNote: 'A Tamil version is planned — English only for now.',
};
