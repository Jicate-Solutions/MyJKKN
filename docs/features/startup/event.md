# JKKN Appathon 2.0 — Complete Workflow
*   [Roles](#roles)
*   [Phase 1: Pre-Event Setup (Admin)](#phase-1-pre-event-setup-admin)
    *   [1.1 Event Configuration (Already Done)](#11-event-configuration-already-done)
    *   [1.2 Share Registration Link](#12-share-registration-link)
*   [Phase 2: Registration (Students) — Now → Friday March 6](#phase-2-registration-students-now-friday-march-6)
    *   [What Students Do](#what-students-do)
    *   [Validation Rules (Server-Enforced)](#validation-rules-server-enforced)
    *   [What Students See After Registration](#what-students-see-after-registration)
*   [Phase 3: Admin Preparation (After Registration Closes)](#phase-3-admin-preparation-after-registration-closes)
    *   [3.1 Review Registrations](#31-review-registrations)
    *   [3.2 Set Up Build Day Venues](#32-set-up-build-day-venues)
    *   [3.3 Set Up Demo Day Venues](#33-set-up-demo-day-venues)
    *   [3.4 Generate Demo Day Schedule](#34-generate-demo-day-schedule)
*   [Phase 4: Build Day (Sunday March 8)](#phase-4-build-day-sunday-march-8)
    *   [Morning: Check-In](#morning-check-in)
    *   [During the Day: Building](#during-the-day-building)
    *   [Submission (End of Build Day)](#submission-end-of-build-day)
    *   [Evening: Get Real Users & Revenue (Sunday 5 PM → Monday 9 AM)](#evening-get-real-users-revenue-sunday-5-pm-monday-9-am)
*   [Phase 5: Demo Day (Monday March 9)](#phase-5-demo-day-monday-march-9)
    *   [Metrics Showcase (Not Traditional Judging)](#metrics-showcase-not-traditional-judging)
    *   [Schedule](#schedule)
    *   [Scoring: Tiered Objectives + MRR Bonus](#scoring-tiered-objectives-mrr-bonus)
*   [Phase 6: Results & Closing](#phase-6-results-closing)
    *   [Leaderboard](#leaderboard)
    *   [Publish Results](#publish-results)
    *   [Winner Announcement](#winner-announcement)
*   [Page Map](#page-map)
    *   [Student Pages](#student-pages)
    *   [Mentor/Evaluator Pages](#mentorevaluator-pages)
    *   [Admin Pages](#admin-pages)
*   [Security & Validation Summary](#security-validation-summary)
*   [Event ID Reference](#event-id-reference)

> **Event:** She Builds — JKKN Appathon 2.0 (Women's Day Special)  
> **Dates:** Sunday March 8 (Build Day) → Monday March 9 (Demo Day)  
> **Registration Deadline:** Friday March 6, 11:59 PM IST  
> **Platform:** MyJKKN (`https://myjkkn-omm-dev.vercel.app`)  
> **Participants:** ~200 teams across 6 JKKN colleges

* * *

Roles
-----



* Role: Admin
  * Who: Director / Event Coordinator
  * What They Do: Configure event, manage venues/mentors/judges, check-in teams, generate demo schedule, publish results
* Role: Student
  * Who: Learners (teams of 1-5)
  * What They Do: Register team, build app on Build Day, submit project, present on Demo Day
* Role: Mentor
  * Who: 50 Senior Learners
  * What They Do: Guide teams at assigned Build Day venue
* Role: Evaluator
  * Who: Faculty / External panelists
  * What They Do: Verify metrics and review demos at assigned Demo Day venue


* * *

Phase 1: Pre-Event Setup (Admin)
--------------------------------

### 1.1 Event Configuration (Already Done)

*   \[x\] Create event: "JKKN Appathon 2.0"
*   \[x\] Set dates: March 8-9, 2026
*   \[x\] Set registration deadline: March 6, 11:59 PM IST
*   \[x\] Configure team size: 5 members max
*   \[x\] Set categories: Education, Healthcare, Agriculture, Sustainability, Finance, Social Impact, Productivity, Entertainment, Other
*   \[x\] Set tools: Lovable, Anthropic API
*   \[x\] Seed 17 checklists (pre-event, on-day, post-event)

Share with all 6 colleges:

```
https://myjkkn-omm-dev.vercel.app/startup-studio/events/572a5836-58a6-4f98-a3f4-92b862dd8080

```


Students click **"Register Your Team"** from this page.

* * *

Phase 2: Registration (Students) — Now → Friday March 6
-------------------------------------------------------

### What Students Do

1.  **Login** to MyJKKN (Google OAuth)
2.  Navigate to **Startup Studio → Events → JKKN Appathon 2.0**
3.  Click **"Register Your Team"**
4.  Fill the registration form:  
    \- **Team Name** (required)  
    \- **Problem Idea** (required, minimum 20 characters) — what problem will they solve?  
    \- **Team Members** (1-5 people) — add by email or student ID  
    \- **Has Laptop?** — checkbox per member (minimum 1 laptop per team)
5.  Submit registration

### Validation Rules (Server-Enforced)



* Rule: Past deadline (March 6, 11:59 PM)
  * What Happens: Registration blocked — "Registration deadline has passed"
* Rule: More than 5 members
  * What Happens: Blocked — "Maximum 5 team members allowed"
* Rule: Student already on another team
  * What Happens: Blocked — "Some members are already registered with another team"
* Rule: Team leader already registered
  * What Happens: Blocked — "You already registered team [name] for this event"
* Rule: Problem idea too short
  * What Happens: Blocked — "Problem idea must be at least 20 characters"


### What Students See After Registration

On the **"My Team"** page (`/events/[id]/my-team`):  
\- Team name and registration status  
\- Team members list with laptop badges  
\- Venue assignments (once allocated by admin)  
\- Presentation slot (once scheduled by admin)  
\- Mentor name (once assigned by admin)

* * *

Phase 3: Admin Preparation (After Registration Closes)
------------------------------------------------------

### 3.1 Review Registrations

**Page:** Event → **Registrations**

*   View all registered teams with stats
*   See total teams, total members, laptop count
*   Search and filter teams
*   Toggle **"Lovable Verified"** for each team (confirm they have Lovable accounts)

### 3.2 Set Up Build Day Venues

**Page:** Event → **Venues & Mentors** → "Build Day" tab

1.  **Add Venues** — Click "Add Venue"  
    \- Option A: Pick from Resource Management (existing rooms/labs/halls)  
    \- Option B: Manual entry (name, building, room, capacity)  
    \- Add one venue per college (or as needed)
    
2.  **Assign Mentors** — Click "Assign Staff" on each venue card  
    \- Search for senior learners by name  
    \- Select multiple mentors per venue  
    \- Assign role: Mentor or Lead Mentor
    
3.  **Allocate Teams** — Two options:  
    \- **Auto-Allocate**: Click "Auto-Allocate" — distributes teams by institution match, respecting capacity  
    \- **Manual**: Click "Allocate Teams" on each venue, select specific teams
    

### 3.3 Set Up Demo Day Venues

**Page:** Event → **Venues & Mentors** → "Demo Day" tab

Same process but for Demo Day:  
1\. Add venues (may be different from Build Day)  
2\. Assign **Judges** instead of mentors (role: Judge or Panel Chair)  
3\. Allocate teams (distribution may differ from Build Day)

### 3.4 Generate Demo Day Schedule

**Page:** Event → **Demo Day**

1.  Click **"Generate Slots"**  
    \- Set start time (e.g., 9:00 AM)  
    \- Set duration per team (e.g., 5 minutes)  
    \- Set room name  
    \- Set number of slots
2.  **Assign teams to slots** — dropdown per slot
3.  Review schedule — each slot shows team name, time, room

* * *

Phase 4: Build Day (Sunday March 8)
-----------------------------------

### Morning: Check-In

**Admin at Registration Desk:**  
\- **Page:** Event → **Registrations**  
\- Check in teams as they arrive (individual or bulk check-in)  
\- Verify Lovable accounts are set up  
\- Direct teams to their assigned venue

**What participants see:**  
\- **Students:** "My Team" page shows their Build Day venue (building + room)  
\- **Mentors:** "My Assignment" page shows their venue and list of teams

### During the Day: Building


|Time        |Activity               |Who               |
|------------|-----------------------|------------------|
|8:00 AM     |Registration & Check-in|Admin             |
|9:00 AM     |Inauguration           |All               |
|9:30 AM     |Building begins        |Students at venues|
|All Day     |Mentors guide teams    |Mentors at venues |
|5:00 PM     |Building ends          |All               |
|5:00-6:00 PM|Submit projects        |Students          |


### Submission (End of Build Day)

Students submit their project:  
1\. Go to Event → **"Submit Your Project"**  
2\. Fill:  
\- **App Name** (required)  
\- **GitHub Repo URL** (required, must start with `https://github.com/`)  
\- **Live App URL** (the deployed Lovable app)  
\- **Description** of what they built  
\- **Category** (from event categories)  
3\. Submit

**Deadline:** Submissions close 1 hour after event end time (server-enforced).

### Evening: Get Real Users & Revenue (Sunday 5 PM → Monday 9 AM)

After submitting, teams have the **evening and night** to:  
\- Share their app with real users  
\- Get people to sign up and use it  
\- Set up payments and get paying customers  
\- Track MRR (Monthly Recurring Revenue)

Teams update their metrics on the **"My Team"** page or **submission form**:  
\- **MRR Amount (₹)** — Monthly recurring revenue  
\- **Paying Users Count** — Number of paying customers  
\- **Proof URLs** — Screenshots of payment dashboards, analytics, user signups

> **This is the real test:** Can you build something people actually pay for in one evening?

* * *

Phase 5: Demo Day (Monday March 9)
----------------------------------

### Metrics Showcase (Not Traditional Judging)

Instead of subjective judging, Appathon 2.0 uses **objective, measurable outcomes.**

Teams are scored on a **Tiered Objectives** system with an **MRR Bonus**.

### Schedule


|Time         |Activity                                |Who                  |
|-------------|----------------------------------------|---------------------|
|9:00 AM      |Teams arrive, final metrics update      |Students             |
|9:15 AM      |Presentations begin (show app + metrics)|Students + Evaluators|
|~12:00 PM    |Presentations end                       |All                  |
|12:00-1:00 PM|Metrics verification                    |Admin                |
|2:00 PM      |Closing ceremony + results              |All                  |


**What participants see:**  
\- **Students:** "My Team" page shows Demo Day venue + presentation time + current tier level  
\- **Evaluators:** Can view submissions with live metrics on the leaderboard

### Scoring: Tiered Objectives + MRR Bonus

#### Base Score: Tier Levels

Every team starts at Level 0 and climbs based on **verifiable outcomes:**


|Tier   |Objective                   |Base Points|What to Prove                     |
|-------|----------------------------|-----------|----------------------------------|
|Level 1|App deployed & working      |10 pts     |Live URL loads, core feature works|
|Level 2|5+ real users signed up     |20 pts     |Screenshot of user list/analytics |
|Level 3|10+ active users            |30 pts     |Analytics showing active sessions |
|Level 4|Any revenue generated       |40 pts     |Payment dashboard showing ₹1+     |
|Level 5|₹100+ MRR or 5+ paying users|50 pts     |Payment proof with amounts        |


> Teams earn the **highest tier they achieve** (not cumulative). Level 5 = 50 pts, not 10+20+30+40+50.

#### MRR Bonus (on top of tier)

Teams that reach Level 4 or 5 get an **MRR bonus:**


|MRR Range  |Bonus Points|
|-----------|------------|
|₹1 – ₹99   |+5 pts      |
|₹100 – ₹499|+10 pts     |
|₹500 – ₹999|+15 pts     |
|₹1,000+    |+20 pts     |


**Total Score** = Tier Base Points + MRR Bonus

**Example:** Team reaches Level 5 (50 pts) with ₹250 MRR → 50 + 10 = **60 points**

#### Proof Requirements


|Claim          |Acceptable Proof                                            |
|---------------|------------------------------------------------------------|
|App deployed   |Live URL that loads                                         |
|Users signed up|Screenshot of user list, Google Analytics, or auth dashboard|
|Active users   |Analytics showing sessions in last 24 hours                 |
|Revenue        |Payment gateway dashboard (Razorpay, Stripe, UPI screenshot)|
|MRR amount     |Payment dashboard showing recurring subscriptions           |


Admins verify proof URLs submitted by teams. Fraudulent claims = disqualification.

* * *

Phase 6: Results & Closing
--------------------------

### Leaderboard

**Page:** Event → **Leaderboard**

*   Ranked list of all submissions by **Total Score** (Tier + MRR Bonus)
*   Tiebreaker: Higher MRR amount wins
*   Top 3 highlighted with gold/silver/bronze styling
*   Shows: Team Name, App Name, Tier Level, MRR, Paying Users, Total Score
*   Filter by category
*   Toggle "Show All" vs "Show Top 10"

### Publish Results

Admin clicks **"Publish Results"** on the Leaderboard page to make results visible to all participants.

### Winner Announcement

Top 3 teams overall (by Total Score) announced at closing ceremony.  
Special recognition for: Highest MRR, Most Users, Best in each Category.

* * *

Page Map
--------

### Student Pages


|Page        |URL                                 |Purpose                        |
|------------|------------------------------------|-------------------------------|
|Event Detail|/startup-studio/events/[id]         |Event info, register button    |
|Register    |/startup-studio/events/[id]/register|Team registration form         |
|My Team     |/startup-studio/events/[id]/my-team |Venue, slot, mentor assignments|
|Submit      |/startup-studio/events/[id]/submit  |Project submission form        |


### Mentor/Evaluator Pages


|Page             |URL                                      |Purpose                   |
|-----------------|-----------------------------------------|--------------------------|
|My Assignment    |/startup-studio/events/[id]/my-assignment|Venue and team assignments|
|Submission Detail|/startup-studio/submissions/[id]         |View submission + metrics |


### Admin Pages


|Page            |URL                                      |Purpose                            |
|----------------|-----------------------------------------|-----------------------------------|
|Registrations   |/startup-studio/events/[id]/registrations|Check-in, stats, Lovable verify    |
|Venues & Mentors|/startup-studio/events/[id]/venues       |Venue setup, staff, team allocation|
|Demo Day        |/startup-studio/events/[id]/demo-day     |Presentation schedule              |
|Leaderboard     |/startup-studio/events/[id]/leaderboard  |Rankings, publish results          |
|Checklists      |/startup-studio/events/[id]/checklists   |Pre/on/post event tasks            |


* * *

Security & Validation Summary
-----------------------------


|Protection           |How                                                                     |
|---------------------|------------------------------------------------------------------------|
|Registration deadline|Server-side check against config.registration_deadline                  |
|Team size (max 5)    |Server-side validation, reads from event config                         |
|No double-teaming    |Server checks if any member already on another team for this event      |
|No duplicate teams   |Server checks if leader already registered a team                       |
|Problem idea quality |Minimum 20 characters, required field                                   |
|GitHub URL required  |Must start with https://github.com/                                     |
|Submission deadline  |Blocked 1 hour after event end_date                                     |
|Metrics integrity    |Only team owner can update metrics, proof URLs required for verification|
|Role-based access    |Admin pages require admin/super_admin role                              |


* * *

Event ID Reference
------------------



* Item: Event ID
  * Value: 572a5836-58a6-4f98-a3f4-92b862dd8080
* Item: Event URL
  * Value: https://myjkkn-omm-dev.vercel.app/startup-studio/events/572a5836-58a6-4f98-a3f4-92b862dd8080
* Item: Platform
  * Value: MyJKKN (Vercel)
* Item: Database
  * Value: Supabase (MyJKKN-Staging)


* * *

_Last updated: March 5, 2026 (v2 — replaced judging with Tiered Objectives + MRR Bonus)_