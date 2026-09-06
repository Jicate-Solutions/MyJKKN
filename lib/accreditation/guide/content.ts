/**
 * Accreditation & Compliance — Smart Guide content (PURE DATA, no I/O, no JSX).
 *
 * Every /accreditation/* route fell to the generic platform-overview lane: a
 * coordinator standing on the NAAC page got zero module-specific help. This is
 * that module's contribution.
 *
 * FIVE SECTION GROUPS, each gated by a key that exists verbatim in
 * lib/sidebarMenuLink.ts MENU_PERMISSIONS, so a viewer sees only the part they
 * can actually open (fail-closed):
 *
 *   orientationSections  accreditation.view                    what these pages are
 *   cacSections          accreditation.cac.view                the cluster's own council
 *   ownerSections        accreditation.naac.narrative.view     named as an owner
 *   frameworkSections    accreditation.metrics.view            read the whole framework
 *   assignSections       accreditation.naac.narrative.manage   the IQAC owner desk
 *
 * The registry (lib/guide/registry.ts) contributes ALL FIVE groups to every
 * canonical lane an accreditation reader can resolve to — supervisor (HOD /
 * principal), coordinator (IQAC coordinator), module-admin (catalog keeper) and
 * external (the accreditation_officer / external auditor role keys). Same
 * cross-cutting shape as the audit module: the holders span several primary
 * personas, so the content cannot live in one lane alone.
 *
 * VOICE: written for a department head or a department clerk who has just been
 * named an owner and does not know what NAAC is. Plain sentences, no assessor
 * vocabulary without a one-line gloss.
 *
 * ACCURACY NOTES (read from production code on 2026-08-02, not assumed):
 *   - accreditation_metric_owners had NO accept/pending column when the four
 *     original groups were written, so ownerSections describes only the DRAFT
 *     chain: the draft sits at status 'ai_drafted' ("Awaiting owner okay") until
 *     the owner okays it.
 *     CORRECTION, 2026-08-13 — that is no longer the whole picture. Migration
 *     20260809100000 added `assignment_status` ('pending' | 'confirmed' |
 *     'declined') plus `acknowledged_at`, under a CHECK that keeps the two
 *     inseparable, so an ASSIGNMENT now also waits for the named person to
 *     confirm it (Director decision 8, 2026-08-01 — accountability accepted,
 *     not imposed). cacSections below describes that confirm step because it is
 *     live; ownerSections still describes only the draft chain, and bringing the
 *     rest of it up to date is a separate change to a group this PR does not own.
 *   - A metric with nobody named against it routes to the shared IQAC queue
 *     instead of to a person. The guide says THAT, and tells the reader who to
 *     ask — it no longer says how many such metrics there are, in either
 *     direction. See the "NO STATE CLAIM" note above cacSections: a sentence
 *     about how full the owner table is went stale in eleven days, and the same
 *     wording in ownerSections was corrected with it.
 *   - No live counts are hard-coded anywhere here, and neither is any claim
 *     about a table being empty or full — those are counts with the digits
 *     filed off, and they rot at the same speed. Coverage numbers move nightly
 *     as the emitters run. Every "how many" question points at the page that
 *     answers it live.
 *   - /accreditation/coverage carries its own key (accreditation.coverage.view),
 *     so the step that links it names that as a prerequisite. Blocked pages here
 *     render an explicit "you do not have permission" panel, never a silent
 *     bounce, so a wrong-key click is self-explaining.
 */
import type { GlossaryTerm, GuideLink, GuideSection } from "@/lib/guide/types";

/**
 * Permission keys that unlock each section group. OPAQUE — never split or parse
 * them. Every value below appears verbatim in lib/sidebarMenuLink.ts
 * MENU_PERMISSIONS and in lib/constants/permissions.ts.
 */
export const REQUIRES = {
  /** Anyone who can open the accreditation hub at all. */
  overview: "accreditation.view",
  /**
   * The Cluster Academic Council page — JKKN's own body, not a regulator, and
   * the only entry in that row that awards nothing and submits nothing.
   */
  cac: "accreditation.cac.view",
  /** A named metric owner reading the draft that carries their name. */
  owner: "accreditation.naac.narrative.view",
  /** Reading the whole 10-body framework and the metric catalog. */
  framework: "accreditation.metrics.view",
  /** The IQAC coordinator who records who owns what. */
  assign: "accreditation.naac.narrative.manage",
} as const;

