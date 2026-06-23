/**
 * VAC (Value-Added Courses) Smart Guide — authored content (the actual product).
 *
 * Two persona lanes in plain 12th-grade language, authored from the module's
 * REAL routes under app/(routes)/vac/*. Every step that happens on a page
 * carries a "Take me there" deep-link. Permission gating uses the shared
 * REQUIRES keys below (the same keys the sidebar/route guard enforces, so a
 * rename is a compile error, not a silent fail-open lane).
 *
 * GATING NOTE: the learner surface (/vac catalogue, /vac/my-courses,
 * /vac/progress, /vac/case) is NOT open to everyone — each learner route is
 * gated by a `vac.*.view` permission in MENU_PERMISSIONS (the route/sidebar
 * guard). The catalogue is the entry point, so the learner lane is gated by
 * `vac.courses.view`. The admin subtree (/vac/admin/*) is gated by its own
 * RoutePermissionGuard layout under `vac.admin.view`.
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each lane. ONE source of truth — content.ts sets
 *  `requires`, the detect-lane / route guard checks the same key. */
export const REQUIRES = {
  learner: "vac.courses.view",
  admin: "vac.admin.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── LEARNER (the student taking courses) ──────────────────────────── */
    learner: {
      persona: "learner",
      title: "Learner Guide",
      tagline:
        "Browse courses, enrol, finish your lessons, and earn your certificate.",
      whyItMatters:
        "Every lesson you finish moves your progress bar forward — and once a course is complete you get a certificate you can download and show. The CASE track turns those courses into a clear path toward placement.",
      startHere: { label: "Browse the Course Catalogue", href: "/vac" },
      requires: REQUIRES.learner,
      journey: [
        "Browse the catalogue",
        "Enrol in a course",
        "Take the lessons",
        "Track your progress",
        "Earn your certificate",
      ],
      sections: [
        {
          id: "browse-enrol",
          title: "Find a course and enrol",
          steps: [
            {
              id: "open-catalogue",
              action: "Open the **Course Catalogue** to see every value-added course on offer.",
              detail:
                "This is the home page of VAC. Use the search box and filters to narrow down by topic or track.",
              platforms: {
                web: "left sidebar → Value-Added Courses → Course Catalog",
                mobile: "tap More (⋯) in the bottom bar → Value-Added Courses → Course Catalog",
              },
              link: { label: "Browse the Course Catalogue", href: "/vac" },
            },
            {
              id: "open-course",
              action: "Click a course to open its **course page** and read what it covers.",
              detail:
                "You'll see the lesson list, how long it takes, and the fee (if any) before you decide.",
              link: { label: "Open a course", href: "/vac/:scopeId" },
            },
            {
              id: "enrol",
              action: "Press **Enrol** on the course page to join it.",
              detail:
                "Enrolling adds the course to My Courses and unlocks its lessons. You can come back to it any time.",
              tip: "Some courses have a fee — finish that step first, then the lessons open.",
            },
          ],
        },
        {
          id: "learn",
          title: "Take your lessons",
          steps: [
            {
              id: "open-my-courses",
              action: "Open **My Courses** to see everything you're enrolled in.",
              detail:
                "This is your personal shelf — pick up any course where you left off.",
              platforms: {
                web: "left sidebar → Value-Added Courses → My Courses",
                mobile: "tap More (⋯) in the bottom bar → Value-Added Courses → My Courses",
              },
              link: { label: "Open My Courses", href: "/vac/my-courses" },
            },
            {
              id: "open-lesson",
              action: "Open a lesson and **work through it from start to finish**.",
              detail:
                "Each lesson marks itself done when you complete it, which moves your progress forward automatically.",
              link: { label: "Go to a lesson", href: "/vac/:scopeId/:scopeId" },
            },
          ],
        },
        {
          id: "track",
          title: "Track progress and get your certificate",
          steps: [
            {
              id: "open-progress",
              action: "Open **My Progress** to see how far you are in every course.",
              detail:
                "One screen shows the completion percentage for each course you're taking.",
              platforms: {
                web: "left sidebar → Value-Added Courses → My Progress",
                mobile: "tap More (⋯) in the bottom bar → Value-Added Courses → My Progress",
              },
              link: { label: "Open My Progress", href: "/vac/progress" },
            },
            {
              id: "open-certificate",
              action: "When a course hits **100%**, open your **certificate** and download it.",
              detail:
                "The certificate page opens once the course is complete — save the PDF or share the link.",
              tip: "If the certificate isn't ready yet, finish the remaining lessons first — it unlocks at full completion.",
              link: { label: "Open my certificate", href: "/vac/certificate/:scopeId" },
            },
          ],
        },
        {
          id: "case",
          title: "Follow the CASE career track",
          steps: [
            {
              id: "open-case",
              action: "Open the **CASE Tracker** to follow your placement-readiness path.",
              detail:
                "CASE links the courses you take to a career track and shows where you stand on getting placement-ready.",
              platforms: {
                web: "left sidebar → Value-Added Courses → CASE Tracker",
                mobile: "tap More (⋯) in the bottom bar → Value-Added Courses → CASE Tracker",
              },
              link: { label: "Open the CASE Tracker", href: "/vac/case" },
            },
            {
              id: "open-case-placement",
              action: "Open a **placement track** to see the exact steps for that track.",
              detail:
                "Each track lays out what to finish to be considered ready for placement in that area.",
              link: { label: "Open a placement track", href: "/vac/case/placement/:scopeId" },
            },
          ],
        },
      ],
    },

    /* ── ADMIN (manages courses, lessons, enrollments, analytics, CASE) ── */
    admin: {
      persona: "admin",
      title: "Admin Guide",
      tagline:
        "You build the courses, manage who's enrolled, watch the numbers, and run the CASE tracks.",
      whyItMatters:
        "Courses, lessons and CASE tracks only exist because you create them — the whole learner experience is built from your admin screens. Analytics tells you what's working so you can fix what isn't.",
      startHere: { label: "Open Admin · Dashboard", href: "/vac/admin" },
      requires: REQUIRES.admin,
      journey: [
        "Open the admin dashboard",
        "Build courses and lessons",
        "Manage enrollments",
        "Watch analytics",
        "Run CASE tracks",
        "Tune settings",
      ],
      sections: [
        {
          id: "dashboard",
          title: "Start at the admin dashboard",
          steps: [
            {
              id: "open-admin",
              action: "Open **Admin · Dashboard** — the home base for everything you manage.",
              detail:
                "From here you reach courses, enrollments, analytics, CASE and settings.",
              platforms: {
                web: "left sidebar → Value-Added Courses → Admin · Dashboard",
                mobile: "tap More (⋯) in the bottom bar → Value-Added Courses → Admin · Dashboard",
              },
              prerequisite:
                "The admin screens are restricted. If a page is blocked, ask your platform admin to grant the matching `vac.admin.*` permission.",
              link: { label: "Open Admin · Dashboard", href: "/vac/admin" },
            },
          ],
        },
        {
          id: "courses",
          title: "Build courses and lessons",
          steps: [
            {
              id: "open-admin-courses",
              action: "Open **Admin · Courses** to see and manage every course.",
              detail:
                "This is the full list of courses with edit and lesson links for each one.",
              link: { label: "Open Admin · Courses", href: "/vac/admin/courses" },
            },
            {
              id: "new-course",
              action: "Press **New Course** to create one from scratch.",
              detail:
                "Give it a title, description, track and fee, then save. Creating the course is what makes it appear in the learner catalogue.",
              prerequisite:
                "Creating a course needs the `vac.admin.courses.create` permission, which is separate from viewing the admin list.",
              link: { label: "Create a new course", href: "/vac/admin/courses/new" },
            },
            {
              id: "edit-course",
              action: "Open a course's **Edit** page to change its details later.",
              detail:
                "Fix the title, description, track, fee or status without rebuilding the course.",
              link: { label: "Edit a course", href: "/vac/admin/courses/:scopeId/edit" },
            },
            {
              id: "open-lessons",
              action: "Open a course's **Lessons** list to manage what's inside it.",
              detail:
                "A course with no lessons has nothing for learners to do — this is where you fill it in.",
              link: { label: "Manage course lessons", href: "/vac/admin/courses/:scopeId/lessons" },
            },
            {
              id: "new-lesson",
              action: "Press **New Lesson** to add a lesson to that course.",
              detail:
                "Add the lesson title and content; learners take lessons in the order you set.",
              link: { label: "Add a lesson", href: "/vac/admin/courses/:scopeId/lessons/new" },
            },
            {
              id: "edit-lesson",
              action: "Open a lesson's **Edit** page to update it.",
              detail:
                "Change the lesson title or content any time — learners see the latest version.",
              link: { label: "Edit a lesson", href: "/vac/admin/courses/:scopeId/lessons/:scopeId/edit" },
            },
          ],
        },
        {
          id: "enrollments",
          title: "Manage enrollments",
          steps: [
            {
              id: "open-enrollments",
              action: "Open **Admin · Enrollments** to see who has joined which course.",
              detail:
                "Review every enrolment, check status, and handle the exceptions.",
              link: { label: "Open Admin · Enrollments", href: "/vac/admin/enrollments" },
            },
          ],
        },
        {
          id: "analytics",
          title: "Watch the numbers",
          steps: [
            {
              id: "open-analytics",
              action: "Open **Admin · Analytics** to see how courses are performing.",
              detail:
                "Enrolment counts, completion rates and progress trends in one place — use it to spot a course that's stalling.",
              link: { label: "Open Admin · Analytics", href: "/vac/admin/analytics" },
            },
          ],
        },
        {
          id: "case-admin",
          title: "Run the CASE career tracks",
          steps: [
            {
              id: "open-case-admin",
              action: "Open **Admin · CASE** — the control room for the placement-readiness program.",
              detail:
                "From here you manage tracks, batches and readiness.",
              link: { label: "Open Admin · CASE", href: "/vac/admin/case" },
            },
            {
              id: "open-case-tracks",
              action: "Open **CASE Tracks** to create and manage the career tracks learners follow.",
              detail:
                "A track is the path you define; learners pick it up on the CASE Tracker.",
              link: { label: "Manage CASE Tracks", href: "/vac/admin/case/tracks" },
            },
            {
              id: "edit-case-track",
              action: "Open a track's **Edit** page to change its steps or details.",
              link: { label: "Edit a CASE track", href: "/vac/admin/case/tracks/:scopeId/edit" },
            },
            {
              id: "open-case-batches",
              action: "Open **CASE Batches** to group learners into the cohorts you run.",
              detail:
                "Batches let you move a set of learners through a track together.",
              link: { label: "Manage CASE Batches", href: "/vac/admin/case/batches" },
            },
            {
              id: "open-case-readiness",
              action: "Open **CASE Readiness** to see who is on track for placement.",
              detail:
                "This is the readiness view across your learners — the signal for who needs a push.",
              link: { label: "Open CASE Readiness", href: "/vac/admin/case/readiness" },
            },
          ],
        },
        {
          id: "settings",
          title: "Tune the module settings",
          steps: [
            {
              id: "open-settings",
              action: "Open **Admin · Settings** to set how VAC behaves across the institution.",
              detail:
                "The module-wide options live here — change them once and they apply everywhere.",
              link: { label: "Open Admin · Settings", href: "/vac/admin/settings" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "VAC", def: "Value-Added Courses — the learning module where you browse, enrol in, and complete extra courses beyond your regular studies." },
    { term: "Value-added course", def: "An extra course offered on top of your normal programme to build a specific skill, often ending in a certificate." },
    { term: "Catalogue", def: "The full list of courses you can browse and enrol in, on the VAC home page." },
    { term: "Enrolment", def: "Joining a course — it adds the course to My Courses and unlocks its lessons for you." },
    { term: "Lesson", def: "One unit inside a course. You complete lessons in order, and each one moves your progress forward." },
    { term: "Progress", def: "How far you are through a course, shown as a percentage on the My Progress screen." },
    { term: "Certificate", def: "The downloadable proof you finished a course — it unlocks once the course reaches 100%." },
    { term: "CASE track", def: "A career path that links your courses to placement, with clear steps to follow toward being placement-ready." },
    { term: "Batch", def: "A group of learners an admin moves through a CASE track together, like a cohort." },
    { term: "Readiness", def: "An admin view showing which learners are on track to be ready for placement." },
    { term: "Enrollment (admin)", def: "On the admin side, a record of which learner joined which course — managed on Admin · Enrollments." },
    { term: "Analytics", def: "The admin dashboard of numbers — enrolments, completion rates and trends — used to see what's working." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};
