# Hostel Fees / Year-Aware Billing — Flow Diagrams

Companion to `2026-06-05-hostel-fees-campus-living-billing-design.md` and the implementation plan. Renders as diagrams on GitHub / Mermaid-aware viewers.

---

## 1. Fee ownership & routing (the big picture)

Who owns which fee, and where it becomes a bill.

```mermaid
flowchart TD
  A[Learner / Enquiry] --> B{accommodation_type<br/>code == 'hostel' ?}

  B -->|day scholar| C["ADMISSION owns academic fees<br/>application+university (yr1)<br/>tuition (per year), exam, transport"]
  B -->|hosteller| D["ADMISSION academic fees<br/>(resolution runs for ALL learners,<br/>writes learners_profiles.fee_items)"]
  D --> E["CAMPUS LIVING owns hostel + mess<br/>admission_packages -> hostel_fees<br/>per hostel_year (rolls yearly)"]

  C --> F["GENERATE: account transition /<br/>billing onboarding<br/>(day scholars only)"]
  D --> G
  E --> G["GENERATE: Campus Living<br/>'Generate Hostel-Year Bills'<br/>combined academic + hostel/mess<br/>(hostellers)"]

  F --> H[("billing_student_bills<br/>+ hostel_year_id, package_id,<br/>fee_source, applies_year_of_study<br/>+ per-cycle dedup indexes")]
  G --> H
```

> **Routing rule:** a hosteller's academic bills come from the Campus Living combined run (stamped with `hostel_year_id`), NOT from account transition — so the academic portion is never billed twice.

---

## 2. Academic fee resolution (year-of-study aware)

Runs for every learner; the only difference between a new and a continuing student is the year-of-study that filters the items.

```mermaid
flowchart TD
  S[Resolve academic fees] --> M["Match admission_fee_structures<br/>institution, degree, dept, programme,<br/>quota, community, admission_year (+gender)"]
  M --> Y{"year_of_study source"}
  Y -->|enquiry preview| Y1["assume year = 1<br/>(new admission)"]
  Y -->|saved / continuing| Y2["fn_learner_year_of_study()<br/>admission_year -> batch -> enquiry"]
  Y1 --> F
  Y2 --> F{"item.applies_to"}
  F -->|every_year| K[include item]
  F -->|first_year_only| L{year == 1 ?}
  F -->|specific_year = N| N{year == N ?}
  L -->|yes| K
  L -->|no| X[exclude item]
  N -->|yes| K
  N -->|no| X
  K --> W[(Write learners_profiles.fee_items)]
```

---

## 3. Hostel-year bill generation (Campus Living) — operator flow

```mermaid
sequenceDiagram
  actor Op as Operator (hostel staff)
  participant UI as Campus Living • Residents
  participant RPC as campus_living_generate_hostel_year_bills
  participant DB as Postgres

  Op->>UI: Open "Generate Hostel-Year Bills"
  Op->>UI: Select hostel year (default = is_current)
  UI->>RPC: dry_run = true (selected learner ids)
  RPC->>DB: fn_learner_year_of_study() per learner
  RPC->>DB: applicable academic items + campus_living_resolve_hostel_fee()
  RPC->>DB: existing bills for (student, hostel_year, category/package)
  RPC-->>UI: per student → {proposed, already_billed, new}
  UI-->>Op: Preview table (year, package, fee detail, status)
  Op->>UI: Click Generate
  UI-->>Op: WARNING — X already billed (skip), Y new bills
  Op->>UI: Confirm
  UI->>RPC: dry_run = false
  RPC->>DB: INSERT bills, stamp hostel_year_id / package_id / fee_source
  DB-->>RPC: dedup indexes block any duplicate
  RPC-->>UI: {generated, skipped, failed}
  UI-->>Op: Resident status → Fully / Partially / Not generated
```

---

## 4. "Should this bill be created?" — per-item dedup decision

```mermaid
flowchart TD
  P["Proposed item<br/>(student, hostel_year, category|package, fee_source)"] --> Q{fee_source == 'ad_hoc' ?}
  Q -->|yes| INS["INSERT<br/>(additional bill always allowed)"]
  Q -->|no| R{"active bill exists for<br/>(student, hostel_year, category)<br/>or (student, hostel_year, package) ?"}
  R -->|yes| SKIP["SKIP + count in warning"]
  R -->|no| INS2["INSERT<br/>stamp hostel_year/package/source"]
```

---

## 5. Year-over-year lifecycle (why dedup is per hostel year)

```mermaid
stateDiagram-v2
  [*] --> HY2425: hostel_year 2024-25 (is_current)
  HY2425 --> HY2425: re-run SAME year → BLOCKED (dedup + warning)
  HY2425 --> HY2526: year rolls → is_current advances, year_of_study + 1
  HY2526 --> HY2526: re-run SAME year → BLOCKED
  HY2526 --> HY2627: year rolls again
  HY2627 --> [*]: graduation / exit

  note right of HY2526
    New hostel year = new (student, hostel_year)
    key, so generation succeeds; only re-running
    the SAME year is a "duplicate".
  end note
```

---

## 6. Data model (entity relationships)

```mermaid
erDiagram
  admission_years ||--o{ learners_profiles : "admission_year_id (FIXED)"
  admission_years ||--o{ admission_packages : "admission_year_id"
  admission_packages ||--o{ hostel_fees : "package_id (flat fee)"
  hostel_years ||--o{ hostel_fees : "hostel_year_id (ROLLS)"
  hostel_categories ||--o{ hostel_fees : "hostel_category_id"
  mess_categories ||--o{ hostel_fees : "mess_category_id"

  admission_fee_structures ||--o{ admission_fee_structure_items : "fee_structure_id"
  billing_categories ||--o{ admission_fee_structure_items : "billing_category_id (+applies_to)"

  learners_profiles ||--o{ billing_student_bills : "student_id"
  hostel_years ||--o{ billing_student_bills : "hostel_year_id (STAMPED)"
  admission_packages ||--o{ billing_student_bills : "package_id"
  billing_categories ||--o{ billing_student_bills : "item_category_id"

  learners_profiles ||--o{ learner_package_assignment : "learner_id (=profiles.id)"
  admission_packages ||--o{ learner_package_assignment : "package_id (override)"
  hostel_years ||--o{ learner_package_assignment : "hostel_year_id"
```

**Two independent year axes:** `admission_year_id` (fixed, on the profile, finds the package) vs `hostel_year_id` (rolls yearly, on `hostel_fees` + stamped on each bill, finds the per-cycle fee).
