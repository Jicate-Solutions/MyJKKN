# Learners Council — Corrected Structure Spec

**Date:** 2026-04-13
**Source:** Director interview (correcting V3 spec errors)
**Status:** Confirmed by Director

---

## Problem Statement

The LC module was built from an outdated V3 spec (27-member model with Institution Presidents, Portfolio Heads, and At-Large reps). The actual governance structure is different. This spec documents the CORRECT structure as confirmed by the Director.

---

## The Correct Structure

### JKKN Learners Council (Tier 1) — 27 Members

**Composition:** 9 institutions × 3 representatives = 27 members

**How reps are selected:** Yuva/Thalir EC Chairs from the PREVIOUS year get promoted to the LC. Specifically, from each institution's pool of 13 chairs (1 chapter + 10 vertical + 2 stakeholder chairs), 3 are selected to represent on the LC in the SUBSEQUENT year. They do NOT serve on both simultaneously.

**Leadership positions (elected FROM the 27):**

| Position | Selection | Term |
|----------|-----------|------|
| President | Elected by the 27 members | 6 months (rotating) |
| Vice President | Elected by the 27 members | 6 months (rotating) |
| Secretary | Elected by the 27 members | 6 months (rotating) |
| Treasurer | Elected by the 27 members | 6 months (rotating) |

These 4 are NOT additional positions — they are 4 of the 27 who hold leadership titles. Total remains 27.

**There is NO "Institution President" role.** Each institution simply sends 3 reps. No one rep "leads" their institution's delegation.

### 9 Portfolio Committees (Overlapping Membership)

LC members serve on portfolio committees. Members can sit on multiple committees. Committees have varying sizes.

| # | Portfolio | Focus |
|---|-----------|-------|
| 1 | Academics & Research | Curriculum feedback, research opportunities |
| 2 | Sports & Culturals | Inter-institutional sports, cultural events |
| 3 | Campus Welfare & Facilities | Infrastructure, general welfare |
| 4 | Hostel & Food Services | Residential, dining, accommodation |
| 5 | Training & Professional Development | Skill development, workshops |
| 6 | Placement & Career Opportunities | Industry connections, internships |
| 7 | Extension Activities & Industry Connect | NSS, community service, partnerships |
| 8 | Campus Ambassador & External Relations | PR, social media, branding |
| 9 | Grievance Redressal & Learner Welfare | Complaints, mediation, support |

### 9 Institutions

| # | Institution | Type | On MyJKKN DB? |
|---|-------------|------|---------------|
| 1 | JKKN Dental College and Hospital | College | Yes |
| 2 | JKKN College of Engineering and Technology | College | Yes |
| 3 | JKKN College of Pharmacy | College | Yes |
| 4 | JKKN College of Allied Health Sciences | College | Yes |
| 5 | JKKN College of Arts and Science | College | Yes (split: Aided + Self) |
| 6 | JKKN College of Nursing and Research | College | Yes |
| 7 | JKKN College of Education | College | Yes |
| 8 | Nattraja Vidhayalya (Public School) | School | NO — needs adding |
| 9 | JKKN Matriculation School | School | NO — needs adding |

**Note:** "Arts and Science" is ONE institution in the LC context (1 set of 3 reps), even though MyJKKN splits it into Aided + Self. Confirm with Director which gets the 3 reps, or if they share.

---

## Yuva EC (Tier 2, Colleges) — 39 Members per Chapter

One Yuva EC per college (7 colleges). **Not** the schools — schools have Thalir ECs.

### Composition: 39 Members

| Group | Count | Roles |
|-------|-------|-------|
| Chapter Leadership | 3 | 1 Chair + 2 Co-Chairs |
| 10 Vertical Leaders | 30 | Each vertical: 1 Chair + 2 Co-Chairs |
| 2 Stakeholder Leaders | 6 | Thalir: 1 Chair + 2 Co-Chairs; Rural: 1 Chair + 2 Co-Chairs |
| **Total** | **39** | |

