# Student Login — Feature Reference (MyJKKN)

> **Audience:** developers, QA, and support staff who need to know exactly what a
> user with `profiles.role = 'student'` can reach after signing in.
>
> **Terminology note:** JKKN house terms are used in the UI — a *Student* is a
> **Learner**, a classroom is a **Learning Studio**, a course is sometimes a
> **Subject** (schools). The code still uses `student` as the role key.
>
> Last verified against `main` on **2026-08-19**.

---

## 1. How a student gets in

Students sign in through the same Google OAuth flow as staff (`/auth/login` →
`/auth/callback`). There is no separate student login URL.

```
Google OAuth
     ↓
app/auth/callback/route.ts     ← provisions profile, picks destination
     ↓
proxy.ts                       ← lifecycle gate on EVERY request
     ↓
/  (dashboard)   or   /learners/my-induction
```

### Auto-provisioning

If no `profiles` row exists but an **approved learner** record matches the
email, the callback creates a profile with `role = 'student'` and links it to
`learners_profiles` via the `auto_link_profile_to_approved_learner` trigger.

### The feature flag

Student access is behind a flag (`lib/config/feature-flags.ts`). When the flag
is **off**, every student is bounced to
`/auth/login?reason=student_redirect` and their auth cookies are cleared —
handled identically in `proxy.ts`, `app/auth/callback/route.ts`, and
`app/page.tsx`.

---

## 2. Access tiers — driven by lifecycle status, not by role

`StudentValidationService.validateStudentAccess()`
(`lib/services/auth/student-validation-service.ts`) reads
`learners_profiles.lifecycle_status` and returns one of three tiers.

| Tier | `lifecycle_status` | What they can reach |
|---|---|---|
| **`full`** | `active`, `graduated` | The whole student portal (Sections 3–5) |
| **`induction_only`** | `enquiry`, `enquiry_submitted`, `reserved`, `admitted`, `account` | **Only** `/learners/my-induction` and `/learners/my-profile` |
| **`none`** | `pending`, `approved`, `rejected`, `waitlisted`, `inactive`, `exited`, `alumni` | Blocked at the proxy |

The induction-only whitelist is a genuine gate, not just a nav filter:

- `proxy.ts` — `INDUCTION_ONLY_EXACT_PATHS` (`/learners/my-profile`,
  `/unauthorized`, `/error`) plus `INDUCTION_ONLY_PREFIXES`
  (`/learners/my-induction`). Anything else redirects to
  `/learners/my-induction`. `/auth/*` is already public, so it is not listed.
- `filterToInductionOnlyMenu()` in `lib/sidebarMenuLink.ts` trims the sidebar
  and mobile bottom nav to match, so the menu never shows an unreachable link.
- The eligible-status list lives in `lib/constants/induction-access.ts` — a
  single client-safe constant shared by the proxy, the OAuth callback, the nav
  hook, and (mirrored by hand) the SQL trigger.

> **Note:** `induction_only` deliberately returns `allowed: false`, so every
> pre-existing learner page/API guard keeps blocking these users. The whitelist
> is opened separately off `accessTier`.

---

## 3. Core student portal — the "My" pages

These live under `/learners/my-*` and are **exclusive to the student role** —
`isStudentPortalRoute()` hides them from super admins and every staff role,
because the page shells server-side redirect non-students to `/`.

### 3.1 My Timetable — `/learners/my-timetable`
`learners.my-timetable.view`

- Mobile-first day-by-day schedule with a swipeable day picker
- Live **current class** indicator
- Tap a period for a course detail sheet (faculty, room, timing)
- Export actions
- Cycle-based timetables supported (keyed `cycle-N`, not weekday)

### 3.2 My Attendance — `/learners/my-attendance`
`learners.my-attendance.view`

- Statistics cards (overall %, present/absent counts)
- Attendance **trend chart** over the semester
- **Course-wise** and **period-wise** breakdown tables
- Semester filter
- Pending session-feedback banner (feedback confirms attendance)
- Confirmed-attendance card + running score card
- Export actions

