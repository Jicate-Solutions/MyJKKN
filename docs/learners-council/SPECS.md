# Learners Council Module - Complete Specifications

**Module:** Learners Council (LC)
**Platform:** MyJKKN (Institutional Management System)
**Route:** `/learners-council/...`
**Generated:** 2026-02-12
**Status:** Interview Complete, Ready for Implementation

---

## 1. Executive Summary

The Learners Council module digitalizes JKKN's learner governance system — a two-tier structure spanning 9 institutions with 5,000+ learners. It replaces manual processes (WhatsApp groups, notice boards, paper forms, Insta Solver) with a centralized digital hub for governance, communication, event coordination, and OD management.

### Core Philosophy
JKKN uses progressive terminology reflecting its "India's First Learner-Led Institution" identity:

| Traditional Term | JKKN Term | Used In Module |
|-----------------|-----------|----------------|
| Student | **Learner** | All UI, labels, messages |
| Teacher/Faculty/Professor | **Senior Learner** | All UI, labels, messages |
| Student Council | **Learners Council** | Module name, all references |
| Classroom | **Learning Studio** | Where relevant |
| Teaching | **Learning Facilitation** | Where relevant |

---

## 2. Organizational Structure

### 2.1 Two-Tier Governance

```
JKKN-Wide Learners Council (Tier 1) — 27 Members
├── Executive Leadership (3)
│   ├── Learners General President
│   ├── Learners General Vice President
│   └── Learners General Secretary
├── Institution Presidents (9) — one per institution
│   ├── JKKN Dental College and Hospital
│   ├── JKKN College of Engineering & Technology
│   ├── JKKN College of Pharmacy
│   ├── JKKN College of Allied Health Sciences
│   ├── JKKN College of Arts & Science
│   ├── JKKN College of Nursing
│   ├── JKKN College of Education
│   ├── Nattraja Vidhayalya
│   └── JKKN Matriculation School
├── Functional Portfolio Heads (9) — cross-institutional
│   ├── Academics & Research
│   ├── Sports & Culturals
│   ├── Campus Welfare & Facilities
│   ├── Hostel & Food Services
│   ├── Training & Placements
│   ├── Extension Activities & Industry Relations
│   ├── Digital Governance & MyJKKN
│   ├── Grievance Redressal & Mediation
│   └── Sustainability & Social Responsibility
└── At-Large Representatives (6) — elected by learner body
    ├── Gender balance (min 2 each)
    ├── Stream diversity (healthcare, engineering, arts/science)
    └── Year diversity (first-year to final-year)

YUVA Chapters (Tier 2) — 12 members each × 9 institutions
├── Chapter Leadership
│   ├── Chapter Chair (2nd year UG learner)
│   └── 2 Chapter Co-Chairs (1st year learners)
├── Stakeholders (first 3, fixed)
│   ├── Membership — Chair + 2 Co-Chairs
│   ├── Thalir — Chair + 2 Co-Chairs
│   └── Rural Initiatives — Chair + 2 Co-Chairs
└── Verticals (CRUD configurable)
    ├── Accessibility — Chair + 2 Co-Chairs
    ├── Climate Change — Chair + 2 Co-Chairs
    ├── Entrepreneurship — Chair + 2 Co-Chairs
    ├── Health — Chair + 2 Co-Chairs
    ├── Innovation — Chair + 2 Co-Chairs
    ├── Learning — Chair + 2 Co-Chairs
    ├── Masoom — Chair + 2 Co-Chairs
    ├── Road Safety — Chair + 2 Co-Chairs
    ├── Branding — Chair + 2 Co-Chairs
    ├── Varnam — Chair + 2 Co-Chairs
    ├── Vizha — Chair + 2 Co-Chairs
    └── Sports — Chair + 2 Co-Chairs
```

### 2.2 Key Rules
- **YUVA Chairs** = 2nd year UG learners from respective institution
- **YUVA Co-Chairs** = 1st year learners
- **YUVA Chairs progress to LC** in their subsequent year
- **LC Executive positions rotate every 6 months** via internal election among LC members
- **Verticals are CRUD** — can be added/deleted by admins
- **Stakeholders** (Membership, Thalir, Rural Initiatives) are fixed — same structure as verticals but permanent
- **Senior Learner Advisors** (= Faculty Coordinators) guide but don't vote, veto, or approve