/* ── A. Orientation — what these pages are (accreditation.view) ───────────── */
export const orientationSections: GuideSection[] = [
  {
    id: "what-this-is",
    title: "What these pages are",
    steps: [
      {
        action: "Open the **Accreditation hub** to see the ten awarding bodies as ten cards.",
        detail:
          "An awarding body is an outside organisation that inspects, approves or ranks a college. JKKN answers to ten of them. One card each, so you can see the whole obligation at a glance.",
        link: { label: "Open the accreditation hub", href: "/accreditation" },
      },
      {
        action: "Read the ten names once — you only need the one-line version.",
        detail:
          "**NAAC** rates the whole college. **UGC** is the overall regulator for rules, grants and affiliation. **NIRF** is the Ministry of Education’s annual ranking. **QS** is a world ranking JKKN aims at later. **NBA** accredits one programme at a time on the engineering and technical side. **AICTE** renews approval every year for technical programmes. **NCTE** approves the programmes that prepare new Senior Learners, at JKKN College of Education. **DCI**, **PCI** and **INC** inspect the Dental, Pharmacy and Nursing colleges each year.",
        tip: "You are never asked to know all ten. You are asked about the one or two that touch your department.",
      },
      {
        action: "Know that **IQAC is ours, not theirs**.",
        detail:
          "IQAC stands for Internal Quality Assurance Cell. It is JKKN’s own cell — colleagues in this institution — not an outside inspector visiting. Its page reads the whole framework as one list so the cell can see what it is accountable for.",
        link: { label: "Open the IQAC page", href: "/accreditation/iqac" },
        tip: "The Cluster Academic Council (CAC) sits in the same menu and is also JKKN’s own body, not a regulator.",
      },
      {
        action: "Notice what these pages do **not** do.",
        detail:
          "Nothing on them is submitted to any awarding body, and no result is calculated. They show what the platform can answer from records it already holds, and what it cannot answer yet.",
      },
    ],
  },
  {
    id: "where-evidence-comes-from",
    title: "Where the evidence comes from",
    steps: [
      {
        action: "Understand the one rule: **evidence is emitted from everyday work**, not typed into a form.",
        detail:
          "There is no accreditation data-entry screen where somebody re-types the year. When a grievance is resolved, an IQAC meeting is recorded, an event is run and rated, or the assessment results come back from the university, the platform writes the matching evidence row by itself, overnight.",
        link: { label: "Open the accreditation hub", href: "/accreditation" },
      },
      {
        action: "Keep doing your normal work in its normal module — that is the collection step.",
        detail:
          "Resolve grievances in the grievance register. Record IQAC sittings and their resolutions in the committees pages. Run events and collect feedback in the events module. Keep HR records current. Each of those already feeds a metric.",
        link: { label: "Open the grievance register", href: "/accreditation/naac/grievance" },
      },
      {
        action: "Enter the few things nothing else can produce — the meter readings.",
        detail:
          "A handful of facts have no everyday source, so they have a small entry screen of their own. Monthly electricity, water, waste and solar readings are the main one: one campus, one month, four numbers.",
        link: { label: "Open the monthly meter readings", href: "/accreditation/manage/utility-readings" },
        tip: "Leaving a box empty is not the same as entering 0. Empty means the meter was not read; 0 means nothing was used. The screen keeps them apart on purpose.",
      },
      {
        action: "Expect a delay of about a day, not an instant update.",
        detail:
          "The emitters run overnight. Work you finish today shows up as evidence tomorrow, so do not re-enter something because it has not appeared yet.",
      },
    ],
  },
  {
    id: "not-captured-yet",
    title: "Reading “not captured yet” correctly",
    steps: [
      {
        action: "When a metric reads **not captured yet**, read it as “nobody has collected this”.",
        detail:
          "It does not mean the answer is zero, and it is not a statement about how JKKN performs. It means the platform has no source wired up for that question yet.",
        link: { label: "See what is answerable today", href: "/accreditation/iqac" },
      },
      {
        action: "Expect most of the framework to say that today.",
        detail:
          "Only part of the framework has a live source behind it so far. That is honest by design — a metric with no source is shown as not captured rather than filled with a made-up figure.",
      },
      {
        action: "If a metric that belongs to your department says **not captured yet**, tell your IQAC coordinator.",
        detail:
          "It usually means the everyday record that would answer it lives outside the platform, or lives in the platform but is not wired to that metric yet. Naming it is what gets it queued.",
      },
    ],
  },
];