### 3.3 My Profile — `/learners/my-profile`
`learners.my-profile.view`

- Full profile view (personal, contact, academic, guardian details)
- **Profile completion** card and indicator
- Raise a **change request** for locked fields (`change-request-dialog`)
- Pending-changes banner + before/after comparison view
- Track request outcome at `/learners/my-profile/status` and
  `/learners/my-profile/status/[id]`

### 3.4 My Marks — `/learners/my-marks`
`learners.my-marks.view`

Two tabs, each with its own sub-route:

| Tab | Route | Contents |
|---|---|---|
| **Internal Marks** | `/learners/my-marks/internal` | CIA assessment panel, CIA setting picker, round picker, marks table |
| **Semester Result** | `/learners/my-marks/result` | Result panel, result table, grade-system legend, semester tabs |

Data comes from COE via `app/api/learners/my-marks/*`
(`marks`, `marks-batch`, `internal-final`, `result`, `result-view`,
`cia-view`, `registrations`, `grade-system`).

### 3.5 My Bills — `/learners/my-bills`
`learners.my-bills.view`

Three tabs:

- **Outstanding** — unpaid fee items with a cleared-percentage progress bar;
  transport fees broken out separately
- **Paid** — payment history with a receipt dialog
- **Analytics** — fee breakdown and trends

Backed by `billing_student_bills` (one row **per fee item**, not per student).

### 3.6 My Induction — `/learners/my-induction`
Auto-visible via `isStudentPortalRoute` (path matches `/learners/my-`)

The fresher-induction hub, and the **only** page an `induction_only` learner
can use besides My Profile:

- Batch/day session schedule with per-session 1–5 **rating cards**
- Day feedback, program feedback, and mentor-month feedback cards
- Live **session pulse** control + poll banner
- Day-10 **profile-completion nudge**
- **Referral** section and advocacy card
- Senior Peer Mentor card / sessions-led card (for learners who are mentors)

### 3.7 Learning Studio Feedback — `/learners/class-feedback`
Student-only via the `isStudentPortalRoute` special case

A single page combining pending post-class sessions (with inline confirm) and
confirmed-session history. A 10-second rating here **confirms the learner's
attendance**. Replaces the old `/learners/my-attendance-feedback` route, which
now redirects here via `next.config.ts`.

### 3.8 Senior Peer Mentor — `/my-induction-feedback`
Ungated by design

A final-year learner's lane for running their assigned group of freshers
(attendance check-in + kiosk feedback). Self-scopes through
`fn_induction_my_volunteer_sessions`, so a non-mentor sees an empty state.

### 3.9 My Development Plan — `/learner/idp`
Ungated by design (self-scoped by RLS on `cdc_idp_responses`)

Learner self-service Individual Development Plan. Note the singular
`/learner/` path — it does **not** match `/learners/my-`, so it is whitelisted
explicitly inside `isStudentPortalRoute()`.

### 3.10 Leave / OnDuty — `/learners/leave-onduty`
`learners.leave_onduty.view` · `learners.leave_onduty.apply`

- `/learners/leave-onduty/apply` — submit a leave or on-duty request
- `/learners/leave-onduty/my-applications` — track status through the approval
  chain

Approved on-duty protects attendance (migration
`20260731223500_attendance_protection_approved_onduty`).

---

## 4. Extended modules a student can reach

These are normal permission-gated routes that the `student` role has been
granted. They are **not** `/learners/my-*`, so staff roles may share them.

### Campus Living (hostel residents only) — `/campus-living/my-hostel`
`campus_living.my_hostel.view`

The sidebar rewrites the generic `/campus-living` entry to **My Hostel** with
no submenu accordion for students (`GetRoleBasedPages`). Both `menu.tsx` and
`bottom-navbar.tsx` then **overwrite** the permission with a live
`user_is_hosteler()` check, so day-scholars never see a dead-end link.

