---
title: "Spec: Role Card + Skill Bank — Appathon 2.0 Submission"
date: 2026-03-08
status: ready-for-dev
priority: urgent — must be live before Monday 9:15 AM submission deadline
tags: [spec, appathon, skill-bank, myjkkn, role-card]
---

# Spec: Role Card + Skill Bank

**What:** Add individual Role Cards to the Appathon 2.0 submission flow so each team member declares their role and tags teammates' contributions.

**Why:** Current submission is team-level only. We need individual-level data to:
1. Select members for 300 Solve for 100 teams
2. Build a permanent JKKN Skill Bank queryable across future initiatives

**Deadline:** Must be live before Monday March 9, 9:15 AM (submission freeze)

---

## The 6 Roles

These are the predefined role options used across the form. Store as an enum or constants.

| Role ID | Label | Description |
|---------|-------|-------------|
| `problem_finder` | Problem Finder | Found the problem worth solving, talked to users |
| `prompt_architect` | Prompt Architect | Built the app in Lovable through AI prompting |
| `design_shaper` | Design Shaper | Shaped UI/UX, visual quality, user experience |
| `user_getter` | User Getter | Marketed the app, got people to sign up and use it |
| `deal_closer` | Deal Closer | Got someone to pay, handled pricing/payments |
| `team_captain` | Team Captain | Coordinated the team, managed time, kept things on track |

---

## User Flow

### When: At submission time (not during building)

After the team enters their team-level metrics (users, active users, revenue, proof URLs), each team member fills in their Role Card.

### Flow:

```
Team submits metrics (existing flow)
    │
    ▼
"Now each team member fills in their Role Card" (new step)
    │
    ├── Member 1 fills Role Card
    ├── Member 2 fills Role Card
    ├── Member 3 fills Role Card
    └── ... (for each team member)
    │
    ▼
Submission complete
```

### Per-Person Role Card — 3 Fields

Each team member sees a card with their name and fills in:

**Field 1 — "My role(s)"**
- Type: Checkbox (multi-select)
- Options: The 6 roles listed above
- Validation: Must pick at least 1, max 2
- Label: "What was your main role in the team? Pick 1-2."

**Field 2 — "What I'm most proud of"**
- Type: Single-line text input
- Max length: 150 characters
- Validation: Required, min 10 characters
- Label: "In one sentence, what are you most proud of from this Appathon?"
- Placeholder: "e.g., I got 15 classmates to sign up and use the app"

**Field 3 — "Tag your teammates"**
- Type: For each other team member, a dropdown with the 6 roles
- Validation: Required for each teammate
- Label: "What was [teammate name]'s biggest contribution?"
- Shows one dropdown per teammate (excluding self)

### Example UI (3-person team: Arun, Priya, Deepa)

**Arun's Role Card:**
```
┌─────────────────────────────────────────────┐
│  Arun's Role Card                           │
│                                             │
│  My role(s): ☑ Prompt Architect ☑ Design    │
│                                             │
│  What I'm most proud of:                    │
│  [Built the entire app in 4 hours using___] │
│                                             │
│  Priya's biggest contribution:              │
│  [▼ User Getter                           ] │
│                                             │
│  Deepa's biggest contribution:              │
│  [▼ Problem Finder                        ] │
└─────────────────────────────────────────────┘
```

---

## Data Model

### New Table: `appathon_role_cards`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Auto-generated |
| `submission_id` | uuid, FK | Links to the team's Appathon submission |
| `team_id` | uuid, FK | Links to the team |
| `learner_id` | uuid, FK | The person filling this card |
| `self_roles` | text[] | Array of role IDs they selected (1-2) |
| `proud_of` | text | Free-text, max 150 chars |
| `created_at` | timestamptz | Auto |

### New Table: `appathon_peer_tags`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Auto-generated |
| `role_card_id` | uuid, FK | Links to the role card entry |
| `tagger_id` | uuid, FK | Person doing the tagging (same as role_card.learner_id) |
| `tagged_id` | uuid, FK | Teammate being tagged |
| `tagged_role` | text | Single role ID from the 6 options |
| `created_at` | timestamptz | Auto |