/* ── B. CAC — the cluster's own council (accreditation.cac.view) ───────────
 *
 * The one entry in the accreditation row that is NOT an outside authority, and
 * the only one a reader is likely to misread on sight: it sits beside ten
 * regulators, so the default assumption is that it is an eleventh. Everything
 * below exists to break that assumption first and only then explain the page.
 *
 * Three facts here were read from production rather than assumed:
 *   - the page's totals come from fn_cac_cluster_totals(), a SECURITY DEFINER
 *     function taking NO caller-supplied id, so every council member sees the
 *     same cluster-wide figure. Reading the underlying views directly returned
 *     the caller's own slice, which is the fault that function was added to fix.
 *   - ownership is recorded at BODY level by default. A row of
 *     accreditation_metric_owners with metric_code NULL makes one person
 *     accountable for that body's entire list in that college; a row that names
 *     a metric overrides the body owner for that one question. Every owner row
 *     live on 2026-08-13 is of the first kind. The copy below therefore teaches
 *     the body-level record as the ordinary case and the per-metric row as an
 *     escalation (Director, 2026-08-13, R3) — a reader must not come away
 *     believing the framework has to be filled in question by question.
 *   - an assignment now waits for the named person to confirm — see the
 *     correction in the ACCURACY NOTES above. There is no "Fix this" deep link
 *     to send a reader to, because the columns behind it are not in the database
 *     yet, so nothing here promises one.
 *
 * NO STATE CLAIM ABOUT THE DESK — the mistake this group already made once.
 * An earlier draft told the reader to "expect the desk to be empty today", and a
 * test pinned that string so it could not drift. It was true when written and
 * false eleven days later: owner rows exist now. A sentence describing how full
 * a table is rots exactly as fast as a baked-in count — it is the same mistake in
 * different clothes, and the ACCURACY NOTES' own ban on hard-coded counts always
 * meant this too. The copy below says what an unowned metric MEANS and what
 * naming one DOES, and sends the reader to the desk to see which they have. That
 * wording is true at zero rows and at every number above it.
 *
 * WHO CAN NAME AN OWNER — and why the honest answer is not a list of roles.
 * user_has_permission() has FOUR paths, not three: the super-admin bypass, the
 * multi-role merge, the legacy profiles.role fallback, and finally
 * fn_handover_grants_key() (migration 20260811100100). The fourth is not a
 * footnote here — on 2026-08-13 the only person actually working this desk held
 * accreditation.naac.narrative.manage through an accepted Director handover on
 * /accreditation/manage/owners, holding no role that carries the key at all. So:
 *   by role      accreditation_officer already holds the manage key; ceo and
 *                managing_director gain it (with accreditation.cac.view and
 *                .narrative.view) by the Director's grant of 2026-08-13.
 *   by handover  a Director handover naming that key grants it to one named
 *                person for as long as the handover is live. Principals are
 *                DELIBERATELY excluded from the role grant (Director,
 *                2026-08-13, R1) and are handed the desk this way, individually.
 * Institution scope still decides reach and no wording here can change it: ceo /
 * managing_director / accreditation_officer are scope 'all'; a principal is
 * scope 'own', so a write outside their own college is refused by
 * role_has_institution_access(). The DATES are deliberately not in the copy — a
 * date in reader-facing text rots as loudly as a count and helps the reader less
 * than it helps us. They live here, where the next editor looks before changing
 * that sentence.
 * ────────────────────────────────────────────────────────────────────────── */