### 2.3 Nine Institutions
1. JKKN Dental College and Hospital
2. JKKN College of Engineering & Technology
3. JKKN College of Pharmacy
4. JKKN College of Allied Health Sciences
5. JKKN College of Arts & Science
6. JKKN College of Nursing
7. JKKN College of Education
8. Nattraja Vidhayalya
9. JKKN Matriculation School

---

## 3. Data Visibility Model

| User Type | Default View | Can Switch To |
|-----------|-------------|---------------|
| Learner (any) | Own institution's YUVA content | LC-wide announcements, events |
| YUVA Member | Own chapter + own vertical | LC-wide view, other chapters |
| LC Member | LC-wide view | Filter by institution |
| Senior Learner Advisor | Own institution's YUVA + LC overview | Full LC view |
| Principal | Own institution + LC overview | Full LC view |
| MD | Full cross-institution view | Filter by institution |

---

## 4. Feature Specifications

### 4.1 LC/YUVA Structure Management

**Purpose:** Manage the organizational structure, terms, positions, and member assignments.

#### Sub-features:
1. **Term Management**
   - Track terms with start/end dates (LC executive rotates every 6 months)
   - Position history — who held which role, when
   - Archived decisions per term
   - Handover workflows when terms change

2. **YUVA Chapter Management**
   - One chapter per institution (9 total)
   - Chapter Chair + 2 Co-Chairs per chapter
   - CRUD verticals (add/remove/rename)
   - Each vertical has Chair + 2 Co-Chairs
   - 3 fixed stakeholders (Membership, Thalir, Rural Initiatives)

3. **LC Member Management**
   - 27 positions across 4 categories
   - Member profiles linked to MyJKKN user accounts
   - Role assignment and history tracking
   - Progression tracking (YUVA Chair → LC Member)

4. **Portfolio Heads**
   - 9 cross-institutional governance domains
   - Annual rotation across institutions
   - Separate from YUVA verticals

#### Permissions:
| Action | Who Can Do It |
|--------|--------------|
| Create/edit terms | MD, Principal, LC Executive |
| Assign LC positions | MD, Principal |
| Manage YUVA chapters | Principal (own institution), LC Executive |
| CRUD verticals | MD, Principal, LC Executive |
| Assign YUVA positions | Principal, LC Institution President |
| View structure | All authenticated users |

---

### 4.2 Communication Hub

**Purpose:** Centralized communication platform for announcements, polls, forums, and internal chat.

#### Sub-features:

1. **Announcements**
   - Created by: LC Executive members + YUVA Chapter Chairs
   - Scope: Institution-level (YUVA chair) OR LC-wide (LC executive)
   - Required fields: Title, message, urgency level, target audience
   - Workflow: Draft → Review (by senior council member) → Publish
   - Distribution: In-app notification + dashboard feed
   - Track read/engagement rates
   - Types: General, Event, Urgent, Circular

2. **Polls & Surveys**
   - Simple yes/no votes + multiple choice surveys
   - Created by: LC/YUVA chairs
   - Scope: Organization-wide, institution-specific, or vertical-specific
   - Voting visibility: Anonymous or named (configurable per poll)
   - Results: Demographic breakdown available
   - Error handling: Pause on malfunction, resume after health check

3. **Discussion Forums**
   - Topic-based forums organized by category
   - Only verified learners can create discussion topics
   - Features: Like, share, save for later, threaded replies
   - Moderation: Pre-approval required + community reporting + automated keyword filtering
   - Moderators: System admins + designated moderators can edit/delete posts
   - Flagging: User reports + keyword detection + heated discussion detection
   - Escalation: Flagged issues go to community mediation

4. **Internal Chat (Phase 1: LC/YUVA members only)**
   - ~150 users in Phase 1
   - 1:1 direct messages between council members
   - Group channels (per chapter, per vertical, per portfolio)
   - Built on Supabase Realtime
   - Phase 2: Expand to all learners

