# PDE — UX/UI Friction Log (from Smart Guide authoring, 2026-06-14)

Authoring the PDE Smart Guide is a free UX + UI audit: writing one step per real
screen surfaces flow problems, and reading the screens surfaces visual gaps.
Logged here per the smart-guide skill — **surfaced, not papered over**. None of
these are fixed by the guide PR; they are follow-up product work.

Source: 3 parallel route-reading agents (learner/faculty/admin) + a ground-truth
verification pass. Severity is the author's estimate, not a triaged priority.

---

## Cross-cutting (highest priority)

| # | Screen(s) | Kind | Problem | Suggested fix | Severity |
|---|---|---|---|---|---|
| X1 | learner submit form vs faculty demo filter vs capabilities tree | UX | **Two category taxonomies coexist.** Learners submit under the **seven durable-value categories** (Judgment, Embodied, Problem Finding, Accountability, Social & Leadership, Cultural & Civic, Credential). The **faculty demonstrations filter** and the **capabilities tree** use a different **capability-category** set (Technical, Analytical, Creative, AI Fluency, Domain AI…). A learner submits under "Embodied" but a faculty member filters by "Technical" — the lists don't line up. Verified in code: `lib/types/pde-demonstrations.ts` vs `app/(routes)/pde/faculty/demonstrations/page.tsx` lines 108-110 + `app/(routes)/pde/admin/capabilities/page.tsx` lines 60-61. | Pick one taxonomy, or make the relationship explicit in the UI (map each capability category into a durable-value category and show both). The guide currently describes each screen accurately and names the split in its glossary, but the underlying inconsistency will confuse any learner↔faculty pair. | **high** |

---

## Learner lane

| Screen | Kind | Problem | Fix | Severity |
|---|---|---|---|---|
| `/pde/learn` | UX | Landing route redirects immediately via policy config with no user-facing landing; undefined behaviour if the policy/RPC fails. | Show a brief welcome/loading state before redirect, or document the fallback. | low |
| `/pde/learn/demonstrations/new` | UX | Rubric dropdown is hidden for 4 of 7 categories (judgment, problem_finding, accountability, credential) — a learner in those categories sees no rubric and may think it's broken. | Show "No rubric for this category" so the absence reads as intentional. | med |
| `/pde/learn/demonstrations/new` | UX | Curriculum link (BoS vs VAC) lazy-loads options on first click with no loading indicator — feels unresponsive. | Add a "Loading courses…" state; disable the control until loaded. | low |
| `/pde/learn/demonstrations` | UX | Withdraw button shows a "404 — endpoint ships in T1.2" message, exposing an implementation detail and breaking trust. | Ship the endpoint or hide the button until it exists. | med |
| `/pde/learn/cohort` | UX | Empty state tells a learner to submit a demonstration but offers no link to the new-demonstration form. | Add a "Start your first demonstration" button to the empty state. | low |
| `/pde/learn/transcript` | UI | Missing learner profile renders a bare unstyled div (system-ui font) instead of an on-brand error card. | Use ContentLayout + the error-card pattern from DemonstrationList. | low |

## Faculty lane

| Screen | Kind | Problem | Fix | Severity |
|---|---|---|---|---|
| `/pde/faculty/dashboard` | UX | "Send nudge" button has no confirmation and may silently no-op if the endpoint isn't wired. | Add a success/failure toast; disable with a tooltip if not live. | **high** |
| `/pde/faculty/cases/new` | UX | Form Builder and Paste JSON tabs are silos — switching tabs loses Builder work with no warning. | Auto-save Builder to sessionStorage; warn before a destructive tab switch. | **high** |
| `/pde/faculty/demonstrations` | UX | No sort-by-status; pending badge isn't a link to a pending-only view — faculty scan manually. | Add a status sort (Pending first) and link the badge to a filtered view. | med |
| `/pde/faculty/assessments` | UX | Must pick a course before anything appears; unclear whether there are zero assessments or zero for that course. | Show a cross-course summary first, or group all assessments by course. | med |
| `/pde/faculty/cases/[id]/edit` | UX | Draft→Published transition has no confirmation — an accidental click goes live. | Confirmation modal noting learners will see it immediately (and that edits remain possible). | med |
| `/pde/faculty/cases` | UX | Search + status + course filters show no result count — zero matches is ambiguous. | Show "N of M cases" / "No cases match" + a Clear Filters control; persist in URL. | med |
| `/pde/faculty/quests` | UX | Submissions column shows "--" for all quests — learner engagement is invisible. | Wire the count or make it a "View submissions" link. | med |
| `/pde/faculty/analytics` | UX | Tabs show "No data yet" with no indication whether collection is pending or broken. | Add "Data populates after ~2 weeks of activity" with a help link. | low |
| `/pde/faculty/dashboard` | UI | Risk dots (red/yellow/orange) have no legend; colour meaning is lost in dark mode or on hover. | Add a legend/tooltip with the thresholds. | low |

## Admin lane

| Screen | Kind | Problem | Fix | Severity |
|---|---|---|---|---|
| `/pde/admin/transcript` | UX | No learner picker — route is `[learnerId]`-only, so admins can't reach a transcript without knowing the ID. | Add a learner search/autocomplete on the transcript index. | med |
| `/pde/admin/policies` | UX | Landing redirects to scoring; the other 4 policy editors aren't discoverable from one place. | Add a policies hub showing all 5 editors as cards. | med |
| `/pde/admin/rubrics` | UX | Landing redirects to embodied; the 3 rubric namespaces aren't discoverable from an index. | Add a rubrics hub with a card/tab per namespace. | med |
| `/pde/admin` | UX | Landing redirects to Assessments with no orientation for a first-time admin. | Add a brief quick-start (Set up Policies → Create Quests → Validate). | low |
| `/pde/admin/demonstrations` | UX | Row isn't clickable — only the "Validate" action opens the detail form. | Make the whole row open the validation form. | low |
| `/pde/admin/compliance` | UX | Landing redirects to per-college; future compliance views will be hard to find. | Pre-emptive compliance hub. | low |
| `/pde/admin/at-risk` | UX | Rows link to `/vac/progress`, outside the PDE admin area — context is lost. | Embed progress in a modal, or label the external link. | low |
| `/pde/admin/kpi` | UX | Only the headline 60% coordinator metric; no drill-down to diagnose a lagging cohort. | Add segment-by-institution/role drill-down. | low |
| `/pde/admin/lti` | UI | Phase-4 limitation disclaimer is a dashed card at the bottom, easy to miss. | Promote it to a top banner/badge. | low |
| `/pde/admin/quests`, `/pde/admin/assessments` | UX | No bulk actions or CSV export for reporting. | Add bulk-select + export. | low |

---

*Generated alongside the PDE Smart Guide PR (feat/pde-smart-guide). The guide
itself ships accurate to each screen as it exists today; this log is the backlog
of what to improve next.*