export const cacSections: GuideSection[] = [
  {
    id: "cac-what-it-is",
    title: "What the Cluster Academic Council is",
    steps: [
      {
        action: "Open the **Cluster Academic Council** and read the top card before anything else.",
        detail:
          "Every other entry in that row — NAAC, UGC, NIRF, QS, NBA, AICTE, NCTE, DCI, PCI, INC — is an outside authority that inspects JKKN and rates it. The council runs the other way round. It is how JKKN's own colleges and schools decide something once, so the decision holds everywhere instead of being argued again in each place.",
        link: { label: "Open the Cluster Academic Council", href: "/accreditation/cac" },
      },
      {
        action: "Tell the council apart from **IQAC** with one question: how many colleges have to move?",
        detail:
          "If one college can change the number on its own, it belongs to that college's IQAC. If the number only moves when two or more colleges act together, it is the council's. Both are JKKN's own bodies and neither is an inspector — they divide the work by reach, not by rank.",
        link: { label: "Open the IQAC page", href: "/accreditation/iqac" },
        tip: "Same menu row, opposite direction of travel. The ten bodies ask JKKN for an answer; the council decides something for JKKN.",
      },
      {
        action: "Expect no rating anywhere on the page — that is a decision, not an unfinished screen.",
        detail:
          "There is no total, no percentage and no ordering of colleges against one another, and nothing on the page is submitted to anybody outside. The council measures; it does not award.",
      },
    ],
  },
  {
    id: "cac-read-the-page",
    title: "How to read the council page",
    steps: [
      {
        action: "Read every total on the page as the **whole cluster's** figure, not your college's.",
        detail:
          "The numbers come from one database function that answers with the cluster's figure whoever asks. That is exactly why it exists: a council member must never be shown their own slice and told it is the cluster's.",
        link: { label: "Open the Cluster Academic Council", href: "/accreditation/cac" },
        tip: "This was a real fault before it was fixed. Read the underlying tables directly and you get only the rows you are allowed to see — which, for a member scoped to one college, is a fraction of the thing the council exists to look across.",
      },
      {
        action: "Read **not captured yet** as “nobody has collected this”, never as a zero.",
        detail:
          "It says the platform has no source wired to that question. It is not a measured result and it is not a comment on how any college performs. A metric with no source is shown as not captured rather than filled with an invented figure.",
      },
      {
        action: "Check the line saying when the overnight figure was last worked out.",
        detail:
          "Some numbers are recomputed by a nightly job rather than read live, so the page prints when that last ran and calls it out when it is more than a day old. A job that has quietly stopped otherwise looks exactly like one that is working.",
      },
      {
        action: "Keep central-office traffic apart from college-to-college.",
        detail:
          "The collaboration panel counts the two separately on purpose. Anything passing through JKKN Main Office is shared central provision, which is worth counting and is not colleges choosing each other. Only the college-to-college figure is that, and it is the smaller number.",
      },
      {
        action: "Print the **one-page brief** before the council sits.",
        detail:
          "One side of A4 carrying the same live figures as the page, plus how many metrics have somebody's name against them. It prints from the browser, and everything around it — menu, buttons, sidebar — is left off the paper.",
        link: { label: "Open the one-page brief", href: "/accreditation/cac/brief" },
      },
    ],
  },
  {
    id: "cac-name-an-owner",
    title: "Make one person accountable for a metric",
    steps: [
      {
        action: "Open the **owner desk** and name one person for a **whole awarding body** in one college — that is the normal way to do it.",
        detail:
          "Leave the metric box blank. That single record makes the person accountable for everything that body asks of that college, in one go. It is the ordinary unit of the job, not a shortcut for people in a hurry: for most colleges, one accountable name per body is the whole answer.",
        link: { label: "Open the owner desk", href: "/accreditation/manage/owners" },
        tip: "You are not expected to work down the framework question by question. A body at a time is the size the desk was built around.",
      },
      {
        action: "Name a **single metric** only when one person genuinely cannot carry the whole body.",
        detail:
          "Filling the metric box as well records a different person for that one question and leaves the rest of the body exactly where it was. It is for the handful of questions that sit with a particular office — the library figures, the finance figures — not the way in.",
      },
      {
        action: "Check you hold the key that lets you name **somebody else** — the desk opens wider than it writes.",
        detail:
          "Opening it, and answering an assignment addressed to you, needs only the view key. Naming another person needs the manage key too, and that is enforced by the database rather than by the screen, so a blocked write comes back as nothing saved.",
        prerequisite:
          "Naming an owner needs **accreditation.naac.narrative.manage**. Some people hold it through their role — the accreditation officer, the CEO and the Managing Director. A Principal is deliberately not given it by role, and is handed this desk individually by the Director instead: that handover carries the same key for as long as it runs. So if the desk shows you the list but saves nothing, that key is what you are missing, and the answer is to ask the Director for the page rather than to assume it is shut to you for good.",
        tip: "A handover is made from the Director's desk and runs to a date, so it is a loan of the page rather than a change to your role. Nobody can grant it to themselves — not even the person already holding the key.",
      },
      {
        action: "Read a metric with **no name against it** as work that belongs to nobody yet.",
        detail:
          "The desk lists every pair of college and metric whether or not anybody is accountable for it. An unnamed one is not a read that failed and not a mark against any person; it is a question with nobody to ask about it. Naming the body owner clears a whole column of them at once, which is why that is the cheapest move on the page.",
      },
      {
        action: "The person you name has to **confirm** it before it is settled.",
        detail:
          "A new assignment is recorded as waiting and stays waiting until they accept. They may also decline, and a refusal is left standing rather than quietly falling back to whoever owns the body — the point of asking is that the answer can be no.",
        tip: "Tell them yourself. The platform records the assignment; it does not chase anybody.",
      },
    ],
  },
  {
    id: "cac-nobody-can-answer",
    title: "When nobody can answer a metric yet",
    steps: [
      {
        action: "Do **not** put a number in to make the gap go away.",
        detail:
          "An invented figure is worse than a visible gap. It traces back to no record, and the drafting check downstream refuses to advance any claim the evidence cannot account for — so it fails later, in front of more people.",
      },
      {
        action: "Name the owner anyway, so the gap carries a name.",
        detail:
          "Ownership is a routing record, not a reward for already having the answer. Naming somebody for a question nobody can answer yet is exactly how it stops being nobody's problem.",
        link: { label: "Open the owner desk", href: "/accreditation/manage/owners" },
      },
      {
        action: "Point the person you named at their own list.",
        detail:
          "It shows only what they owe, where to do it and by when. Nobody else's workload appears on it, and there is no score and no ordering of people.",
        link: { label: "Open my gaps", href: "/accreditation/my-gaps" },
      },
      {
        action: "Fix the source, not the metric.",
        detail:
          "Accreditation has almost no data entry of its own. A number appears once the everyday record that answers it is being kept in whichever module already owns it. The main exception is the monthly meter readings, which have a small screen of their own.",
        link: {
          label: "Open the monthly meter readings",
          href: "/accreditation/manage/utility-readings",
        },
      },
    ],
  },
];