5. **Notifications**
   - In-app notifications for all LC activities
   - Member-controlled notification preferences
   - Categories: Announcements, events, approvals, chat, mentions

#### Dashboard Sections:
- Announcements feed (categorized tabs)
- Active polls
- Discussion forums
- Notifications panel

---

### 4.3 Event Coordination

**Purpose:** Structured event lifecycle from proposal to post-event reporting.

#### Event Lifecycle:
```
Proposal → Review → Approve → Publish → Sign-up → Execute → Report
```

1. **Event Proposal**
   - Any authenticated learner can propose events
   - Required: Title, description, type, date(s), venue requirements, expected participants
   - Auto-check venue availability via Resource Management module integration

2. **Review & Approval (Tiered)**
   - Campus-level events: LC members review + approve
   - Inter-campus events: Principal-level approval required
   - Institution-wide events: MD approval required
   - Approval displayed as list with progress bars

3. **Publication & Sign-up**
   - Approved events published to event calendar
   - Structured learner sign-ups with capacity limits
   - Participation tracking (registered → attended → feedback)

4. **Execution & Coordination**
   - LC members see coordination tasks, deadlines, participant status
   - Coordinator override: Can modify event details (date, venue, timing)
   - Automatic notification to registered participants on changes

5. **Post-Event**
   - Attendance confirmation
   - Feedback collection
   - Post-event report/documentation
   - Data exports for accreditation

#### Integration Points:
- **Resource Management** — venue/facility booking, availability checks, conflict detection
- **Academic (Attendance)** — auto-mark OD for participants with approved events
- **Academic (Timetables)** — check for scheduling conflicts

#### UI:
- Shared event calendar view accessible to all roles
- Role-specific actions layered on calendar
- Learners: See upcoming events, propose, sign up
- LC members: Coordination tasks, deadlines, participant status
- Principals/MD: Events awaiting approval with impact summaries

#### Edge Cases:
- **Inter-institution events** — coordinated across YUVA chapters, shared visibility, unified participation tracking
- **Resource conflicts** — early detection during review phase, proactive flagging

#### Success Metrics:
- Reduced proposal-to-approval time
- Fewer last-minute resource conflicts
- Higher workflow completion rates

---

### 4.4 Permission & OD Management

**Purpose:** Automate OD (Official Duty) and permission approval workflows for LC activities.

#### Current State: Paper form system → Digital automated workflows

#### Key Features:

1. **Smart Form Submission**
   - Learner describes request in simple language
   - System suggests category, priority, and routing (rule-based, AI-ready)
   - Learner confirms or edits suggestions
   - Auto-routes to appropriate approver(s)

2. **Configurable Approval Chains**
   - Approval workflow is configurable per institution
   - Support for sequential and parallel approvals
   - Example chain: Learner → YUVA Chair → Class Advisor → HOD → Principal
   - Inter-institution events may add MD to the chain
   - Matrix authority: Multiple approvers can act in parallel

3. **Workflow Tracking UI**
   - Visual workflow showing: completed approvals, pending, current approver
   - Automated reminders and status updates
   - Both requesters and approvers see full transparency

4. **Smart Correction (Recovery)**
   - If auto-routed to wrong approver, LC members can reassign with reason
   - Both learner and new assignee get notified
   - Prevents "manual with extra steps" problem

5. **Academic Integration**
   - Check conflicts with exams, mandatory classes, academic deadlines
   - Approved ODs auto-update attendance records
   - Reflected in academic dashboards

#### Permissions:
| Role | Capability |
|------|-----------|
| Any Learner | Submit OD/permission requests for LC activities |
| YUVA Chair | First-level review for chapter events |
| Senior Learner Advisor | Review and recommend (no approval power) |
| HOD | Approve department-level ODs |
| Principal | Approve institution-level and inter-campus ODs |
| MD | Approve institution-wide ODs |

#### Edge Cases:
- Cross-campus permissions (learner at one institution attending event at another)
- Bulk OD for team events (one request for multiple learners)