Granted keys: `allocations.view_own`, `fees.view_own`, `profile.view_own`,
`profile.edit_own`, `gate_passes.create`, `gate_passes.view_own`,
`leave.request`, `leave.view_own`.

Premium hostel lane: `/campus-living/my-hostel/premium` — view dashboard, pick
a room, invite a roommate.

> ⚠️ **Vacate requests were revoked from students on 2026-08-10**
> (`20260810120000_revoke_learner_side_hostel_vacate_requests`). The route
> `/campus-living/my-hostel/vacate-request` now denies at
> `RoutePermissionGuard`. The workflow is slated for a rebuild.

### Service Requests — `/service-requests/my-requests`
`service_requests.view_own`

Raise and track campus service requests. One of the four default favourites
seeded for the student role.

### Resource Reservations — `/resource-management/reservations/my-reservations`
`resources.reservations.view`

Personal resource/room bookings. **Active learners only** — not available to
`graduated`.

### Value-Added Courses — `/vac/my-courses`
`vac.my_courses.view`

### Startup Studio — `/startup-studio`
`startup_studio.view` and friends

Students hold: `problem_bank.view`, `events.view`, `events.register`,
`events.submit`, `submissions.create`, `submissions.view`, `cycles.view`,
`cycles.create`, `nif.view`, `analytics.view`. Includes
`/startup-studio/foundations/my-journey` and the per-event `my-team`,
`my-registration` pages.

### AI Pulse — `/ai-pulse/my-pulse`
`aiPulse:view.self`

Personal AI-Pulse participation view.

### Sports Tournaments (browse & register) — `/events/tournaments`
`sports.tournaments.browse`

Deliberately a **separate plural route** from the admin `/events/tournament`
console, so the read-only student browse page cannot be confused with
management (`20260801001400_tournament_student_browse_and_grant_narrowing`).

### CDC Bulletin
`cdc.bulletin.view` — granted to learners on 2026-08-10.

### Verified Skills / Proof Record — `/my-proof`
`learners.proof.view`

### My Kit — `/my-kit`
`ims.kits.my.view`

### RCLTP — assessments and own report
`rcltp.assessment.take`, `rcltp.report.view_own`

### Feedback — `/feedback`
`feedback.student_course_faculty.respond` — submit course × faculty feedback.

---

## 5. Universal features (every signed-in user, students included)

| Feature | Route | Notes |
|---|---|---|
| Dashboard | `/` | Always visible |
| Notifications | `/notifications` | `notifications.view` |
| My Bug Reports | `/my-bug-reports` | `learners.bug_reports.view` |
| Bug Leaderboard | `/bug-leaderboard` | Same key |
| My Desk | `/my-desk` | Always visible — a handover exists *because* the receiver holds no permission, so the inbox itself cannot be gated |
| Platform Guide | `/guide` | Always visible |
| My Induction Sessions | `/my-induction-sessions` | Always visible; self-scoped to speakers |

---

## 6. Default favourites seeded for the student role

From `lib/navigation/role-defaults.ts` — auto-populated when a student has zero
favourites:

1. My Timetable — `/learners/my-timetable`
2. My Attendance — `/learners/my-attendance`
3. My Profile — `/learners/my-profile`
4. My Requests — `/service-requests/my-requests`

---

## 7. What a student explicitly **cannot** do

- Reach any admin `/learners/*` page (profiles, alumni, enquiries, change-request
  approvals, school master, postal codes, analytics)
- Submit a hostel vacate request (revoked 2026-08-10)
- See the Campus Living admin accordion — `noSubmenus` is forced on for students
- Access any route marked `requiresSuperAdmin`
- Reach `/learners/my-*` pages while on an `induction_only` tier

Conversely, **super admins cannot see the student portal pages** — `/learners/my-*`,
`/learners/leave-onduty/my-applications`, `/learners/class-feedback`,
`/learner/idp`, and `/my-induction-feedback` are filtered out for them at both
the top-level row and the nested-submenu level, because the pages themselves
redirect every non-student to `/`.

---

## 8. Permission key reference

Granted to `custom_roles` where `role_key = 'student'`.