**Membership stakeholder is NOT a separate group** — the Chapter Chair handles Membership responsibilities.

### The 10 Verticals

#### Nation Building (5)
1. MASOOM (Child Safety)
2. Climate Action
3. Road Safety
4. Health & Wellness
5. Accessibility

#### Youth Leadership (5)
6. Learning
7. Entrepreneurship
8. Innovation
9. Sports (Cricket is BANNED by Director)
10. Branding

### The 2 Stakeholder Groups (with leadership)

| Stakeholder | Who they serve | Leadership |
|-------------|---------------|------------|
| **Thalir** | School students (cross-vertical) | 1 Chair + 2 Co-Chairs |
| **Rural (Ri)** | Community/villages (cross-vertical) | 1 Chair + 2 Co-Chairs |

**Membership (M)** is handled by the Chapter Chair directly — no separate Membership leadership.

### YUVA Chair Rules
- **Chairs** = 2nd year UG learners
- **Co-Chairs** = 1st year learners
- Chairs from current year are eligible for LC promotion in subsequent year

---

## Thalir EC (Tier 2, Schools) — 39 Members per Chapter

Same structure as Yuva but for the 2 schools:
- Nattraja Vidhayalya
- JKKN Matriculation School

Same 10 verticals, same 2 stakeholder groups, same 39-member composition.

---

## Selection / Progression Flow

```
Year 1: Learner joins a Yuva/Thalir vertical as Co-Chair (1st year)
Year 2: Co-Chair becomes Vertical Chair (2nd year UG)
Year 3: From 13 chairs (1 chapter + 10 vertical + 2 stakeholder),
         3 are selected per institution → promoted to LC (27 total)
         LC members elect President, VP, Secretary, Treasurer
         Leadership rotates every 6 months
```

---

## What Was WRONG in the V3 Spec (What We Built)

| V3 (Built — WRONG) | Actual (Correct) |
|--------------------|-----------------|
| 27 = 3 executive + 9 institution presidents + 9 portfolio heads + 6 at-large | 27 = 9 institutions × 3 reps |
| "Learners General President" | **President** (elected from 27) |
| "Institution President" role | **No such role** — just 3 reps per institution |
| "Portfolio Head" as a position | **Portfolio Committees** with overlapping membership |
| "At-Large Representatives" | **No such thing** — all 27 are institutional reps |
| 12 members per Yuva EC | **39 members** per Yuva EC |
| 15 verticals | **10 verticals** (5 Nation Building + 5 Youth Leadership) |
| 3 stakeholders with leadership each | **2 stakeholders** with leadership (Membership handled by Chapter Chair) |
| Nattraja + Matriculation missing | **Must be added** to institutions |

---

## Data Model Changes Required

### lc_positions table
- Remove categories: `institution_president`, `at_large`
- Keep: `executive` (President, VP, Secretary, Treasurer)
- Change: `portfolio_head` → `portfolio_committee` (or just track via committee membership)
- Add: `representative` category for the 27 reps

### lc_members table
- No change needed (still links user → position → term)

### institutions table
- Add: Nattraja Vidhayalya
- Add: JKKN Matriculation School
- Clarify: Arts & Science (Aided vs Self) — do they share 3 LC reps?

### yuva_verticals table
- Reduce from 15 to 10
- Remove: Varnam, Vizha (or mark inactive)
- Keep 2 stakeholders: Thalir, Rural (Membership removed)

### Yuva EC size
- All hooks/services need to handle 39 members, not 12

---

## Open Questions

1. **Arts & Science split:** Does Aided and Self share one set of 3 LC reps, or do they each get 3 (making total 30)?
2. **Schools on MyJKKN:** Director says both schools are already there but they're NOT in the production institutions table. Were they removed? Need to re-add?
3. **Portfolio committee assignments:** Is there a formal process, or does the President assign members to committees?