/* ── C. Owner — you have been named on a metric (narrative.view) ──────────── */
export const ownerSections: GuideSection[] = [
  {
    id: "named-an-owner",
    title: "You have been named an owner",
    steps: [
      {
        action: "Know what being an **owner** means: one metric, one college, your name on it.",
        detail:
          "IQAC records who owns each pair of college and metric. From then on, anything written about that metric routes to you by name instead of sitting in the shared IQAC queue. It is a routing record, not extra paperwork.",
        link: { label: "See the owner list", href: "/accreditation/naac/narratives/owners" },
      },
      {
        action: "If a metric is really yours and your name is **not** on it, ask — you cannot add yourself.",
        detail:
          "Anything with nobody named against it routes to the shared IQAC queue rather than to a person, so a metric that ought to be yours can sit there for weeks without ever reaching you. Ask your IQAC coordinator to record you against it.",
        prerequisite:
          "Only someone holding **accreditation.naac.narrative.manage** can record an owner. If the owner page is blocked for you, that is the reason, and it tells you so on the page.",
      },
      {
        action: "Nothing lands on you without warning — and nothing is sent anywhere on its own.",
        detail:
          "There is no automatic submission at any point. A draft waits for you, then for the Principal, then for the Director. Three different people, in that order, each one a deliberate click.",
      },
    ],
  },
  {
    id: "okay-the-draft",
    title: "Read and okay the draft that carries your name",
    steps: [
      {
        action: "Open **AI Narrative Drafts** and look at the **Awaiting owner okay** count.",
        detail:
          "That is your queue. Each row shows the metric, the college, the period, the workflow status and whether the draft passed its evidence check.",
        link: { label: "Open my draft queue", href: "/accreditation/naac/narratives" },
      },
      {
        action: "Open a row and read the draft **against the evidence it cites**.",
        detail:
          "Every figure in the prose must trace back to a real record the platform already holds. Your job is not to write it — it is to confirm that what it says is true of your department.",
      },
      {
        action: "If the draft is marked **ungrounded**, stop — you cannot advance it.",
        detail:
          "A red banner lists the figures the evidence cannot account for, and every advance button is withheld until they are gone. That block is deliberate: a claim nobody can back up must never reach an awarding body.",
        tip: "Ungrounded is usually a source problem, not a writing problem. Tell your IQAC coordinator which figure has nothing behind it.",
      },
      {
        action: "Edit the wording where it is wrong, then **okay** it.",
        detail:
          "You may rewrite the prose freely. Your edit is re-checked on the server before it advances, so a figure the evidence does not support cannot be typed in and okayed past the check.",
        prerequisite:
          "Editing and okaying needs **accreditation.naac.narrative.edit**. Viewing alone lets you read the draft but not advance it.",
      },
      {
        action: "After you okay it, watch it move on — Principal approves, then Director submits.",
        detail:
          "Your okay is the first of three signatures, not the last. The row’s status tells you where it has reached.",
        link: { label: "Back to the draft queue", href: "/accreditation/naac/narratives" },
      },
    ],
  },
];