### Indexes

- `appathon_role_cards(team_id)` — query all role cards for a team
- `appathon_role_cards(learner_id)` — query a learner's role card
- `appathon_peer_tags(tagged_id)` — query all tags received by a person
- `appathon_peer_tags(tagged_role)` — query all people tagged with a specific role

### RLS (Row Level Security)

- Learners can INSERT their own role card (once per submission)
- Learners can READ their own team's role cards
- Admins/evaluators can READ all role cards
- No UPDATE or DELETE for learners (submitted = final)

---

## Validation Rules

| Rule | Details |
|------|---------|
| One card per person per submission | Prevent duplicates. Check `(submission_id, learner_id)` unique |
| At least 1 self-role selected | Cannot submit empty |
| Max 2 self-roles | Prevent "I did everything" |
| All teammates must be tagged | If team has 4 members, each person tags the other 3 |
| "Proud of" is required | Min 10 characters, max 150 |
| Team submission must exist first | Role cards are added AFTER team metrics are submitted |

---

## Queries the Skill Bank Enables

These are the queries that will be run after the Appathon. Design the data model to support them efficiently.

```sql
-- Find all User Getters across all colleges
SELECT l.name, l.department, l.college
FROM appathon_peer_tags pt
JOIN appathon_role_cards rc ON pt.role_card_id = rc.id
JOIN learners l ON pt.tagged_id = l.id
WHERE pt.tagged_role = 'user_getter'
GROUP BY pt.tagged_id
HAVING COUNT(*) >= 2;  -- tagged by 2+ teammates

-- Find skill distribution for a specific team
SELECT rc.learner_id, l.name, rc.self_roles,
  array_agg(pt.tagged_role) as peer_tags
FROM appathon_role_cards rc
JOIN learners l ON rc.learner_id = l.id
LEFT JOIN appathon_peer_tags pt ON pt.tagged_id = rc.learner_id
WHERE rc.team_id = 'xxx'
GROUP BY rc.learner_id, l.name, rc.self_roles;

-- Find teams with skill gaps (no User Getter)
SELECT t.team_name, t.id
FROM teams t
WHERE t.id NOT IN (
  SELECT DISTINCT rc.team_id
  FROM appathon_role_cards rc
  WHERE 'user_getter' = ANY(rc.self_roles)
);

-- Peer validation score: how many teammates confirmed each role
SELECT l.name, pt.tagged_role, COUNT(*) as confirmations
FROM appathon_peer_tags pt
JOIN learners l ON pt.tagged_id = l.id
GROUP BY l.name, pt.tagged_role
ORDER BY confirmations DESC;
```

---

## UI Notes

- Keep it visually clean — one card per person, not a giant form
- Show a progress indicator: "2 of 4 team members completed"
- Mobile-first — most learners will submit from phones
- The 6 role options should show the label only (not the description) in dropdowns/checkboxes to save space. Show description as tooltip or help text on hover/tap
- Success state: "Your Role Card is submitted!" with a summary of what they entered
- Team submission should show completion status: which members have filled their Role Card

---

## What NOT to Build

- No admin dashboard for this yet — evaluators will query Supabase directly for now
- No editable Skill Card profile page — that's a Solve for 100 feature, not Appathon
- No analytics or visualizations — raw data is enough for Day 1
- No "What I want to learn next" field — save for Solve for 100 onboarding

---



---

## Success Criteria

- [ ] >80% of submitting teams have all members' Role Cards completed
- [ ] Peer tags are consistent (at least 2 teammates agree on a person's role in >60% of cases)
- [ ] Data is queryable: can answer "who are the User Getters in Engineering College?" within 1 minute
- [ ] Total time added to submission flow: under 2 minutes per person

---

*Spec created: March 8, 2026*
*Context: JKKN Appathon 2.0 — Powered by She Builds (Lovable x Anthropic) x JKKN Institutions*