### Portal core
```
view_dashboard                       view_profile
learners.my-timetable.view           learners.my-attendance.view
learners.my-profile.view             learners.my-marks.view
learners.leave_onduty.apply          learners.leave_onduty.view
learners.bug_reports.view            learners.proof.view
```

Route-declared but **not granted by any repo migration** —
`learners.my-bills.view` and `learners.privileges.view`. They appear in
`MENU_PERMISSIONS` / `learner-routes.ts`, so the pages are gated on them, but
the live grant (if any) was applied directly to `custom_roles` in the database.
Verify against the live row before assuming a student can open My Bills:

```sql
SELECT permissions ? 'learners.my-bills.view'   AS has_bills,
       permissions ? 'learners.privileges.view' AS has_privileges
FROM custom_roles WHERE role_key = 'student';
```

### Academic & billing (own data only — narrowed by RLS)
```
academic.timetables.view             academic.attendance.view
billing.schedule.view                billing.receipts.view
billing.invoices.view
```

### Campus living
```
campus_living.my_hostel.view         campus_living.allocations.view_own
campus_living.fees.view_own          campus_living.profile.view_own
campus_living.profile.edit_own       campus_living.gate_passes.create
campus_living.gate_passes.view_own   campus_living.leave.request
campus_living.leave.view_own         campus_living.premium.view_dashboard
campus_living.premium.pick_room      campus_living.premium.invite_roommate
```

### Other modules
```
startup_studio.view                  startup_studio.problem_bank.view
startup_studio.events.view           startup_studio.events.register
startup_studio.events.submit         startup_studio.submissions.create
startup_studio.submissions.view      startup_studio.cycles.view
startup_studio.nif.view              startup_studio.analytics.view
service_requests.view_own            resources.reservations.view
vac.my_courses.view                  aiPulse:view.self
sports.tournaments.browse            cdc.bulletin.view
ims.kits.my.view                     rcltp.assessment.take
rcltp.report.view_own                feedback.student_course_faculty.respond
notifications.view
```

> **Granted but not routed:** `id_cards.my-cards.view` exists in the permission
> catalogue with no corresponding page in `app/(routes)`. Treat it as reserved.

---

## 9. Source-of-truth file map

| Concern | File |
|---|---|
| Canonical learner-route registry | `lib/constants/learner-routes.ts` |
| Route → permission map + sidebar tree | `lib/sidebarMenuLink.ts` |
| Student-only route predicate | `isStudentPortalRoute()` — `lib/sidebarMenuLink.ts:3733` |
| Induction-only nav filter | `filterToInductionOnlyMenu()` — same file |
| Nav permission filtering | `lib/navigation/permission-filter.ts` |
| Lifecycle gate (runtime) | `proxy.ts` |
| Lifecycle validation | `lib/services/auth/student-validation-service.ts` |
| Induction-eligible statuses | `lib/constants/induction-access.ts` |
| Post-login destination | `app/auth/callback/route.ts`, `app/page.tsx` |
| Default favourites | `lib/navigation/role-defaults.ts` |
| Desktop sidebar consumer | `components/Navbar/menu.tsx` |
| Mobile bottom nav consumer | `components/BottomNav/bottom-navbar.tsx` |

---

## 10. Maintenance rules

1. **Nav visibility must mirror the route guard.** Revoking a permission key
   without adding a page guard only hides the link — a typed URL still renders.
   Both halves ship together.
2. **`menu.tsx` and `bottom-navbar.tsx` must stay in lock-step.** Any
   student-specific enrichment (hosteler check, expo membership, induction-only
   filter) is duplicated in both; changing one alone splits desktop from mobile.
3. **New `/learners/my-*` routes are auto-student-only** — the path prefix is
   enough. Routes outside that prefix (like `/learner/idp`) need an explicit
   entry in `isStudentPortalRoute()`.
4. **Register new learner routes** in `lib/constants/learner-routes.ts` with the
   correct `allowedStatuses`, so route-validation tooling stays accurate.