#### Success Metrics:
- Workflow completion rates (% of requests completing full chain without getting stuck)
- Average approval turnaround time
- Misrouting rate (how often smart correction is needed)

---

### 4.5 Selection & Elections

**Purpose:** Manage YUVA chair/co-chair selection, LC progression, and executive rotation.

#### Three Selection Processes:

1. **YUVA Chair/Co-Chair Selection**
   - Nominations received from learners
   - Candidates interviewed by PAST YEAR LC members
   - Selection based on interest shown during interview
   - Chairs = 2nd year UG; Co-Chairs = 1st year
   - Interview tracking: Schedule, conduct, score, select

2. **LC Member Progression**
   - Past YUVA chapter/vertical chairs nominated for LC
   - Selected based on past performance as YUVA chair
   - Each institution president comes from that institution's past YUVA leadership
   - Track progression: YUVA Co-Chair → YUVA Chair → LC Member

3. **LC Executive Rotation (every 6 months)**
   - 4 executive positions (President, VP, Secretary, +1)
   - LC members self-nominate for available positions
   - Internal election among LC members
   - Full term management: start/end dates, position history, archived decisions

#### Features:
- Nomination submission forms
- Interview scheduling and tracking
- Scoring/evaluation (hybrid: interviewer assessment + criteria-based)
- Automatic notifications to reviewers after interview completion
- Results processing: Auto-submit to council, delayed results
- Election management: Nominations, voting, results for executive rotation
- Term history and handover documentation

---

### 4.6 Issue Management (Grievance Enhancement)

**Purpose:** Enhance the existing Grievance module and provide an LC-specific view for learner issues.

**Architecture Decision:** The Grievance module stays standalone and gets enhanced. LC module provides a filtered view of LC-relevant issues.

#### Enhancements to Existing Grievance Module:
1. **AI-Ready Categorization** — Rule-based now, pluggable AI later
   - Keyword matching for auto-category suggestion
   - Configurable routing rules
   - Manual override by LC members

2. **LC-Specific Categories** — Add LC domains to grievance categories
   - Campus welfare, facilities, hostel/food, events, etc.

3. **Kanban Board View** — For LC members managing issues
   - Columns: New → In Progress → Awaiting Response → Resolved → Closed

4. **Bulk Similar Issues** — Detect duplicate/similar issues
   - Merge reports, show collective impact
   - Rule-based similarity detection (AI-ready)

5. **OKR Integration** — Issue resolution contributes to LC member OKRs
   - Track response time, resolution rate, impact
   - Feed into institutional OKRs

6. **LC Dashboard View** — Within LC module
   - Learners: "My Issues" with status and timeline
   - LC Members: Prioritized assigned issues with deadlines
   - Coordinators: Aggregated volume, resolution timelines, workload distribution

#### Permissions (Tiered Access):
| Role | Visibility |
|------|-----------|
| Learner | Own submissions only |
| LC Member | Issues assigned to them + department domain |
| Senior Coordinator | Full visibility, resolve misrouting, escalation support |
| Senior Learner/Staff/Admin | Full grievance module (not LC-scoped) |

---

## 5. Module Integration Map

```
┌─────────────────────────────────┐
│     Learners Council Module     │
│     /learners-council/          │
└─────────────┬───────────────────┘
              │
    ┌─────────┼──────────┐
    │         │          │
    ▼         ▼          ▼
┌────────┐ ┌─────────┐ ┌──────────────┐
│Academic│ │Resource │ │  Grievance   │
│Module  │ │Mgmt     │ │  Module      │
├────────┤ ├─────────┤ ├──────────────┤
│Attend. │ │Venues   │ │Tickets       │
│Timetbl │ │Booking  │ │SLA           │
│Leaves  │ │Calendar │ │Escalations   │
│Exams   │ │Approvals│ │Analytics     │
└────────┘ └─────────┘ └──────────────┘
              │
              ▼
         ┌─────────┐
         │   OKR   │
         │ Module  │
         └─────────┘
```

**NOT in scope:** AI Production House (handled by Solutions Hub module)

---

## 6. Role Access Matrix