/* ── D. Framework — read the whole thing (accreditation.metrics.view) ─────── */
export const frameworkSections: GuideSection[] = [
  {
    id: "read-the-framework",
    title: "Read the whole framework in one place",
    steps: [
      {
        action: "Open the **IQAC** page for every metric from all ten bodies at once.",
        detail:
          "The tabs beside it each show a single body’s slice. This page shows the whole framework, with how many metrics are answerable today and how many are not captured yet.",
        link: { label: "Open the IQAC framework", href: "/accreditation/iqac" },
      },
      {
        action: "Open the **metric catalog** when a metric is missing or worded wrongly.",
        detail:
          "The seeded metrics are system rows and cannot be deleted. What you can do is add a local one your college tracks in addition, and edit the ones you added.",
        link: { label: "Open the metric catalog", href: "/accreditation/manage/metrics" },
      },
      {
        action: "Open the **coverage matrix** to see it broken down by college.",
        detail:
          "One row per awarding body per college, so you can see which college is thin on which body rather than only the JKKN-wide picture.",
        prerequisite:
          "This page carries its own key, **accreditation.coverage.view**. If it is blocked, the page says so — ask for that key rather than assuming the page is broken.",
        link: { label: "Open the coverage matrix", href: "/accreditation/coverage" },
      },
    ],
  },
  {
    id: "collect-once-report-many",
    title: "Collect once, report many",
    steps: [
      {
        action: "Understand the whole point: **one record can answer several bodies at once**.",
        detail:
          "Bodies ask overlapping questions. Rather than collecting the same fact ten times in ten shapes, the platform stores it once and files it against every metric it satisfies.",
        link: { label: "Open the accreditation hub", href: "/accreditation" },
      },
      {
        action: "See it working on **learning-outcome attainment**.",
        detail:
          "Attainment is measured once from the assessment results the university declares. The same records are then filed as NAAC evidence and as NBA evidence at the same time — one measurement, two bodies, nobody re-typing anything.",
        link: { label: "Open the NBA dashboard", href: "/accreditation/nba" },
      },
      {
        action: "Check the live count on the page rather than trusting a number you were told.",
        detail:
          "The counts move every night as the emitters run. The hub and the coverage matrix show the current figure; anything quoted in a message or a slide is a snapshot of some earlier day.",
        link: { label: "Open the NIRF dashboard", href: "/accreditation/nirf" },
      },
    ],
  },
];

