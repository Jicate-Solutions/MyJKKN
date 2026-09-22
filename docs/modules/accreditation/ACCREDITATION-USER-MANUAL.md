# MyJKKN Accreditation & Compliance Module — End-User Manual

**Module path:** `/accreditation`
**Audience:** IQAC coordinators, Principals, HODs, Senior Learners named as metric owners, committee members, the Accreditation Officer, and Director's office team members.
**Version:** 2026-09-18 (written from the live codebase on that date).

---

## Table of contents

1. [Before you start — what this module is](#1-before-you-start)
2. [Who can see what — roles and permissions](#2-who-can-see-what)
3. [Key concepts you must understand](#3-key-concepts)
4. [Hub](#4-hub)
5. [My Gaps](#5-my-gaps)
6. [IQAC](#6-iqac)
7. [Coverage](#7-coverage)
8. [Manage](#8-manage)
   - 8.1 Metrics · 8.2 Grievance Categories · 8.3 MoUs & Grants · 8.4 Utility Readings · 8.5 Assign Owners · 8.6 Awarding Bodies
9. [NAAC](#9-naac)
   - 9.1 Overview · 9.2 AI Narratives · 9.3 Assign Narrative Owners · 9.4 IQAC Committees · 9.5 DCF / AQAR Export · 9.6 Grievance · 9.7 Surveys (Consent, 8.4 Export, Employer & Alumni Feedback)
10. [NIRF](#10-nirf)
11. [NBA](#11-nba)
12. [QS](#12-qs)
13. [DCI](#13-dci)
14. [PCI](#14-pci)
15. [INC](#15-inc)
16. [NCTE](#16-ncte)
17. [AICTE](#17-aicte)
18. [UGC](#18-ugc)
19. [CAC — Cluster Academic Council](#19-cac)
20. [Appendix A — Automatic jobs and when they run](#appendix-a--automatic-jobs-and-when-they-run)
21. [Appendix B — Glossary](#appendix-b--glossary)
22. [Appendix C — Frequently asked questions](#appendix-c--frequently-asked-questions)

---

## 1. Before you start

### 1.1 What this module is

The Accreditation module is **one place to see what every awarding, ranking and regulatory body asks of JKKN, and how much of it the platform can already answer.**

JKKN answers to ten outside bodies:

| Body | Full name | What it does | Cycle | Applies to |
|---|---|---|---|---|
| NAAC | National Assessment and Accreditation Council | Rates the whole college (Binary framework, 10 attributes, 900 marks) | 3-year | All 8 colleges |
| UGC | University Grants Commission | Overall regulator — 2(f)/12(B), anti-ragging, grievance, fees, welfare | Continuous | All 8 colleges |
| NIRF | National Institutional Ranking Framework | Ministry of Education annual ranking (5 parameters) | Annual | All 8 colleges |
| QS | QS World University Rankings | World ranking (aspirational, Phase 2+) | Annual | Later |
| NBA | National Board of Accreditation | Accredits one engineering programme at a time (Tier-II, 1000 points) | 3-year per programme | Engineering programmes |
| AICTE | All India Council for Technical Education | Annual Extension of Approval for technical programmes | Annual | Engineering + Pharmacy |
| NCTE | National Council for Teacher Education | Approves B.Ed / M.Ed / D.El.Ed | Periodic | College of Education |
| DCI | Dental Council of India | Annual inspection | Annual | Dental College |
| PCI | Pharmacy Council of India | Annual inspection | Annual | College of Pharmacy |
| INC | Indian Nursing Council | Annual inspection | Annual | College of Nursing |

Two more entries sit in the same menu row but are **JKKN's own bodies, not regulators**:

- **IQAC** — Internal Quality Assurance Cell. JKKN's own cell. It owns the framework and decides who owns each metric.
- **CAC** — Cluster Academic Council. JKKN's own council that decides things once for all colleges together.

### 1.2 The one rule: evidence is emitted, not typed

There is **no accreditation data-entry screen** where someone re-types the year's numbers. When you resolve a grievance, record an IQAC meeting, sign an MoU, run an event, or the university declares results, the platform automatically writes an **evidence row** against every metric that fact satisfies. This is called **"collect once, report many"** — one publication can count for NAAC, NIRF, NBA and QS at the same time.

The only screens where you type numbers directly are:

- **Manage → Utility Readings** (monthly electricity / water / waste / solar meter readings)
- **Manage → MoUs & Grants** (the MoU / grant register)
- **NAAC → Grievance** (grievance tickets)

Everything else is fed by the everyday modules (HR, Events, BoS, COE results, CDC, Audit, Hostel, etc.).

### 1.3 Nothing here is a grade

No page in this module awards JKKN anything. Coverage percentages, "answerable" counts and evidence-row counts are **workload indicators**, not verdicts. NAAC marks shown on the NAAC page are a **projection** of what the evidence would earn, not an official result.

### 1.4 Expect a one-day delay

Most evidence is written by overnight jobs. Work you finish today appears as evidence tomorrow. Do not re-enter something because it has not appeared yet.

---

## 2. Who can see what

Access is controlled by **permission keys** granted to roles in **Admin → Role Management**. Each tab needs its own key. If a page is blocked, it says so on screen with the exact key to ask for — it never silently bounces you.

| Tab / page | Permission key to open it | Extra key to change things |
|---|---|---|
| Hub `/accreditation` | `accreditation.view` | — |
| My Gaps | `accreditation.view` | — (Accept/Decline works for the named person) |
| IQAC | `accreditation.metrics.view` | — |
| Coverage | `accreditation.coverage.view` | — |
| Manage → Metrics | `accreditation.metrics.manage` | same |
| Manage → Grievance Categories | `grievance.categories.manage` | same |
| Manage → MoUs & Grants | `accreditation.collaborations.view` | `accreditation.collaborations.manage` |
| Manage → Utility Readings | `accreditation.sustainability_readings.view` | `accreditation.sustainability_readings.manage` |
| Manage → Assign Owners | `accreditation.naac.narrative.view` **or** being a named owner | `accreditation.naac.narrative.manage` |
| Manage → Awarding Bodies | `accreditation.bodies.view` | `accreditation.bodies.manage` |
| NAAC Overview | `accreditation.naac.view` | — |
| NAAC → AI Narratives | `accreditation.naac.narrative.view` | `.narrative.edit` (owner okay), `.narrative.approve` (Principal / Director) |
| NAAC → Assign Narrative Owners | `accreditation.naac.narrative.manage` | same |
| NAAC → IQAC Committees | `accreditation.naac.committees.view` **or** a seat on the roster | `.committees.create`, `.committees.members.manage`, `.committees.meetings.manage`, `.committees.delete` |
| NAAC → DCF / AQAR Export | `accreditation.naac.dcf_export` (super-admin in practice) | — |
| NAAC → Grievance | `accreditation.naac.view` | — |
| NAAC → Survey Consent | `accreditation.naac.surveys.consent.submit` | — |
| NAAC → 8.4 Survey Export | `accreditation.naac.surveys.export` | — |
| NAAC → Employer & Alumni Feedback | `accreditation.naac.surveys.stakeholder.view` | `accreditation.naac.surveys.stakeholder.manage` |
| NIRF / NBA / QS / DCI / PCI / INC / NCTE / AICTE / UGC | `accreditation.<body>.view` (e.g. `accreditation.nirf.view`) | read-only pages |
| CAC | `accreditation.cac.view` | UGC readiness checklist needs `accreditation.cac.readiness.view` |

**Institution scope still applies.** A Principal (scope "own") sees only their college. The CEO, Managing Director and Accreditation Officer (scope "all") see every college. A person whose account is attached to an office, a company or a school with no IQAC code sees the message **"No accredited college in your access"** on college-scoped pages — that is an access fact, not a score of zero.

**Handover.** The Director can lend a permission to one named person for a fixed period from the Director's desk. Principals are deliberately not given `accreditation.naac.narrative.manage` by role; they receive the owner desk this way when needed.

---

## 3. Key concepts

| Term | Meaning |
|---|---|
| **Metric** | One question an awarding body asks, with a code (e.g. NAAC `7.3.d`, NIRF `TLR_SS`). The framework is a list of these, stored once for all bodies. |
| **Evidence row** | One real record filed against one metric for one college — a resolved grievance, a meeting held, a meter reading, a declared result. |
| **Not captured yet** | Nobody has collected this. The platform has no source wired to that metric. **It is not zero** and not a comment on performance. |
| **0** | We looked, and there is genuinely none. Shown only where a measurement actually ran. |
| **Answerable** | At least one evidence row exists for the metric. Says the platform can produce *something*, not that it is sufficient or approved. |
| **Coverage** | Distinct metrics carrying evidence ÷ active metrics in the platform's catalogue for that body. Always shown as "N of M" because the catalogue is uneven (NAAC 69 metrics, NIRF 17, AICTE 1). |
| **Owner** | The person recorded as accountable for a (college × metric) pair, or for a whole body in one college. Anything written about that metric routes to them instead of the shared IQAC queue. |
| **Body owner** | An owner recorded with the metric left blank — accountable for every metric of that body in that college. This is the normal way to assign. |
| **Grounded / Ungrounded** | A machine check on an AI draft. Grounded = every figure, date and code traces to cited evidence. Ungrounded = at least one does not, and the draft cannot be advanced by anyone. |
| **Collect once, report many** | Store a fact once and file it against every metric it satisfies across bodies. |
| **Cluster view** | A union across colleges: a metric counts as covered if *any* college has evidence. Always higher than any single college's own figure. |

---

## 4. Hub

**Path:** `/accreditation` · **Sidebar:** Accreditation → Hub · **Key:** `accreditation.view`

### What it is for
The front door. One card per awarding body showing how much of that body's catalogue currently carries evidence.

### What you see

1. **Header card "Accreditation Hub"**
   - Three tiles: **Bodies for your campus** (or **Bodies tracked**), **Metrics seeded**, **Evidence rows**.
   - A line telling you whether the cards are narrowed to your campus ("Showing the bodies your campus answers to…") or showing the whole cluster ("Showing every body in the cluster…").
   - Buttons: **View coverage matrix**, **NAAC (primary)**.
2. **Body cards** (one per body). Each shows the body name, a status badge (**Live** / **Phase 2+** / **Scaffolding**), cycle, scope, and:
   - **Metrics with evidence** — "N of M"
   - **Evidence rows** — N
   - **Coverage** — N% with a progress bar
   - Click anywhere on the card → that body's dashboard.
3. **Footnote card** explaining the coverage formula and that the Principal is simultaneously IQAC Chairman, NIRF Coordinator, NBA Co-Chair, and Institutional Head for the councils.

### Which cards you see
If your campus has bodies recorded under **Manage → Awarding Bodies**, only those cards appear (a dental council metric is not a gap in an engineering college). If nothing is recorded, or your campus is an office, every card is shown and labelled as the cluster view.

### Workflow
1. Open the Hub.
2. Read the three totals for a sense of workload.
3. Scan cards for a low "N of M".
4. Click the card to open that body's dashboard, or **View coverage matrix** to see it per college.

---

## 5. My Gaps

**Path:** `/accreditation/my-gaps` · **Sidebar:** Accreditation → My Gaps · **Key:** `accreditation.view`

### What it is for
**Your personal worklist.** "What do I owe, where do I do it, and by when." Only accreditation work assigned to *you* appears. Nobody else's workload is shown, and nothing here is a score or a ranking.

### Who uses it
Anyone IQAC has named as an owner — HODs, faculty coordinators, office heads, Principals.

### What you see

1. **"What you owe"** header.
2. **"Waiting for your answer (N)"** — shown only when someone has put your name against work you have not yet answered.
   - Each row: body badge, metric code (or **"Every metric in this body"**), metric name, college, programme.
   - Buttons **Accept** / **Decline**.
   - Toasts: "Assignment accepted." / "Assignment declined."
3. **"Yours to do (N)"** — the worklist proper. Each row shows:
   - Body badge, metric code, optional badge **"via your whole-body assignment"** (inherited from a body-level assignment), metric name, college · programme · category.
   - **Due badge**: "No date set", or "2026-10-01 — in 12 days" / "due today" / "3 days past due" (red when overdue, amber within 14 days).
   - Button **Open <BODY> →** to the body dashboard.
   - Evidence line, one of: "Nothing captured yet — this is the gap." / "N records already captured." / "At least N records already captured." (when the scan hit its 5,000-record cap).
   - **Source chips** — where the evidence comes from. A chip with a known screen is clickable and takes you straight to the place that fills it.
4. **"You declined N assignments. IQAC can reassign them."**
5. **Empty state** — "Nothing is assigned to you yet." with a button **Who assigns this? →**

### Status rules
- `confirmed` → appears in "Yours to do".
- `declined` → counted only.
- `pending` or anything unknown → "Waiting for your answer". An unrecognised state never puts you on the hook silently.

### Inheritance rules
- A whole-body assignment expands to every active metric of that body.
- A metric-level assignment overrides the inherited entry for that metric — nothing is listed twice.

### Workflow
1. Open My Gaps.
2. Answer anything in **Waiting for your answer** with Accept or Decline.
3. Work down **Yours to do**, overdue (red) first.
4. For each item, read the evidence line. If it says "Nothing captured yet", click a **source chip** to go to the module that produces the record, or **Open <BODY>** for context.
5. Do the work in that module. The evidence appears here after the overnight run.

> **Note:** due dates come from the submissions calendar, which is held by no role today, so most rows read "No date set". Ask IQAC for the real deadline.

---

## 6. IQAC

**Path:** `/accreditation/iqac` · **Sidebar:** Accreditation → IQAC · **Key:** `accreditation.metrics.view`

### What it is for
The Internal Quality Assurance Cell's own screen. It shows **the whole framework — every metric from all ten bodies — as one governing list**, grouped by body and category, and says per metric whether the platform can answer it today. The body tabs each show one slice; this shows everything.

### Who uses it
IQAC coordinator, Principal (as IQAC Chairman), Director / CEO.

### What you see (top to bottom)

1. **Header "IQAC — Internal Quality Assurance Cell"** with two filters:
   - **College** — defaults to your own college; users attached to no college open pooled and may filter. A scope sentence appears, e.g. "Showing the 4 awarding bodies that apply to JKKN College of Nursing: INC, NAAC, NIRF, QS." or "Pooled across every college — …higher than any single college's own figure."
   - **Reporting window** — academic years found in the evidence plus the current one, and **Whole NAAC cycle**. Defaults to the current AY.
   - Four tiles: **Metrics in the framework**, **Awarding bodies**, **Answerable today**, **Not captured yet**.
   - Buttons: **Manage the metric catalog**, **Cross-body coverage**, **Accreditation hub**.
2. **"Collected once, reported many"** — groups evidence by *source*, not by metric, to show which single record serves several bodies. Tiles: **Sources held**, **Already serving more than one body**, **Entries not collected twice**. Table columns **What is collected | Held | Who counts it** (e.g. "Course attainment records — 46 held once, serving 2 bodies — NAAC counts 46 · NBA counts 46").
3. **Warnings you may see:**
   - Red **accounting alarm** if metrics were read but some are hidden ("Do not use this page until that is explained").
   - Dashed **no-weights notice** — no metric carries a weight; nothing on the page totals or ranks anything.
   - Amber **spelling notice** — a category is spelled two ways in the data (e.g. "Attribute 9: Research" vs "Attribute 9: Research & Innovation Outcomes"). Button **Reconcile in the metric catalog**.
4. **"The CAC framework as a summary of this one"** — tiles **Mapped to a metric**, **Reviewed, no counterpart**, **Not examined yet**. Button **Open the CAC dashboard**.
5. **Per-body framework cards** (NAAC, NIRF, NBA, DCI, PCI, INC, QS, UGC, AICTE, NCTE). Each has an accordion per category. Table columns **Code | Metric | Max score | Weight | Status**. Status is green **Answerable** or outline **Not captured yet**. There is deliberately no "0".
6. **"What the council can measure"** — the CEO's July 2026 CAC framework (49 metrics in 6 categories) as a matrix of metrics × institutions. Cell values: a number, **"none recorded"**, **"does not apply"**, or **"—"**. Row-level states: **Not captured yet · <reason>**, **Values could not be read**, **This measurement has stopped reporting**. The attendance row shows when the nightly all-history figure was last computed (amber if never or more than a day old). Toggle **Show / Hide N other entities** for offices and schools.
7. **Footer** — where metrics live and what "answerable" counts.

### Workflow
1. Pick your college and the reporting window.
2. Read the four tiles for workload.
3. Clear any red alarm or amber spelling conflict via **Reconcile in the metric catalog**.
4. Expand a body → category → find metrics badged **Not captured yet**.
5. Go to **Manage → Assign Owners** and name someone for that body or metric so it appears on their My Gaps.
6. Use "Collected once, reported many" to explain to colleagues why one record does not need to be entered twice.

---

## 7. Coverage

**Path:** `/accreditation/coverage` · **Sidebar:** Accreditation → Coverage · **Key:** `accreditation.coverage.view`

### What it is for
The cross-body coverage matrix: **one row per (body × college) that has evidence**, so you can see which college is thin on which body instead of only the JKKN-wide figure.

### What you see
1. **Header "Cross-Body Coverage Matrix"** with tiles **Rows**, **Avg coverage**, **Bodies with evidence**.
2. **One card per body** (skipping bodies with no evidence). Each has a link **Open dashboard →** and a table:
   - **Institution** (IQAC code badge + name)
   - **Evidence rows**
   - **Metrics answered** — "N of M" against the body's whole catalogue
   - **Coverage** — progress bar + percentage
3. **Empty state** — "No evidence rows yet."

A (body × college) pair with no evidence never appears — so DCI shows only the Dental College.

### Workflow
1. Open from the Hub or the IQAC page.
2. Scan each body card for the college with the lowest "Metrics answered".
3. Open that body's dashboard to see which metrics are missing.
4. Assign owners so the gaps land on someone's My Gaps.

---

## 8. Manage

**Sidebar:** Accreditation → Manage → (six sub-pages). These are the configuration and data-entry screens behind the read-only dashboards.

### 8.1 Metrics — `/accreditation/manage/metrics`

**Key:** `accreditation.metrics.manage` · **Who:** IQAC coordinator / Accreditation Officer

**What it is for.** The master catalogue of every metric across all ten bodies. Seeded (official) metrics are system-protected; you can add JKKN-specific local metrics and edit the ones you added.

**Screen.**
- Filter **Filter body** (All bodies / NAAC / NIRF / …).
- Button **New Metric**.
- Table: **Body | Code | Name (+ `system` badge) | Category | Active** with Edit / Delete row actions.

**Dialog "New metric" / "Edit metric".**
| Field | Rule |
|---|---|
| Body * | one of the 10 codes |
| Metric code * | required (e.g. `7.7.1`) |
| Metric name * | at least 3 characters |
| Category | free text (e.g. "Curricular Aspects") — use the exact spelling already in use to avoid the IQAC spelling warning |
| Max score | number |
| Calculation method / Notes | free text |

**Rules.**
- A system metric can be edited but **not deleted** — error: "Official <BODY> rubric metric <code> cannot be deleted. Deactivate it instead."
- Deleting a local metric is allowed.

**Workflow.** Filter by body → confirm the metric is missing → **New Metric** → fill body, code, name, category → **Create** → the metric now appears on IQAC and the body page as "Not captured yet" until a source feeds it.

---

### 8.2 Grievance Categories — `/accreditation/manage/grievance-categories`

**Key:** `grievance.categories.manage` · **Who:** Principal / IQAC admin

**What it is for.** The per-college list of grievance categories the ticket register uses. Each category carries a default SLA, a default assignee role and the NAAC metric its tickets count towards (default `7.7.1`).

**Screen.**
- **Institution** picker (all-institution roles only — super admin, CEO, Managing Director, Accreditation Officer; others see their own college).
- Buttons **View Tickets** (→ NAAC → Grievance) and **New Category**.
- Table: **Name (+ `system`, `emergency` badges) | SLA (h) | Assignee | NAAC metric | Active**.

**Dialog fields.** Name * (≥2 chars) · Description · Default SLA hours (1–10000, default 72) · Default assignee (admin / principal / hod / staff) · NAAC metric code (default 7.7.1) · **Emergency category** checkbox · **Attachment required** checkbox.

**Rules.** The five system defaults (SH / Ragging / Academic / Infrastructure / Other) can be renamed and reconfigured but never deleted.

**Workflow.** Choose the college → **New Category** (e.g. "Hostel Mess") → set SLA, assignee, metric → **Create** → team members can now file tickets under it.

---

### 8.3 MoUs & Grants — `/accreditation/manage/collaborations`

**Key:** view `accreditation.collaborations.view`, edit `accreditation.collaborations.manage` · **Who:** IQAC coordinator, office handling MoUs

**What it is for.** The register of MoUs, external grants and industry collaborations. **Saving a record instantly becomes evidence**: MoU / industry collaboration → NAAC 7.9; grant → NAAC 9.1. Drafts emit nothing. Also feeds the CAC "agreements between colleges" count.

**Screen.**
- **Institution** picker (all-institution roles only).
- Button **New Record**.
- Table: **Title (+ kind badge, `international`, "filed by the partner college") | Partner / funder | Signed on | Valid till | Amount (INR) | Status | Evidence (`NAAC 7.9` / `NAAC 9.1` / `none (draft)`)**.

**Dialog fields.**
| Field | Rule |
|---|---|
| Type * | MoU / Grant / Industry Collaboration |
| Status | Draft / Active / Expired / Terminated (default Active) |
| Title * | ≥3 chars |
| A JKKN college | optional; pick when the partner is another JKKN college — both colleges then see and can edit the record |
| Partner / funder * | ≥2 chars (locked when a JKKN college is chosen) |
| Scope | Not specified / National / International |
| Signed on * | date |
| Valid till | must not be before Signed on |
| Amount (INR) | ≥0, grants only |
| Document URL | link to the signed MoU / sanction letter |
| Notes | free text |

**Rules.**
- Only the college that filed a record can delete it; the partner college can view and edit.
- Toast on create: "Record created — accreditation evidence emitted." or "Draft saved (no evidence emitted until it leaves Draft)."

**Workflow.** **New Record** → choose type → fill title, partner, signed-on, amount (grants), document link → Status **Active** → **Create** → the Evidence column shows NAAC 7.9 / 9.1 immediately. When an MoU lapses, edit and set **Expired**.

---

### 8.4 Utility Readings — `/accreditation/manage/utility-readings`

**Key:** view `accreditation.sustainability_readings.view`, enter `accreditation.sustainability_readings.manage` · **Who:** campus estate / maintenance officer, IQAC coordinator

**What it is for.** Four meter numbers per campus per month — the only entry screen for **NAAC Attribute 10 (Sustainability)**. A nightly job turns the series into NAAC 10.2 (water & waste) and 10.3 (net zero). A campus with no readings emits nothing — never a fabricated zero.

**Screen.**
- **Campus** picker (all-institution roles only) and **Month** picker (last completed month first, 18 months back; never a future month).
- Coverage banner: "Nothing recorded yet for this campus…" or "Last recorded month: <Month> · N months on record" (+ "X of the last 18 completed months missing").
- Four stream blocks, each with a number box, an **Estimated** checkbox and a delta chip vs the prior month:
  - **Electricity (kWh)** — units billed for the month, off the EB bill.
  - **Water (kL)** — kilolitres drawn (1 kL = 1,000 litres).
  - **Waste (kg)** — solid waste handed over.
  - **Solar generated (kWh)** — rooftop solar output; leave blank if no solar.
- **Note for this month** (e.g. EB bill reference, or why a figure is estimated).
- Button **Save <Month>**. Line: "A box left blank is recorded as 'not read', not as zero."
- Second card **Yearly green audit** with button **Start this year's green audit** — creates a NAAC green-audit cycle in the Audit module; closing that cycle emits NAAC 10.4.

**Rules.**
- **Blank ≠ 0.** Blank means the meter was not read; 0 means nothing was used.
- Each box must be a number ≥0 or blank.
- Toast: "<Month> saved. Evidence refreshes overnight."

**Workflow (monthly).** Pick campus and the last completed month → type the four numbers → tick **Estimated** where not metered → add a note → **Save**. After two or more months, the delta chips and Attribute 10 evidence light up. **Once a year**, click **Start this year's green audit** and complete it in `/audit`.

---

### 8.5 Assign Owners — `/accreditation/manage/owners`

**Key:** open with `accreditation.naac.narrative.view` **or** by being a named owner; assign with `accreditation.naac.narrative.manage` · **Who:** IQAC coordinator (assigns), body owners (delegate), everyone named (accept/decline)

**What it is for.** Records **who is accountable** for each metric, per campus. Name one person per awarding body and every metric under it inherits them; set individual metrics only as exceptions. Reminders, digests and AI-draft routing all follow what is recorded here.

**Key rule: assignment IS ownership.** There is no approval gate. Naming someone makes them the owner straight away; the status only records whether they have opened their page:

| Status badge | Meaning |
|---|---|
| **Not opened yet** (amber) | Assigned; they have not yet opened My Gaps or this page. They own it and get reminders anyway. |
| **Opened** (green) | They have accepted / opened it. |
| **Declined** (red) | They refused. Counts as *not* owned — reassign. |

**Three levels.**
1. **Body owner** (metric left blank) — inherited by every metric of that body in that college. **This is the normal way to assign.**
2. **Metric owner** — an explicit exception overriding the inherited owner for that one metric.
3. **Committee leads** — chair / convenor of committees, shown read-only (edit them on the committee page).

**Screen (top to bottom).**
1. **"Who is accountable for each metric"** — **Campus** picker, a scope sentence naming the bodies that apply, and the counter **Owners set — N of M** with sub-counts *opened / not opened yet / declined / nobody named* and per-body badges (e.g. `NAAC 69/69`).
2. **"Bodies with nobody accountable"** — a cross-campus gap card listing every campus with unowned bodies. Click a college name to select it.
3. **"Body owners"** table — **Awarding body | Metrics covered | Status | Accountable person**. With the manage key, a searchable owner dropdown per body (`Nobody yet` + candidates). Selecting a person assigns the whole body; selecting **Nobody yet** clears it. **Accept / Decline** buttons appear on your own pending row.
4. **"Committee leads"** — read-only, with **Open committee** buttons.
5. **"Metric owners"** — filters **Nobody named / Assigned to me / Has an owner / All metrics** and a body select. Panel **"Assign a whole category"** (manage only, one body selected) with **Assign all…** per category. Table: **Metric | Category | Owner (with "via NAAC owner" / "Set for this metric" / "Nobody named") | Status | Set an exception**.
6. **"Ownership history"** — newest first: "Asha made Ravi the owner, as the NAAC body owner on 9 Sep 2026.", moves, removals, declines, first opens.

**What each action does.**
- **Assign (IQAC)** — saves immediately; toast "<scope> is now owned by <name>. The change is recorded; everyone affected will be told."
- **Delegate (body owner without manage key)** — may hand *individual metrics* of their body to colleagues; may **not** set the body owner ("otherwise the person accountable could appoint their own replacement") and may not leave a metric with nobody.
- **Clear** — "<scope> now has no owner."
- **Accept / Decline** — "Accepted. You are now the recorded owner." / "Declined. IQAC will see this needs reassigning."
- **Assign all… (category)** — "37 of 37 metrics sent to <name>."
- Blocked write (no access to campus): "The change was not saved — you may not have access to this campus."

**Notifications sent.**
- **Daily 01:42** — every pending owner gets one in-app notification: "You have been named the accreditation owner for NAAC" with a link to My Gaps and the words "Declining is a genuine option."
- **Every 6 hours** — on any ownership change, the new owner, the previous owner, the body owner above, and the college's IQAC officer are each told (the person who made the change is not).
- The owner **digest** ("N metrics awaiting evidence from you") is built but **not switched on** yet.

**Workflow (IQAC coordinator).**
1. Open the desk → read **Bodies with nobody accountable** → click a college.
2. In **Body owners**, pick one person per awarding body. All that body's metrics are now owned by inheritance.
3. Tell the person yourself (the nightly notification also goes out).
4. Watch the status move from **Not opened yet** to **Opened**; reassign anything **Declined**.
5. Use **Metric owners** only for the handful of questions that sit with a particular office (library, finance).

**Workflow (body owner).** Open the desk → switch the Metric owners view to **All metrics** → use **Set an exception** to hand individual metrics to colleagues. The row keeps reading "NAAC owner <you> remains accountable."

---

### 8.6 Awarding Bodies — `/accreditation/manage/bodies`

**Key:** view `accreditation.bodies.view`, edit `accreditation.bodies.manage` · **Who:** Accreditation Officer / super admin

**What it is for.** Two things: **which awarding bodies exist** (cluster-wide registry) and **which of them each campus answers to** (mapping). The mapping decides a college's *denominator* — remove a body and its metrics stop counting against that college on the Hub, IQAC, owners desk and every scorecard.

**Screen.**
1. **"Bodies that apply to one campus"** — **Campus** picker; active bodies as removable pills (× to remove); **Add a body** dropdown + **Add** button. Empty state: "No awarding body applies to <name>" (correct for offices, companies, shared entities).
2. **"Awarding body registry"** — **New Body** button; table **Code | Name | Kind (Indian regulator / International ranking / School board) | Status (active / retired)** with **Edit** and **Retire / Restore**.

**Dialog "New awarding body".** Code * (2–16 chars, letters/digits/dash/underscore, uppercased; cannot be renamed later) · Short label · Full name * (≥3) · Kind · Official website · Notes.

**Rules.** Nothing is ever deleted — bodies are retired/restored, mappings are deactivated, so history survives.

**Workflow.** A college takes up a new body → (if new) **New Body** in the registry → pick the campus → **Add a body** → **Add**. The Hub, owners desk and dashboards narrow or widen immediately. When a college stops answering to a body, click × on its pill. When a body ceases to exist cluster-wide, **Retire** it.

---

## 9. NAAC

**Sidebar:** Accreditation → NAAC → (Overview, AI Narratives, Assign Narrative Owners, IQAC Committees, DCF / AQAR Export, Grievance, Surveys, Survey Consent (DPDPA), 8.4 Survey Export, Employer & Alumni Feedback)

NAAC is the primary body. It is the only tab with its own sub-menu, because it carries the IQAC committee engine, the AI narrative pipeline, the grievance register and the survey tooling.

### 9.1 Overview — `/accreditation/naac`

**Key:** `accreditation.naac.view` · **Who:** IQAC coordinator, Principal (IQAC Chairman), Accreditation Officer, Director

**What it is for.** How many NAAC **marks** (out of 900, Binary framework, 10 attributes) a college's evidence would currently earn, per attribute and per college, plus the auto-tagged "quality loops" for Metric 7.3.

**What you see.**
1. **Header "NAAC — IQAC Dashboard"** with the **College** switcher. The rows depend on your access: **Cluster (all 8 colleges)** + each college; **<Your college> (your college)** only; or **The N colleges you can see**.
2. **Four tiles**: **Marks earned** (of 900) · **Coverage (marks-weighted)** · **Metrics earning marks** (N of M) · **Evidence rows**.
   - In cluster view a caveat appears: "Cluster view is a union, not an average… Pick a college above for a score that college could actually claim."
3. **Buttons**: Coverage matrix · IQAC committees · DCF 2025 / AQAR export · Survey consent · 8.4 Survey export.
4. **Ten attribute cards** — Attr 1 Curriculum · 2 Faculty Resources · 3 Infrastructure · 4 Financial · 5 Learning & Teaching · 6 Extended Curricular · 7 Governance (incl. IQAC + grievance) · 8 Student Outcomes · 9 Research & Innovation · 10 Sustainability. Each shows "X / Y marks", a percentage bar, evidence rows, and an expandable list of metrics with "earned / possible".
   - A metric with marks available but no evidence reads **"0 earned — no evidence yet (N marks available)"**.
   - Some metrics carry zero possible marks by design and say why: **"Shares metric X's marks"** (facet rows such as 7.3.d → 7.3.1), **"Affiliated-only — not scored against the Autonomous ceiling"** (⚑ 8.2.2), or **"Superseded starter row"** (9.1.1 → use 9.2; 10.1.1 → use 10.4).
5. **"Marks by college"** table — **College | Type | Marks (of 900) | % | Evidence**.
6. **"Quality Loops — Metric 7.3 Quality Assurance System"** — one tile per self-improving loop (SCF teaching feedback, induction, mess menu) with cycles measured, last measured date, and delta chips ▲ improved / ▬ no change / ▼ worse. An **Academic year** select and, for export holders, **Download 7.3 evidence draft** (a Markdown file with NAAC's own 7.3.d / 7.3.e / 7.3.f wording, "Human review required before NAAC submission"). Empty state: "Loop evidence rollup not yet activated — awaiting first cron run."
7. **"Held CO/PO results — assign the right college"** — visible only to super admins / `accreditation.evidence.restamp` holders. Lists course results whose college could not be stamped with confidence (badges **Twin colleges** / **No confident match**). Pick the college → **Assign** → "It enters that college's evidence on the next weekly run."
8. **Footer** — how marks are scored, open Director decisions, and that Principal = IQAC Chairman, HoDs = Department IQAC Coordinators.

**Scoring rule to remember.** NAAC Binary is **yes/no**: a metric earns its **full** max score the moment one evidence row exists, otherwise 0. There is no partial credit.

**Workflow.** Pick your college → read Marks earned → open the attribute with the lowest percentage → find metrics reading "0 earned — no evidence yet" → produce that record in its source module (or assign an owner) → check again after the overnight run.

---

### 9.2 AI Narratives — `/accreditation/naac/narratives`

**Keys:** view `accreditation.naac.narrative.view`; okay `accreditation.naac.narrative.edit` (or being the recorded owner); approve / submit / request revision `accreditation.naac.narrative.approve` · **Who:** owning Senior Learners, IQAC coordinator, Principal, Director

**What it is for.** The platform drafts a criteria narrative for each NAAC metric **only from that metric's cited evidence**, then a deterministic **grounding gate** checks every figure, date and code against the evidence. A human owner reads and okays it, the Principal approves, the Director submits. **Nothing advances on its own, and an ungrounded draft can never be advanced.**

**Status flow.**

```
AI drafted --(owner okays)--> Owner okayed --(Principal approves)--> Principal approved --(Director submits)--> Director submitted (final)
    ^                              |                                        |
    +------ Revision requested <---+----------- "Request revision" ---------+
```

Grounding verdict: **Grounded** (green) · **Ungrounded** (red, blocked) · **Not validated**.

**Work-list page.**
- Tiles: **Total drafts** · **Awaiting owner okay** · **Director submitted** · **Ungrounded (blocked)**.
- Filter by status (with counts).
- Table: **Metric | Institution | Period | Status | Grounding | Edited (% changed at okay; 0% = accepted verbatim) | Owner ("Unassigned — IQAC queue" when nobody is named)**.
- Empty: "No narratives yet. Drafts appear here once the drafter has run for a period."

**Detail page (one narrative).**
1. Header: metric, institution, period, owner, status, "N evidence records cited".
2. **Grounding banner**:
   - **Ungrounded — this draft is blocked** with the list of **Ungrounded tokens**. All action buttons are hidden.
   - **Grounded — every figure, date, and code traces to the cited evidence.**
   - **Not yet validated by the grounding gate.**
3. **Revision requested** card with the reviewer's note (when applicable).
4. **Narrative** — an editable textarea for the owner ("Edit the narrative (citation markers like [E1] are kept)") with a **Preview**; read-only for others.
5. **Citations** — marker chips (E1, E2…) → the evidence record they point at.
6. **Actions**:
   - **Okay this narrative** (owner) — your edited text is **re-checked on the server** before it advances. If you typed a figure the evidence cannot support, you get: "Your edit added figures the evidence cannot account for. Fix them before okaying."
   - **Approve (Principal)** · **Submit (Director)** · **Request revision** (opens "Reason for revision (sent back to the owner)" — required).

**Writing rules for the prose (so it stays grounded).**
- Quote evidence figures verbatim; reproduce dates exactly in ISO form (2026-03-15).
- Express proportions as raw counts ("3 of 5 respondents"), never a derived percentage.
- Do not add any number, date or code that is not in the cited evidence.

**Reminders.** The owner is nudged after a draft has waited **3 days**; a draft overdue **7 days** is escalated to super-admin oversight. When the AI has re-drafted a metric **5 times** and it is still ungrounded, one notice "Needs a human: NAAC <code> narrative — <College>" goes to the owner (or the IQAC queue), listing the fragments that could not be traced.

> **Current state:** the nightly drafter job is switched **off** (dark) until the Director enables it. The pages work; drafts simply do not appear yet.

**Workflow (owner).** Open AI Narratives → look at **Awaiting owner okay** → open a row → if **Ungrounded**, stop and tell IQAC which figure has nothing behind it → otherwise read the draft against its citations, fix wording, **Okay this narrative** → the Principal and Director take it from there.

---

### 9.3 Assign Narrative Owners — `/accreditation/naac/narratives/owners`

**Key:** `accreditation.naac.narrative.manage` · **Who:** IQAC coordinator

**What it is for.** Records the Senior Learner who owns each NAAC metric **so the AI draft lands on the right desk**. Leave it blank and the draft waits in the shared IQAC queue.

**Screen.**
- Tiles **Metrics in scope** · **Owner assigned** · **Still unassigned**.
- Filter **Show**: All metrics / Unassigned only / Assigned only.
- One card per campus, badge "N of M assigned". Table: **Metric ("Whole body" row first) | Source (Draft / Evidence / Owner record only) | Current owner | Assign to** (searchable person picker, saves immediately — no Save button).
- Toasts: "<metric> assigned to <person>." / "<metric> is now unassigned." / "The change was not saved — you may not have access to this campus."

**Workflow.** Assign **before** the drafter runs. Pick a person per row (or the **Whole body** row for everyone at once) → tell them yourself → the draft routes to their queue when it is generated.

> This page and **Manage → Assign Owners** write the same ownership table. Use Manage → Assign Owners for the full multi-body desk; use this one for a quick NAAC-only view.

---

### 9.4 IQAC Committees — `/accreditation/naac/committees`

**Keys:** open with `accreditation.naac.committees.view` **or a seat on the committee roster**; create `…committees.create`; members `…committees.members.manage`; meetings & resolutions `…committees.meetings.manage`; deactivate `…committees.delete` · **Who:** IQAC coordinator, Principal (Chairman), committee members

**What it is for.** Form IQAC and statutory committees, keep their rosters, and run the **loop review** meeting cycle: every meeting passes resolutions with an owner and a due date, and the next meeting opens by checking whether they happened. Every recorded meeting is NAAC 7.3.1 evidence.

**Access follows the roster, not the job title.** Anyone named on a roster can open that committee until their **term end** date; after that they see "Your term on this committee has ended… ask for your term to be extended."

**Committee types.** Main IQAC · Department coordinator · Internal Complaints Committee (ICC) · Anti-ragging committee · Grievance redressal cell · Inspection panel · Statutory committee · **Cluster council (CAC)**.

**List page.**
- **College scope** select (super admins), button **New committee**.
- Tiles **Scope | Committees | Total active members**.
- Section **Cluster councils** (amber) and table **Committees held by one institution** — **Name | Type | Formed | Term end | Members | Manage**.

**Dialog "Form new IQAC committee".** Institution (or **Filed under** for a cluster) · Committee name * (e.g. "Main IQAC – Academic Year 2026") · Type · for a cluster: **Institutions in the cluster** checkboxes (at least two — "a cluster of one is not a cluster") · Formed on * · Term end · Notes. Button **Create committee**.

**Detail page.**
1. Header: name, type, Active/Inactive, institution, **Deactivate** (soft; reversible).
2. Tiles **Formed | Term end | Chairman**.
3. **Members** — table **Name | Role | Source (Internal / External) | Joined | Term end | Action**. Button **Add member**:
   - Tab **Internal** — search MyJKKN users by name or email.
   - Tab **External** — Name *, Organisation, Email.
   - **Term end *** (required; default 31 March) — "Their access to this committee ends automatically the day after."
   - **Role** — Chairman / Coordinator / Member / Observer / Secretary / Convenor.
   - **Remove member** marks them inactive; their notes and contributions stay.
4. **Meetings — Loop Review** (see below).

**The loop review cycle.**

| Meeting status | Meaning |
|---|---|
| **Scheduled** | Date set; review not yet open. Buttons **Mark held**, **Cancel meeting**. |
| **Held — in review** | The working state: review open resolutions, pass new ones, write member accounts. |
| **Minuted** | Closed; minutes are the Action-Taken Report. Read-only (accounts may still be added). |
| **Cancelled** | — |

Steps inside a **Held** meeting:
1. **Convene meeting** → **Convene now** (opens immediately) or **Schedule** (needs a date).
2. **Review of open resolutions** — every still-open resolution from earlier meetings. Per row: **Done** (optional outcome note), **Carried** (reappears next meeting; strike counter "Carried ×N"; at **2 strikes** a red **Escalate to Director** badge appears), **Dropped** (reason required).
3. **New resolutions** — text ("RESOLVED: …"), **Owner (name / designation) — required**, due date, **Pass resolution**. Cluster councils can tag **Affected colleges**.
4. **Member accounts of this meeting** — every member writes **"Your account of this meeting"** in their own box (**Save my account**). The Chairman / Coordinator additionally sees **Other members' accounts** and can **Compile into minutes** (choose **Add below** or **Replace** the existing minutes; Replace requires a confirmation tick).
5. **Close meeting** — a prefilled Action-Taken Report ("Reviewed X prior resolutions: A done, B carried forward, C dropped. Passed D new resolutions…") you can edit → **Confirm & close** → status **Minuted**.

**AI assistant (accept / reject only; currently switched off).** When enabled, a few days before a scheduled sitting the platform drafts a **brief** (carries the figures), a **proposed agenda** (deliberately carries **no figures** — "anything readable from the platform belongs in the brief") and an **ATR skeleton**. It may also **propose a sitting** when a committee is overdue by its cadence. Everything is shown with **Okay these papers / Discard** or **Confirm sitting / Decline**; nothing is applied automatically and nobody is invited. A polished write-up may be offered inside **Close meeting** via **Use this text** — it only fills the box; you still confirm.

**Rules the gate enforces on any text you okay.** No figure the records cannot back; no number on the agenda itself ("Move them to the brief"); minutes may not drop a recorded resolution.

**Workflow (Coordinator).** New committee → Add members with term ends → Convene meeting → review carried items → pass resolutions with owners and dates → members write accounts → compile → Close meeting → the meeting becomes NAAC 7.3.1 evidence and anything left open reappears next time.

---

### 9.5 DCF / AQAR Export — `/accreditation/naac/dcf-export`

**Key:** `accreditation.naac.dcf_export`; in practice **super-admin only** · **Who:** Director's office / IQAC Chairman

**What it is for.** Download the NAAC Data Capture Format / AQAR workbook (.xlsx) listing every NAAC metric with its evidence count, leave an audit trail, and after filing **freeze** the figures so "what we reported" and "what we hold today" can both be answered later.

**Screen.**
- **College** select · **Submission type** (AQAR 2024-25 / SSR 2027).
- Tiles **Metrics in scope | Evidence rows | Coverage**.
- Button **Download XLSX** → two sheets, "NAAC metrics" (code, name, category, max score, evidence rows, calculated value = "auto-fill pending", method, sources, verification) and "Cover". A `draft` submission record is written on every download.
- After a download, card **Freeze the filed figures** → **Freeze filed figures** (once only — the database refuses a second freeze). Then tiles **Metrics filed | Evidence rows filed | Frozen at** and a list **Reported vs actual today** ("Reported 61; 84 today (23 rows more since filing)").

**Workflow.** Pick college and submission type → **Download XLSX** → file it with NAAC → return → **Freeze filed figures** → use "Reported vs actual" in later reviews.

---

### 9.6 Grievance — `/accreditation/naac/grievance`

**Key:** `accreditation.naac.view` · **Who:** IQAC coordinator, grievance cell team members, any office filing on a learner's behalf

**What it is for.** The UGC-mandated grievance redressal register. **Every resolved ticket automatically emits NAAC 7.7.1 + UGC evidence.**

**List page "Grievance Tickets".**
- Button **New Ticket**.
- Filters **Status** (Open / In Progress / Pending Info / Resolved / Closed / Reopened), **Priority** (Low / Medium / High / Urgent), **Emergency only**.
- Table **Ticket # | Subject (EMERGENCY / ANON badges) | Status | Priority | SLA (on_track / at_risk / breached) | Raised By | Created**. 20 per page.

**New ticket "File a new grievance".**
| Field | Rule |
|---|---|
| Category * | from Manage → Grievance Categories; sets SLA hours, emergency flag, auto-assignee role and NAAC metric |
| Subject * | ≥3 chars |
| Description * | ≥10 chars |
| Priority | default Medium |
| Raised by (type) | Learner / Parent / Staff / Alumni |
| File anonymously | hides identity from the assignee; audit trail retained |
| Name / Email / Phone | only when not anonymous |

Button **File Ticket** → ticket number `GRV-YYYYMMDD-NNNN` → opens the detail page. The SLA deadline is computed in business hours (9–6 IST, Mon–Fri, skipping public holidays).

**Detail page.**
- Header badges EMERGENCY / ANONYMOUS / ICC-ONLY; fields **Status | Priority | SLA | Escalation**; **Raised by**; **Description**; **SLA deadline**.
- Card **Resolve** — **Resolution note *** (≥10 chars, "This becomes NAAC 7.7.1 evidence") → **Mark Resolved** → toast "Ticket resolved. Evidence row emitted for NAAC 7.7.1 + UGC grievance."
- **Timeline** of comments; **Add comment** with **Internal (hidden from filer)** checkbox.

**Automatic.** An hourly job marks tickets past their deadline as **breached**. No email is sent.

**Workflow.** New Ticket → pick category → fill subject / description → File → investigate, posting comments → write the resolution note → **Mark Resolved** → evidence appears against 7.7.1.

---

### 9.7 Surveys

Clicking **Surveys** in the sidebar lands on **Survey Consent** — consent is the mandatory entry point.

#### 9.7.1 Survey Consent (DPDPA) — `/accreditation/naac/surveys/consent`

**Key:** `accreditation.naac.surveys.consent.submit` · **Who:** the individual learner / alumnus / team member (data subject)

**What it is for.** Record informed consent under DPDPA 2023 §6 before your personal data may be exported for NAAC 8.4 or NIRF perception surveys. One consent covers both bodies.

**Screen.**
- Intro card explaining purpose and the right to withdraw.
- If consent is on file: green "You already have an active consent on file" with version, date and categories, and a **Withdraw consent** button.
- **Data categories** checkboxes: Personally identifiable information (recommended) · Academic records (recommended) · Alumni outcomes · Parent contact.
- Legal acknowledgement checkbox → **Grant consent**.

**Rules.** At least one category and the acknowledgement box are required. Consent is append-only; withdrawal excludes you from every future export. Questions: iqac@jkkn.ac.in.

#### 9.7.2 8.4 Survey Export — `/accreditation/naac/surveys/8.4-export`

**Key:** `accreditation.naac.surveys.export` · **Who:** IQAC chairman / Director's office

**What it is for.** Download the consent-gated CSV of people eligible for the NAAC Metric 8.4 Learner Experience Survey (or the alumni-outcomes stream). Only records with active NAAC consent are exported.

**Screen.** Tiles **Total NAAC consents | Learner-stream ready | Alumni-stream ready** · **Export stream** (Active learners / Alumni outcomes) · **College (for submission record)** · **Export N records** → CSV `naac_8.4_<stream>_<code>_<date>.csv` and an `exported` submission record.

#### 9.7.3 Employer & Alumni Feedback — `/accreditation/naac/surveys/stakeholders`

**Keys:** view `accreditation.naac.surveys.stakeholder.view`; run cycles `…stakeholder.manage` · **Who:** IQAC coordinator

**What it is for.** The **external half of NAAC 1.2** (stakeholder participation in reviewing the learning framework; BoS minutes supply the internal half). One short five-question survey per audience per year, sent to employers and alumni **before** the review meetings. A cycle becomes NAAC 1.2 evidence only once it is **closed with at least one response**, reported as counts and averages only (averages hidden below 5 responses).

**Cycle statuses.** **Draft** ("links do not work yet") → **Open** ("links work, nothing is reported until it closes") → **Closed** ("emits NAAC 1.2 only if at least one response landed"). A closed cycle can be **Reopened**.

**Screen.**
- **New cycle** → dialog: **Who is being asked** (Employers & recruiters / Alumni) · **Academic year this feeds** (e.g. 2027-2028) · **Opens** / **Closes** dates · preview of the 5 questions → **Create draft**.
- Per cycle: **Open / Close / Reopen** and **Who has replied**, which expands to badges "N responded / N still to chase", buttons **Build the list** (pulls graduated learners, or recruiter and employer contacts from CDC — no separate contact list) and **Links CSV**, and a table **Name | Email | Responded** with **Copy link** and **Remove recipient** (anonymises their answer, keeps the count).

**Important.** The platform **does not email invitations** yet. Download **Links CSV** and mail-merge the personal links yourself. Each link is single-use and expires after 120 days.

**What the recipient sees.** A public page (no login): four 1–5 ratings, one optional comment, a DPDPA consent tick, **Send my feedback**. Answers are never shown against a name.

**Workflow.** New cycle → Build the list → Links CSV → send links → **Open** → chase the "not yet" rows → after the window, **Close** → NAAC 1.2 evidence is written → use the answers in that year's BoS / learning framework review.

---

## Body dashboards — how to read them all

Sections 10–18 are **read-only dashboards**. None of them has a create, edit or delete control. They share one layout:

1. **Breadcrumb** Home → Accreditation → BODY.
2. **Header card** — body name, one-paragraph description, and either a **College** switcher (NIRF, UGC) or a fixed **Scope** box (DCI, PCI, INC, NCTE, AICTE) or a programme picker (NBA).
3. **Stat strip** — usually **Metrics seeded · Max score tracked · Evidence rows · Cycle**.
4. **Quick-action buttons** — **Coverage matrix** and body-specific links (buttons marked "(soon)" are placeholders and do nothing).
5. **Criterion / parameter / domain cards** — each with a metric count, description, "Max score", "Evidence" and an expandable list of metrics with per-metric evidence counts.
6. **Footer** — scope notes and the coverage formula ("distinct metrics carrying evidence ÷ active metrics in this platform's BODY catalogue").

**How evidence gets there.** Automatically, from fan-out triggers and nightly roll-ups in other modules. Evidence counts move only when a source module records something. If a metric shows nothing, the fix is in the source module, never on the dashboard.

**Two ways a gap is shown.** NIRF (and CAC) print **"Not captured yet"** with an owner line and, when a screen exists, a **Fix this** link. The other body pages currently print a plain **0** badge — read it as "no evidence row exists for this metric in this scope".

**"No accredited college in your access".** NIRF, UGC and NAAC show this whole-page message instead of numbers when your account is attached to a campus with no IQAC code. It is an access fact, not a score of nought. Ask your administrator for access to a college.

**"BODY does not apply to your campus".** An amber notice (not a block) telling you that you are reading a cluster view and nothing on the page is a gap on your side. Which bodies apply to which campus is recorded in **Manage → Awarding Bodies**.

**Generic workflow for every body page.**
1. Open the body chip.
2. Set scope (college / programme) where a picker exists.
3. Read the stat strip, then each criterion card. Expand the list to see per-metric counts.
4. For each gap: follow **Fix this** (NIRF) or go to the module that produces that record; or note the owner and ask them.
5. Cross-check on **Coverage** for body × college.

---

## 10. NIRF

**Path:** `/accreditation/nirf` · **Key:** `accreditation.nirf.view`

**What it is for.** How much evidence exists against the Ministry of Education's annual ranking framework, for one college or the cluster.

**Header.** "NIRF — National Institutional Ranking Framework" · "5 parameters, weighted 30 + 30 + 20 + 10 + 10 = 100%." · **College** switcher.

**Tiles.** Metrics seeded · Max score tracked · Evidence rows · Cycle = Annual.

**Buttons.** Coverage matrix · View full rubric (soon).

**Five parameter cards.**

| Card | Weight | Sub-metrics |
|---|---|---|
| TLR — Teaching, Learning & Resources | 30% | TLR_SS, TLR_FSR, TLR_FQE, TLR_FRU |
| RPC — Research & Professional Practice | 30% | RPC_PU, RPC_QP, RPC_IPR, RPC_FPPP |
| GO — Graduation Outcomes | 20% | GO_GUE, GO_GPH, GO_GMS, GO_GPHD |
| OI — Outreach & Inclusivity | 10% | OI_RD, OI_WD, OI_ESCS, OI_PCS |
| PR — Perception | 10% | PR_PR |

Each card's list opens automatically when it contains a gap. Per metric you see a count or **Not captured yet**, a detail line (e.g. "This is built from records elsewhere in the platform; there is no single screen to fill it in."), an owner line ("Owner: <name>" / "No owner assigned yet — usually kept by <role>" / "Owner not visible to you") and, where a screen exists, **Fix this**.

**Where NIRF evidence comes from today.** Faculty metrics (TLR_FP / TLR_QF / TLR_FE) ← HR snapshots; publications (RPC_PU / RPC_QP) ← the publications register; patents (RPC_IP) ← IP filings; TLR_SS ← admissions. PR_PEER can never be held by JKKN (NIRF sources it from its own survey).

---

## 11. NBA

**Path:** `/accreditation/nba` · **Key:** `accreditation.nba.view`

**What it is for.** Programme-level accreditation readiness against the NBA Tier-II 1000-point rubric (≥750 full · 600–749 three-year · 400–599 provisional). Scope: engineering programmes at JKKN College of Engineering.

**Header.** Programme picker ("All engineering programs" + each programme). *Today the picker is display-only — counts are cluster-wide regardless of the selection.*

**Tiles.** Metrics seeded · Tier-II max (1000) · Evidence rows · Eligible programs.

**Buttons.** Coverage matrix · SAR generator (soon).

**Ten criterion cards (points).** 1 Vision, Mission & PEOs (50) · 2 POs & COs (150) · 3 Curriculum & Syllabus (100) · 4 Teaching-Learning Processes (100) · 5 Students' Performance (150) · 6 Faculty Information & Contributions (200) · 7 Facilities & Technical Support (80) · 8 Continuous Improvement (50) · 9 First-year Academics (50) · 10 Student Support Systems (50). Each has a **View N metrics** list.

**Extra section.** **Uncategorised NBA metrics** appears when a metric matched no criterion.

**Note.** CO/PO attainment is measured once from declared results and filed for **both** NAAC and NBA — the "collect once, report many" showcase.

---

## 12. QS

**Path:** `/accreditation/qs` · **Key:** `accreditation.qs.view`

**What it is for.** A **placeholder** for the QS World University Rankings. Nothing is computed. The banner reads "Scaffolding placeholder. Deep QS ranking integration lands in Phase 2 … after Jan 2027."

**Six indicator cards.** AR Academic Reputation (40%) · ER Employer Reputation (10%) · FSR Faculty/Student Ratio (20%) · CIT Citations per Faculty (20%) · ISF International Faculty (5%) · ISS International Students (5%). Badges: **Seeded** (a catalogue row exists — AR and CIT today) or **Coming Phase 2+** (dimmed). A seeded card shows "— / <max> pts" — nothing is scored.

**Workflow.** Informational only. Expect no change until Phase 2.

---

## 13. DCI

**Path:** `/accreditation/dci` · **Key:** `accreditation.dci.view`

**What it is for.** Dental Council of India annual inspection readiness, fixed to **JKKN Dental College** (auto-detected by IQAC code `DENT`).

**Header.** "DCI — JKKN Dental College" with an **Institution** box (no switcher).

**Tiles.** Metrics seeded · Max score tracked · Evidence rows · Cycle = Annual inspection ("Next: Annual (schedule TBD)").

**Six category cards.** Infrastructure · Faculty · Patient Load · Clinical Exposure · Research & Publications · Ethics & Compliance. Metrics are bucketed by keywords in their category (e.g. "patient", "opd", "ipd" → Patient Load). Uncategorised metrics are hidden until re-tagged.

**Warnings.** "JKKN Dental College not found" if the institution row is missing its IQAC code. The DCI catalogue today holds only placeholder entries, so coverage figures describe the catalogue, not DCI's full schedule.

---

## 14. PCI

**Path:** `/accreditation/pci` · **Key:** `accreditation.pci.view`

**What it is for.** Pharmacy Council of India readiness (PCI Regulations 2020), fixed to **JKKN College of Pharmacy** (IQAC code `PHAR`).

**Header.** "PCI — JKKN College of Pharmacy" with a **Scope (fixed)** box.

**Tiles.** Metrics seeded · Evidence rows · Cycle = Annual inspection · **Programs** = D.Pharm, B.Pharm, Pharm.D, M.Pharm.

**Buttons.** Coverage matrix · SIF export (soon) · Hospital affiliation docs (soon).

**Six category cards.** Course Approval & Intake · Faculty · Infrastructure · Hospital Affiliation · Research · Pharmacy Practice. Plus **Uncategorised PCI metrics** when needed.

---

## 15. INC

**Path:** `/accreditation/inc` · **Key:** `accreditation.inc.view`

**What it is for.** Indian Nursing Council readiness (INC Regulations 2021), fixed to **JKKN College of Nursing** (IQAC code `NURS`).

**Header.** "INC — <college>" with badges for the IQAC code, "Annual inspection" and "Single-institution scope".

**Tiles.** Metrics seeded · Evidence rows · Cycle · **Programs** = 4 (B.Sc Nursing 4 yr · M.Sc Nursing 2 yr · Post-Basic B.Sc 2 yr · GNM 3 yr).

**Buttons.** Coverage matrix · Inspection calendar (soon) · INC faculty roster export (soon).

**Six category cards.** Intake & Admission · Faculty · Clinical Exposure · Infrastructure · Curriculum Delivery · Research & Pubs. Plus **Other INC metrics (N)** for anything unmatched.

**Planned feeds.** HR faculty registration → Faculty; clinical placements → Clinical Exposure; curriculum delivery logs → Curriculum; M.Sc dissertations → Research.

---

## 16. NCTE

**Path:** `/accreditation/ncte` · **Key:** `accreditation.ncte.view`

**What it is for.** Teacher-education compliance, fixed to **JKKN College of Education** (IQAC code `EDUC`).

**Header.** "NCTE — Teacher Education Compliance" with a **Scope (auto-detected)** box and badge "Fixed scope — 1 college".

**Tiles.** Metrics seeded · Max score tracked · Evidence rows · Cycle = Periodic.

**Buttons.** Coverage matrix · All 10 bodies.

**Card "Programs under NCTE Recognition".** B.Ed · M.Ed · D.El.Ed (2 years each).

**Five domain cards.** Recognition Status · Intake Compliance · Infrastructure · Curriculum Transaction · Evaluation.

---

## 17. AICTE

**Path:** `/accreditation/aicte` · **Key:** `accreditation.aicte.view`

**What it is for.** Annual Extension of Approval compliance for the technical colleges. Scope is **auto-aggregated across Engineering and Pharmacy** (evidence is summed across both).

**Header.** "AICTE — Technical Education Compliance" with a **Scope (auto-detected)** box listing each technical college and a badge "N technical colleges".

**Tiles.** Metrics seeded · Max score tracked · Evidence rows · Cycle = Annual EoA.

**Buttons.** Coverage matrix · NBA program accreditation · All 10 bodies.

**Five domain cards.** Intake Approval (EoA) · Faculty Ratios (1:15 UG, 1:12 PG) · Infrastructure · Industry Partnerships · Student Support.

---

## 18. UGC

**Path:** `/accreditation/ugc` · **Key:** `accreditation.ugc.view`

**What it is for.** University Grants Commission compliance — applies to every college, continuous cycle: 2(f)/12(B) status, anti-ragging, grievance redressal, fee structures, faculty recruitment, student welfare.

**Header.** "UGC — Compliance Dashboard" with a **College** switcher.

**Tiles.** Metrics seeded · Max score tracked · Evidence rows · Cycle = Continuous.

**Live-evidence card (red).** "Anti-ragging evidence is LIVE on production" — every anti-ragging affidavit recorded in the Anti-ragging module automatically becomes UGC evidence (and NAAC Attr 7, NIRF Outreach, NBA 1.2.2). The card shows the current count for your scope.

**Six domain cards.** 2(f) / 12(B) Status · **Anti-Ragging** (red border, "Live" badge) · Grievance Redressal (UGC Regulations 2023 §5 — fed by NAAC → Grievance resolutions) · Fee Structures · Faculty Recruitment · Student Welfare.

**Workflow.** Pick your college → confirm the anti-ragging count matches the affidavits you have collected → resolve grievances in the register to feed Grievance Redressal.

---

## 19. CAC

**Path:** `/accreditation/cac` · **Keys:** `accreditation.cac.view`; the UGC readiness checklist additionally needs `accreditation.cac.readiness.view`; the brief's ownership block needs `accreditation.naac.narrative.view` · **Who:** council members, Principals, CEO / Managing Director, IQAC coordinators

### 19.1 What the Cluster Academic Council is

The one entry in the accreditation row that is **not an outside regulator**. The ten bodies inspect JKKN and rate it; the council runs the other way round — it is how JKKN's own colleges and schools decide something **once**, so the decision holds everywhere.

**How to tell CAC from IQAC.** Ask "how many colleges have to move?" If one college can change the number on its own, it belongs to that college's IQAC. If it only moves when two or more colleges act together, it is the council's.

**There is no score, no percentage, no ordering of colleges, and nothing is submitted to anybody.** That is a decision, not an unfinished screen.

### 19.2 The CAC page

1. **Header (amber)** — "Cluster Academic Council (CAC)" with the explanation above.
2. **Tiles** — **Councils on record · Institutions covered (N of M) · Council members · Reports to an outside body = No**.
3. **Buttons** — **One-page brief** · **All committees and councils** · **Accreditation hub**.
4. **Council card(s)** — name, "Spans N institutions", the member institutions, "Filed under <X> — a filing location, not an owner", formed / term-end dates, **Manage →**. Inside: **Members** (role badges) and **Meetings** (latest 5 with status).
   - **Empty state "No cluster council has been formed yet"** with the steps: open *All committees and councils* → **New committee** → type **Cluster council (CAC)** → tick every institution (at least two) → save.
5. **"The measured metrics now live with the IQAC"** — pointer to the CEO framework matrix on the IQAC page (**Open the metrics →**).
6. **"What the cluster does together"** — four read-only panels from records the platform already holds. Every figure is the **whole cluster's**, identical for every viewer:
   - **From a started solution to a real user** — started → built → used funnel, and "Where the work landed"; table per institution (Departments · Producing · Solutions · Phases · Publications · Currently dormant · At risk). Empty cells say "none yet", never 0.
   - **What the colleges give each other** — teaching across campuses (Giver → Receiver · assignments · people) and resources booked across campuses, split into **College to college** and **With the central office** (hub traffic is never counted as peer collaboration).
   - **Courses taught in more than one college** — distinct titles, titles taught in >1 college, widest span; read as a floor (titles matched by exact spelling).
   - **Who is not connected, and who is leaned on** — colleges with no link to a sibling, and the concentration reading ("<College> receives N of the M cross-campus teaching assignments"), stated both as collaboration and as a staffing dependency.
7. **"What the UGC guidance describes, set against JKKN"** — a six-row checklist from UGC's 2022 multidisciplinary-institution guidelines §6.3. "Nothing on this list is due to anybody." Rows: written agreement · council constituted · council decisions on record · shared research agenda · pooled facilities · shared teaching. Status badges: **Already happening** · **Nothing recorded yet** (fixable by entering a record — fix button provided, e.g. **Open the agreements register**) · **Nothing records this** (no screen exists yet) · **Waiting on the line above** · **Read on the council's own page**.
8. **Footer** — where a council is stored (a committee row of type `cluster`, filed under NAAC because the committees table has no label for JKKN's own council).

### 19.3 The one-page brief — `/accreditation/cac/brief`

One side of A4 with the same live figures, for walking into a sitting with paper. Buttons **Back to the council** and **Print this page** (menus and buttons are left off the paper).

Sheet sections: **What the council is for** · **The cluster, as recorded today** (councils, institutions covered, members, metrics with a number "N of 49") · **What passes between the colleges** · **Who is accountable** (pairs with a name against them "N of M", confirmed, waiting, declined) · **Three things you can do about it**: (1) name one accountable person per body per college on the owner desk; (2) put one "not captured yet" metric on the next agenda and decide which module will hold the record; (3) record the sitting.

### 19.4 Workflow (council secretary / coordinator)

1. Form the council once (NAAC → IQAC Committees → New committee → Cluster council).
2. Before each sitting, open **One-page brief** → **Print this page**.
3. At the sitting, run the loop review on the council's committee page (review carried items, pass resolutions with owners, tag **Affected colleges**).
4. After the sitting, close the meeting so the record exists.
5. Act on the brief's three recommendations between sittings.

---

## Appendix A — Automatic jobs and when they run

| Job | When | What it does | Sends anything? |
|---|---|---|---|
| Loop evidence roll-up | Daily 04:23 IST | Turns every measured self-improving-loop cycle (teaching feedback, induction, mess menu) into NAAC 7.3 evidence | No |
| Utility readings → NAAC 10.2 / 10.3 | Nightly | Aggregates monthly meter readings into sustainability evidence | No |
| CAC attendance roll-up | Nightly | Computes the all-history attendance figure on the IQAC "What the council can measure" matrix | No |
| CO/PO attainment | Weekly | Files course-outcome attainment as NAAC + NBA evidence; re-stamped rows land on the next run | No |
| Owner invitations | Daily 01:42 | One in-app notification per newly named owner, linking to My Gaps | In-app |
| Ownership change notify | Every 6 h | Tells new owner, previous owner, body owner and the college IQAC officer of any ownership change | In-app |
| Owner digest | Not scheduled | Built but deliberately not armed | No |
| Narrative drafter | Nightly 00:52 IST (**switched off**) | Drafts NAAC narratives from evidence and runs the grounding gate | No |
| Narrative reminders | Daily 08:42 IST | 3-day nudge to the owner, 7-day escalation to super admins | In-app |
| Narrative cap-out notice | Nightly 01:22 IST | One "Needs a human" notice per narrative blocked after 5 attempts | In-app |
| Committee AI drafts + sitting proposals | Nightly (**switched off**) | Drafts brief / agenda / ATR skeleton and proposes overdue sittings | No |
| Grievance SLA check | Hourly | Marks tickets past their deadline as breached | No |
| Evidence fan-out triggers | Instant | Anti-ragging affidavits, resolved grievances, MoUs / grants, closed feedback cycles, admissions → evidence rows | No |

**No page in this module sends email, SMS or WhatsApp.** All notifications are in-app.

---

## Appendix B — Glossary

| Term | Definition |
|---|---|
| **Awarding body** | An outside organisation that inspects, approves or ranks a college. |
| **IQAC** | Internal Quality Assurance Cell — JKKN's own cell. Principal is IQAC Chairman; HoDs are Department IQAC Coordinators. |
| **CAC** | Cluster Academic Council — JKKN's own council for decisions spanning several colleges. |
| **Metric** | One question a body asks, with a code (e.g. 7.3.d). |
| **Evidence** | A real record that answers a metric. Emitted from everyday work, never typed into an accreditation form. |
| **Not captured yet** | Nobody has collected this. Not a zero. |
| **Answerable** | At least one evidence row exists for the metric. |
| **Owner** | The person recorded against one college-and-metric pair (or a whole body in one college). |
| **Body owner** | Owner recorded with the metric left blank — accountable for the body's whole list in that college. |
| **Not opened yet / Opened / Declined** | Owner assignment status. Assignment is ownership; the status only records whether they have opened their page. |
| **Grounded / Ungrounded** | Whether every figure, date and code in an AI draft traces to cited evidence. Ungrounded = blocked. |
| **Awaiting owner okay** | An AI draft written and waiting for its owner. Nothing moves out of this state on its own. |
| **Loop review** | The IQAC meeting cycle: pass resolutions with owner + due date; next meeting reviews them as done / carried / dropped. |
| **Carried / strike** | A resolution carried forward. Two strikes show "Escalate to Director". |
| **ATR** | Action-Taken Report — the minutes produced when a meeting is closed. |
| **Binary framework** | NAAC Reforms 2024: 10 attributes, 900 marks per college, yes/no marks per metric. |
| **DCF / AQAR / SSR** | NAAC Data Capture Format / Annual Quality Assurance Report / Self-Study Report. |
| **DPDPA** | Digital Personal Data Protection Act 2023 — the consent basis for survey exports. |
| **Collect once, report many** | Store a fact once and file it against every metric it satisfies. |
| **Cluster view** | A union across colleges; higher than any single college's figure. |
| **Handover** | A Director-issued time-limited loan of a permission to one named person. |

---

## Appendix C — Frequently asked questions

**A metric in my department says "Not captured yet". Is our score zero?**
No. It means no source is wired to that question yet. Tell your IQAC coordinator which everyday record would answer it.

**I did the work yesterday but the count has not moved.**
Evidence is written overnight. Check again tomorrow. Do not re-enter it.

**I was told I own a metric but My Gaps is empty.**
You cannot add yourself. Ask IQAC to record you on **Manage → Assign Owners**. If your role cannot read the owner list, the page tells you so.

**The owner desk shows me the list but saves nothing.**
Naming someone else needs `accreditation.naac.narrative.manage`. Principals get it by Director handover, not by role. Ask the Director for the desk.

**Can I decline an assignment?**
Yes. Declining is a genuine option and is more useful than an assignment nobody acts on. IQAC sees it and reassigns.

**The AI draft is marked Ungrounded. What do I do?**
Nothing can advance it. Read the "Ungrounded tokens" list, find which figure has no evidence behind it, and either file the missing evidence in its module or rewrite that line without the figure. Then okay it.

**Why can't I put a number on the meeting agenda?**
Director's rule: any number readable from the platform belongs in the brief. The agenda is for decisions. "Carried twice" in words is fine; "84%" is not.

**I left a utility reading blank. Is that recorded as 0?**
No. Blank means "not read". 0 means "nothing used". Keep them apart.

**Why does the cluster figure look higher than my college's?**
Cluster view is a union: a metric counts as covered if any college has evidence. Pick your college for a figure you could claim.

**Why can I see the CAC page but not the UGC readiness checklist?**
It has its own key, `accreditation.cac.readiness.view`. Ask your IQAC coordinator.

**Employer survey links — does the platform email them?**
Not yet. Download **Links CSV** and send them yourself.

**Who do I ask?**
Your college's IQAC coordinator first; then the Accreditation Officer (iqac@jkkn.ac.in). Every blocked page names the exact permission key to request.