| Feature | MD | Principal | HOD | Sr. Learner Advisor | LC Executive | LC Member | YUVA Chair | YUVA Co-Chair | Learner |
|---------|:--:|:---------:|:---:|:-------------------:|:------------:|:---------:|:----------:|:-------------:|:-------:|
| **Structure: View** | Full | Own inst + LC | Own dept | Own inst | Full | Full | Own chapter | Own vertical | Own inst |
| **Structure: Manage** | Full | Own inst | - | - | LC-level | - | Own chapter | - | - |
| **CRUD Verticals** | Yes | Yes | - | - | Yes | - | - | - | - |
| **Announcements: Create** | Yes | Yes | - | - | Yes | - | Yes | - | - |
| **Announcements: Approve** | Yes | Yes | - | - | Yes | - | - | - | - |
| **Polls: Create** | Yes | Yes | - | - | Yes | - | Yes | - | - |
| **Polls: Vote** | - | - | - | - | Yes | Yes | Yes | Yes | Yes |
| **Forums: Create Topic** | - | - | - | - | Yes | Yes | Yes | Yes | Yes* |
| **Forums: Moderate** | Yes | Yes | - | - | Yes | Designated | - | - | - |
| **Chat: Access** | - | - | - | Advisor role | Yes | Yes | Yes | Yes | Phase 2 |
| **Events: Propose** | - | - | - | - | Yes | Yes | Yes | Yes | Yes |
| **Events: Approve (Campus)** | Yes | Yes | - | Recommend | Yes | - | - | - | - |
| **Events: Approve (Inter)** | Yes | Yes | - | - | - | - | - | - | - |
| **Events: Approve (Inst-wide)** | Yes | - | - | - | - | - | - | - | - |
| **Events: Coordinate** | - | - | - | Support | Yes | Yes | Yes | Yes | - |
| **OD: Request** | - | - | - | - | Yes | Yes | Yes | Yes | Yes |
| **OD: Approve** | Yes | Yes | Yes | Recommend | Config. | Config. | Config. | - | - |
| **OD: Configure Chain** | Yes | Yes | - | - | - | - | - | - | - |
| **Selection: Conduct** | - | Yes | - | Support | Yes | Past LC | - | - | - |
| **Selection: Nominate** | - | - | - | - | Self | Self | Self | Self | Self |
| **Issues: Submit** | - | - | - | - | Yes | Yes | Yes | Yes | Yes |
| **Issues: Manage (LC)** | Oversight | Oversight | - | - | Full | Assigned | - | - | - |
| **Dashboard: LC Overview** | Full | Full | Dept view | Inst view | Full | Own tasks | Chapter | Vertical | Summary |

*Verified learners only for forum topic creation

---

## 7. URL Structure

```
/learners-council/                          # LC Dashboard
/learners-council/structure/                # Org structure overview
/learners-council/structure/lc/             # LC member management
/learners-council/structure/yuva/           # YUVA chapters
/learners-council/structure/yuva/[id]/      # Specific chapter
/learners-council/structure/verticals/      # CRUD verticals
/learners-council/structure/terms/          # Term management
/learners-council/communication/            # Communication Hub
/learners-council/communication/announcements/
/learners-council/communication/polls/
/learners-council/communication/forums/
/learners-council/communication/chat/       # Internal chat (Phase 1)
/learners-council/events/                   # Event Coordination
/learners-council/events/calendar/          # Calendar view
/learners-council/events/proposals/         # Event proposals
/learners-council/events/[id]/              # Event detail
/learners-council/od/                       # OD & Permissions
/learners-council/od/requests/              # My requests / all requests
/learners-council/od/approvals/             # Pending approvals
/learners-council/od/settings/              # Approval chain config
/learners-council/selection/                # Selection & Elections
/learners-council/selection/nominations/
/learners-council/selection/interviews/
/learners-council/selection/elections/
/learners-council/issues/                   # LC Issue view (links to Grievance)
/learners-council/settings/                 # Module settings
```

---

## 8. Database Schema (High-Level)

### New Tables Required:

| Table | Purpose |
|-------|---------|
| `lc_terms` | Term periods with start/end dates |
| `lc_positions` | Position definitions (President, VP, etc.) |
| `lc_members` | Member-position assignments per term |
| `lc_position_history` | Historical record of all position holders |
| `yuva_chapters` | One per institution |
| `yuva_verticals` | CRUD configurable verticals |
| `yuva_vertical_members` | Chair/co-chair assignments per vertical |
| `lc_announcements` | Announcements with scope and status |
| `lc_polls` | Polls and surveys |
| `lc_poll_options` | Poll answer options |
| `lc_poll_votes` | Individual votes |
| `lc_forum_topics` | Discussion forum topics |
| `lc_forum_posts` | Posts within topics |
| `lc_forum_reactions` | Likes, saves, flags |
| `lc_chat_channels` | Chat channels/groups |
| `lc_chat_messages` | Chat messages (Realtime) |
| `lc_chat_members` | Channel membership |
| `lc_events` | Event proposals and details |
| `lc_event_participants` | Registration and attendance |
| `lc_event_approvals` | Approval chain tracking |
| `lc_od_requests` | OD/permission requests |
| `lc_od_approval_chains` | Configurable approval workflows |
| `lc_od_approvals` | Individual approval actions |
| `lc_nominations` | Selection nominations |
| `lc_interviews` | Interview scheduling and scoring |
| `lc_elections` | Election instances |
| `lc_election_votes` | Election votes |
| `lc_notifications` | Module-specific notifications |

### Existing Tables Referenced (Read Only):
- `institutions` — institution list
- `users` / `profiles` — user accounts
- `daily_attendance` — for OD auto-marking
- `timetables` / `periods` — for conflict checking
- `resources` / `reservations` — venue booking
- `grievance_tickets` — issue management
- `objectives` / `key_results` — OKR integration

---

## 9. Technical Architecture

### Stack:
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Realtime + Edge Functions)
- **Chat:** Supabase Realtime (Phase 1: ~150 users)
- **State:** React Query (TanStack Query)
- **5-Layer Pattern:** Types → Database → Services → Hooks → Pages

### AI-Ready Architecture:
- All categorization/routing through a `ClassifierService` interface
- Phase 1: `RuleBasedClassifier` implementation (keyword matching + configurable rules)
- Future: `AIClassifier` implementation (LLM-powered) can replace without refactoring
- Service interface: `classify(input: string) → { category, priority, route_to }`

### Multi-Institution Handling:
- All LC tables include `institution_id` where institution-scoped
- LC-wide tables (lc_terms, lc_members, lc_positions) are NOT institution-scoped
- YUVA tables ARE institution-scoped
- Views/queries filter by user's institution by default, with toggle for LC-wide

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Announcement read rate | >80% within 24 hours |
| Event proposal-to-approval time | <48 hours for campus events |
| OD workflow completion rate | >95% complete without getting stuck |
| Issue first response time | <24 hours |
| Issue resolution rate | >85% within SLA |
| Poll participation rate | >60% of eligible voters |
| Chat adoption (Phase 1) | >80% of LC/YUVA members active |

---

## 11. Key Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | One unified LC across all institutions | Per real-world JKKN structure |
| 2 | JKKN terminology (Learner/Senior Learner) | LC module leads the terminology shift |
| 3 | Grievance stays standalone, LC links to it | Grievance serves all users (not just learners) |
| 4 | Integrate with Resource Management for venues | Venue booking already exists, no duplication |
| 5 | AI-ready architecture, rule-based Phase 1 | Pragmatic — reliable now, upgradeable later |
| 6 | Chat for LC/YUVA only in Phase 1 | ~150 users manageable; expand in Phase 2 |
| 7 | Configurable approval chains | Each institution may have different workflows |
| 8 | Full term management | Track position history, enable handovers |
| 9 | Verticals are CRUD | Flexibility to add/remove as needed |
| 10 | Filtered default view | Institution-scoped by default, toggle to LC-wide |
| 11 | AI Production House NOT in LC scope | Handled by existing Solutions Hub module |
| 12 | LC Portfolio Heads separate from YUVA Verticals | Different structures serving different purposes |