/* ── E. Assign — the IQAC owner desk (narrative.manage) ───────────────────── */
export const assignSections: GuideSection[] = [
  {
    id: "assign-the-owners",
    title: "Record who owns each metric",
    steps: [
      {
        action: "Open the **owner desk** and work down the list of college-and-metric pairs.",
        detail:
          "Pick a person for each pair. Owners are drawn from the Senior Learners, department heads and principals of that college.",
        link: { label: "Open the owner desk", href: "/accreditation/naac/narratives/owners" },
      },
      {
        action: "Assign **before** the first draft is written, not after.",
        detail:
          "A pair appears on this desk as soon as it has cited evidence — it does not wait for a draft. Naming the owner early is what lets the draft route to a real person instead of the shared queue.",
        tip: "A pair that already has an owner stays listed, so an assignment can never quietly disappear off this page.",
      },
      {
        action: "Tell the person you named — the platform will not chase them for you.",
        detail:
          "Ownership is a routing record. Someone who does not know they were named will not go looking for a queue.",
        link: { label: "See the draft queue", href: "/accreditation/naac/narratives" },
      },
    ],
  },
];

/** The single accreditation lane, before the registry re-keys it. */
export const GUIDES = {
  lanes: {
    iqac: {
      title: "Accreditation Guide",
      tagline:
        "Understand the ten awarding bodies, own a metric without becoming a specialist, and let everyday work supply the evidence.",
      whyItMatters:
        "Accreditation is not a form-filling season. It is a running record of what the institution already does — and the platform builds most of it from ordinary work. Your part is small and specific: confirm that what is written about your department is true.",
      startHere: { label: "Open the accreditation hub", href: "/accreditation" },
      journey: [
        "See the ten bodies",
        "Learn where evidence comes from",
        "Read “not captured yet” correctly",
        "Tell the cluster council from IQAC",
        "Find the metric you own",
        "Check the draft against its evidence",
        "Okay it and pass it on",
      ],
      sections: [
        ...orientationSections,
        ...cacSections,
        ...ownerSections,
        ...frameworkSections,
        ...assignSections,
      ],
    },
  },
  glossary: (
    [
      [
        "Awarding body",
        "An outside organisation that inspects, approves or ranks a college. JKKN answers to ten of them — NAAC, UGC, NIRF, QS, NBA, AICTE, NCTE, DCI, PCI and INC.",
      ],
      [
        "IQAC",
        "Internal Quality Assurance Cell — JKKN’s own cell, made of colleagues here. It is not an outside inspector. It reads the whole framework and decides who owns what.",
      ],
      [
        "CAC",
        "Cluster Academic Council — another of JKKN’s own bodies, not a regulator. It sits in the same menu as the ten awarding bodies but answers to the institution.",
      ],
      [
        "Metric",
        "One question an awarding body asks, with a code (for example 7.3.d). The framework is just a long list of these.",
      ],
      [
        "Evidence",
        "A real record that answers a metric — a resolved grievance, a recorded sitting, a meter reading, a declared result. Evidence is emitted from everyday work, not typed into an accreditation form.",
      ],
      [
        "Not captured yet",
        "Nobody has collected this. It is a statement about what has been wired up, NOT a score of zero and not a comment on how JKKN performs.",
      ],
      [
        "Owner",
        "The person recorded against one college-and-metric pair. Anything written about that metric routes to them by name instead of the shared IQAC queue.",
      ],
      [
        "Grounded / ungrounded",
        "A machine check on a draft. Grounded means every figure traces to a real record. Ungrounded means at least one does not — and an ungrounded draft cannot be advanced by anyone.",
      ],
      [
        "Collect once, report many",
        "Store a fact once and file it against every metric it satisfies. Attainment measured from declared results is filed for NAAC and NBA at the same time.",
      ],
      [
        "Awaiting owner okay",
        "The status of a draft that is written and waiting for its owner to read it. Nothing moves out of this state on its own.",
      ],
    ] as [string, string][]
  ).map(([term, def]): GlossaryTerm => ({ term, def })),
} satisfies {
  lanes: {
    iqac: {
      title: string;
      tagline: string;
      whyItMatters: string;
      startHere: GuideLink;
      journey: string[];
      sections: GuideSection[];
    };
  };
  glossary: GlossaryTerm[];
};
