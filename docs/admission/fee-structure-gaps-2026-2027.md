# Fee-Structure Gaps — 2026-2027 Admission Year

**Generated:** 2026-05-21
**Scope:** All learners with `admission_year.program_start_year = 2026`, excluding `lifecycle_status IN ('rejected', 'inactive')`.
**Total live 2026-2027 enquiries audited:** 683
**Match rate:** 449 / 683 (66%) find a matching `admission_fee_structures` row
**Unmatched:** 234 learners
- 157 missing one or more of the 8 fee-resolution dimensions on their learner profile
- 77 have all 8 dims filled but no matching fee-structure row exists

---

## Part 1 — Programmes with ZERO fee-structures created

These programmes have **no `admission_fee_structures` row at all**, so every enquiry under them will fail fee resolution. Admin must seed the FIRST fee-structure row for each.

| # | Institution | Department | Programme code | Programme name |
|--:|---|---|---|---|
| 1 | JKKN College of Arts and Science (Aided) | CAS-AD-3 | UCH | B.Sc. CHEMISTRY |
| 2 | JKKN College of Arts and Science (Self) | CAS-SF-1 | UCS | B.Sc. COMPUTER SCIENCE |

---

## Part 2 — Existing structures, missing specific combos

These programmes already have some fee-structures, but the specific `(programme × quota × community × accommodation)` combination is missing. Each row below tells admin exactly which combo to seed.

### 🔴 JKKN College of Arts and Science (Self) — 41 learners across 15 missing combos

| Programme | Quota | Community | Accommodation | Learners |
|---|---|---|---|--:|
| B.Sc. COMPUTER SCIENCE | Management Quota | BC | Day Scholar | 13 |
| B.Sc. COMPUTER SCIENCE | Management Quota | MBC | Day Scholar | 7 |
| BACHELOR OF BUSINESS ADMINISTRATION | Management Quota | MBC | Day Scholar | 3 |
| B.Sc. COMPUTER SCIENCE | Management Quota | BCM (Backward Class Muslim) | Day Scholar | 3 |
| BACHELOR OF BUSINESS ADMINISTRATION | Management Quota | SC | Day Scholar | 2 |
| BACHELOR OF BUSINESS ADMINISTRATION | Management Quota | SCA | Day Scholar | 2 |
| BACHELOR OF BUSINESS ADMINISTRATION | Government Quota | MBC | Day Scholar | 2 |
| B.Sc. COMPUTER SCIENCE | Management Quota | SC | Day Scholar | 2 |
| B.Sc. COMPUTER SCIENCE | Government Quota | MBC | Day Scholar | 2 |
| BACHELOR OF BUSINESS ADMINISTRATION | Management Quota | BC | Day Scholar | 1 |
| B.COM. COMPUTER APPLICATION | Government Quota | SC | Day Scholar | 1 |
| B.Sc. COMPUTER SCIENCE | Government Quota | BC | Day Scholar | 1 |
| B.Sc. COMPUTER SCIENCE | Management Quota | SCA | Day Scholar | 1 |
| B.Sc. COMPUTER SCIENCE (AI & DATA SCIENCE) | Government Quota | OC | Day Scholar | 1 |
| B.Sc. PHYSICS | Management Quota | BC | Day Scholar | 1 |

### 🟠 JKKN College of Engineering and Technology — 27 learners across 10 missing combos

| Programme | Quota | Community | Accommodation | Learners |
|---|---|---|---|--:|
| B.E. Electrical and Electronics Engineering | Government Quota | MBC | Day Scholar | 8 |
| B.E. Mechanical Engineering | Government Quota | MBC | Day Scholar | 6 |
| B.E. Electrical and Electronics Engineering | Government Quota | BC | Day Scholar | 4 |
| B.E. Mechanical Engineering | Government Quota | BC | Day Scholar | 3 |
| B.E. Electrical and Electronics Engineering | Government Quota | SC | Day Scholar | 1 |
| B.E. Electrical and Electronics Engineering | Government 7.5% Quota | SC | Day Scholar | 1 |
| B.E. Electrical and Electronics Engineering | Government 7.5% Quota | BC | Day Scholar | 1 |
| B.E. Mechanical Engineering | Government Quota | BCM (Backward Class Muslim) | Day Scholar | 1 |
| B.Tech. Information Technology | Government Quota | SC | Day Scholar | 1 |
| M.E. Computer Science and Engineering | Government Quota | BC | Day Scholar | 1 |

### 🟢 JKKN College of Allied Health Sciences — 5 learners across 5 missing combos

| Programme | Quota | Community | Accommodation | Learners |
|---|---|---|---|--:|
| BSC (AECT) | Government Quota | MBC | Day Scholar | 1 |
| BSC (MRS) | Management Quota | BC | Day Scholar | 1 |
| BSC (MRS) | Management Quota | MBC | Day Scholar | 1 |
| BSC (PA) | Government Quota | SC | Day Scholar | 1 |
| BSC (RIT) | Management Quota | MBC | Day Scholar | 1 |

### 🟢 JKKN College of Nursing and Research — 2 learners across 2 missing combos

| Programme | Quota | Community | Accommodation | Learners |
|---|---|---|---|--:|
| BSC (Nursing) | Management Quota | MBC | Day Scholar | 1 |
| PBBSC (Nursing) | Government Quota | BC | Day Scholar | 1 |

### 🟢 JKKN College of Pharmacy — 1 learner

| Programme | Quota | Community | Accommodation | Learners |
|---|---|---|---|--:|
| BPHARM | Management Quota | MBC | Day Scholar | 1 |

---

## Totals

| Category | Count |
|---|--:|
| Programmes with **zero** fee-structures (Part 1) | **2** |
| Specific combos missing from existing programmes (Part 2) | **33** |
| Learners blocked by Part 1 | (depends on enquiry count for those 2 programmes) |
| Learners blocked by Part 2 | **77** |

---

## Action plan

1. **Admin to create** the 2 first-time programme fee-structures (Part 1) via the Fee Structure Matrix admin UI at `/admission/settings/fees-structure`.
2. **Admin to add** the 33 missing-combo rows (Part 2). Most-impactful first:
   - Arts (Self) — B.Sc. CSE × Management Quota × BC × Day Scholar (13 learners blocked)
   - Engineering — B.E. EEE × Government Quota × MBC × Day Scholar (8 learners blocked)
   - Engineering — B.E. MECH × Government Quota × MBC × Day Scholar (6 learners blocked)
3. **Tooling note** — the existing `/admission/settings/fees-structure/clone` UI can clone an existing structure's fee items to a new combo, which speeds up Part 2 dramatically when amounts are shared across communities.

---

## Methodology

Query joins `learners_profiles` → `admission_years` (filter `program_start_year=2026`) → `admission_fee_structures` × `admission_fee_structure_communities`. A "match" requires all 7 direct dims plus a row in the community bridge table for the learner's `community_category_id`.

Mode A (missing dims) and Mode B (no structure for the combo) are mutually exclusive — a learner can only be classified as Mode B if all 8 dims are populated.
