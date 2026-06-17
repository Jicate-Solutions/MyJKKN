/**
 * Organizations Smart Guide — authored content (the actual product).
 *
 * The Organizations module is where the academic structure is built and kept
 * accurate: institutions, departments, programs, degrees, courses, course
 * mappings, sections, and semesters. Two honest lanes:
 *   - registry-admin: the person who builds and maintains the hierarchy.
 *   - viewer:         staff who only read the structure for reference.
 *
 * Plain 12th-grade language, authored from the module's REAL routes. Every step
 * that happens on a page carries a "Take me there" deep-link. Permission gating
 * uses the shared REQUIRES keys below (imported by detect-lane.ts so a rename is
 * a compile error, not a silent fail-open lane).
 *
 * NOTE: this rollout ships no screenshots, so no `image` fields are used.
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each lane. ONE source of truth — content.ts sets
 *  `requires`, detect-lane.ts checks the same key. Every key below is a real
 *  string from lib/constants/permissions.ts.
 *
 *  - registry-admin → organizations.institutions.edit
 *      The builder edits the top of the hierarchy; if you can edit institutions
 *      you are the person who maintains the whole tree.
 *  - viewer         → organizations.dashboard.view
 *      Read-only access to the overview dashboard.
 */
export const REQUIRES = {
  "registry-admin": "organizations.institutions.edit",
  viewer: "organizations.dashboard.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── REGISTRY ADMIN — the builder ──────────────────────────────────── */
    "registry-admin": {
      persona: "registry-admin",
      title: "Registry Admin Guide",
      tagline:
        "You build and maintain the academic structure — from institutions down to sections.",
      whyItMatters:
        "Almost every other part of the platform reads this structure. Get it right here and admissions, timetables, and results all line up; a gap here shows up as a problem everywhere else.",
      startHere: { label: "Open the Dashboard", href: "/organizations/dashboard" },
      requires: REQUIRES["registry-admin"],
      journey: [
        "Add institutions",
        "Add departments",
        "Set up programs and degrees",
        "Add courses",
        "Map courses",
        "Create sections and semesters",
      ],
      sections: [
        {
          id: "top-of-tree",
          title: "Build the top of the tree",
          steps: [
            {
              action: "Open the **Dashboard** to see what already exists before you add anything.",
              detail:
                "The dashboard counts your institutions, departments, programs, and more. Filter by one institution to focus. Always check here first so you don't create a duplicate.",
              platforms: {
                web: "left sidebar → Organizations → Dashboard",
              },
              link: { label: "Open the Dashboard", href: "/organizations/dashboard" },
            },
            {
              action: "Add each **institution** under **Institutions**.",
              detail:
                "An institution is one college or school. This is the top of the structure — everything else hangs under it, so add these first.",
              prerequisite:
                "Add the institution before its departments. A department needs an institution to belong to, so this step has to come first.",
              link: { label: "Open Institutions", href: "/organizations/institutions" },
            },
            {
              action: "Add each **department** under **Departments**, and pick which institution it belongs to.",
              detail:
                "A department is a teaching unit inside an institution, such as Computer Science or Commerce.",
              link: { label: "Open Departments", href: "/organizations/departments" },
            },
            {
              action: "Assign a **Head of Department** for each department under **HOD Assignment**.",
              detail:
                "This sets one Head of Department per department. Other parts of the platform use it to route approvals to the right person.",
              tip: "Opening or editing HOD Assignment may need a separate staff permission. If the page is blocked, ask your platform admin for access.",
              link: { label: "Open HOD Assignment", href: "/organizations/departments/hod-assignment" },
            },
          ],
        },
        {
          id: "qualifications",
          title: "Set up qualifications",
          steps: [
            {
              action: "Add each **program** under **Programs**.",
              detail:
                "A program is a course of study a student enrols in, such as B.Sc Computer Science. Link it to the department that runs it.",
              link: { label: "Open Programs", href: "/organizations/programs" },
            },
            {
              action: "Add each **degree** under **Degrees**.",
              detail:
                "A degree is the qualification a program leads to, such as B.Sc or M.Com. Set these up so programs can point to the right award.",
              link: { label: "Open Degrees", href: "/organizations/degrees" },
            },
          ],
        },
        {
          id: "courses",
          title: "Add and map courses",
          steps: [
            {
              action: "Add each **course** under **Courses**.",
              detail:
                "A course is one subject that is taught and graded, such as Data Structures. Add the full list of subjects here.",
              prerequisite:
                "Create the course itself before you map it. A mapping points at an existing course, so the course has to exist first.",
              link: { label: "Open Courses", href: "/organizations/courses" },
            },
            {
              action: "Connect courses to programs and semesters under **Course Mappings**.",
              detail:
                "A mapping says which course is taught in which program and term. This is what turns a list of subjects into an actual curriculum.",
              tip: "Mapping is the step people forget. A course with no mapping never shows up in a student's plan.",
              link: { label: "Open Course Mappings", href: "/organizations/courses/mappings" },
            },
          ],
        },
        {
          id: "delivery",
          title: "Create sections and semesters",
          steps: [
            {
              action: "Create the **sections** students are split into under **Sections**.",
              detail:
                "A section is one group of students taught together, such as 'CS Year 1 — Section A'. Add a section for each group.",
              link: { label: "Open Sections", href: "/organizations/sections" },
            },
            {
              action: "Set up the **semesters** that frame the academic year under **Semesters**.",
              detail:
                "A semester is one teaching term with start and end dates. Other modules use these dates to know which term is current.",
              link: { label: "Open Semesters", href: "/organizations/semesters" },
            },
          ],
        },
        {
          id: "school-settings",
          title: "School institution settings",
          steps: [
            {
              action: "For school (K-12) institutions, set the defaults under **School Defaults**.",
              detail:
                "This fills in the standard program and academic department a school uses, so you don't repeat the same setup by hand for every school.",
              tip: "Only needed for school-type institutions. Skip it for colleges.",
              link: { label: "Open School Defaults", href: "/organizations/school-defaults" },
            },
            {
              action: "Check what changed under the **School Defaults audit** log when you need a record.",
              detail:
                "The audit page shows who changed a school default and when. Use it to trace a setting back to a person.",
              link: { label: "Open School Defaults audit", href: "/organizations/school-defaults/audit" },
            },
          ],
        },
      ],
    },

    /* ── VIEWER — read-only ────────────────────────────────────────────── */
    viewer: {
      persona: "viewer",
      title: "Viewer Guide",
      tagline: "You look up the academic structure — institutions, departments, courses, and more.",
      whyItMatters:
        "When you need to confirm which department runs a program, or which courses sit in a semester, this is the single accurate place to check.",
      startHere: { label: "Open the Dashboard", href: "/organizations/dashboard" },
      requires: REQUIRES.viewer,
      journey: ["Open the dashboard", "Browse a list", "Open one record"],
      sections: [
        {
          id: "look-up",
          title: "Look up the structure",
          steps: [
            {
              action: "Open the **Dashboard** for a count of institutions, departments, programs, and courses.",
              detail:
                "Use the institution filter to narrow the numbers to one college or school.",
              platforms: {
                web: "left sidebar → Organizations → Dashboard",
              },
              link: { label: "Open the Dashboard", href: "/organizations/dashboard" },
            },
            {
              action: "Open any list — **Institutions**, **Departments**, **Programs**, **Courses** — to browse records.",
              detail:
                "Each list lets you search and sort. Start from the list that matches what you're looking for.",
              link: { label: "Open Departments", href: "/organizations/departments" },
            },
            {
              action: "Click a row to open one record and read its full detail.",
              detail:
                "The detail page shows everything linked to that record — for example, the programs under a department.",
              tip: "You can read every record. Buttons to add, edit, or delete only appear if you have been given those permissions.",
              link: { label: "Open Courses", href: "/organizations/courses" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Institution", def: "One college or school. The top of the academic structure — everything else belongs under an institution." },
    { term: "Department", def: "A teaching unit inside an institution, such as Computer Science or Commerce." },
    { term: "Program", def: "A course of study a student enrols in, such as B.Sc Computer Science." },
    { term: "Degree", def: "The qualification a program leads to, such as B.Sc or M.Com." },
    { term: "Course", def: "One subject that is taught and graded, such as Data Structures." },
    { term: "Course Mapping", def: "A link that says which course is taught in which program and term — it turns a subject list into a curriculum." },
    { term: "Section", def: "One group of students taught together, such as 'CS Year 1 — Section A'." },
    { term: "Semester", def: "One teaching term with start and end dates." },
    { term: "HOD", def: "Head of Department — the staff member who leads a department. Other modules route approvals to this person." },
    { term: "School Defaults", def: "Standard settings (program and academic department) applied to school-type, K-12 institutions so the same setup isn't repeated by hand." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};
