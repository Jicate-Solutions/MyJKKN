# Paradigm Shift Dashboard — Flagged Decisions Spec

**Date:** 2026-03-20
**Status:** Decided (interview complete)
**Context:** 5 design decisions flagged during fresh-eyes review, resolved via interview

---

## Decision 1: Composite Score Revenue Weighting

**Question:** Should revenue dominate the leaderboard ranking?
**Decision:** Keep current balance.

**Formula (unchanged):**
```
score = problems * 1 + solutions * 10 + clients * 5 + (revenue / 10000) * 3 + publications * 15 + prototypes * 5 + ip_retained * 20 + trl4_products * 25 + training * 2
```

**Rationale:** Revenue at /10000 * 3 gives meaningful weight without allowing it to dominate a well-rounded department. A department with ₹2L and nothing else (60 pts) still loses to one with 4 publications + 2 solutions + 3 clients (95 pts).

**Action:** No code change needed.

---

## Decision 2: Products — Cumulative + FY Badge

**Question:** Should IP/TRL products be cumulative or fiscal-year scoped?
**Decision:** Cumulative with "New this FY" badge everywhere.

**Details:**
- All products count toward tier calculation (ip_retained and trl4_products metrics)
- Products created/updated in current FY get a visual "New this FY" badge
- Badge appears in BOTH leaderboard table AND department detail page
- Cumulative approach recognizes departments that were already innovating

**Action needed:**
- Add `created_at` check for FY badge in leaderboard table
- Add `created_at` check for FY badge in department detail metric card
- Service already queries products without FY filter (correct for cumulative)

---

## Decision 3: Comparison Table — All 9 Metrics

**Question:** Show 5 or all 9 metrics in comparison with institutional average?
**Decision:** Show all 9 metrics.

**Rationale:** Complete transparency. HODs see exactly where they stand on every metric.

**Action needed:**
- Update department-detail.tsx comparison section to show all 9 metrics instead of hardcoded 5

---

## Decision 4: Banner Auto-Update + All Staff Access

**Question:** Who sees the dashboard and what happens to the banner after April 1?
**Decision:** All staff see everything. Banner auto-updates.

**Details:**
- Before April 1, 2026: "Every department becomes a Solutions Department from April 1, 2026"
- After April 1, 2026: "All departments are now Solutions Departments"
- No role-based access restriction — transparency drives healthy competition
- Revenue visible to all authenticated users

**Action needed:**
- Update solutions-dashboard.tsx banner to use date-based conditional text
- No permission changes needed (current read access is sufficient)

---

## Decision 5: Revenue Visibility

**Question:** Should revenue data be restricted to certain roles?
**Decision:** No restriction. All staff see everything.

**Rationale:** Transparency drives competition. If departments can see each other's revenue, it motivates them to generate their own.

**Action:** No code change needed (already unrestricted).

---

## Implementation Summary

| Decision | Code Change Required |
|----------|---------------------|
| 1. Revenue weight | None (keep as is) |
| 2. Products FY badge | Add badge UI in leaderboard + detail |
| 3. All 9 comparison | Expand comparison table from 5 to 9 |
| 4. Banner auto-update | Date conditional in dashboard banner |
| 5. Revenue visibility | None (keep as is) |

**3 changes needed, 2 already correct.**
