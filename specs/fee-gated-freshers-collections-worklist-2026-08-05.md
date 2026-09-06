# Fee-gated current-intake learners — collections worklist

**Date:** 2026-08-05
**Production Supabase ref:** `kvizhngldtiuufknvehv`
**Snapshot instants:** headline + buckets `11:16:04 UTC`; named worklist `11:19:59 UTC`
**Mode:** READ-ONLY report. No learner was activated, no record changed, no bill touched.

---

## Headline

| | |
|---|---|
| Fee-gated learners (current intake, `reserved` or `admitted`) | **992** |
| Total outstanding | **₹6,24,12,400** (₹6.24 crore) |
| Colleges involved | 6 colleges + 1 school |
| Learners within ₹10,000 of clearing | **7** — worth **₹37,800** |
| Learners within ₹25,000 of clearing | **75** — worth **₹14,89,000** |

**The one-line answer:** collecting the smallest paying bucket — **7 learners owing ₹1–10,000 —
clears ₹37,800 and unblocks 7 seats.** Widening to ₹25,000 reaches **75 learners for ₹14,89,000**,
which is 7.6% of the fee-gated population for 2.4% of the money.

---

## ⚠️ Three corrections to the working assumptions

**1. The count is 992, not 988.** A fresh read at 11:16:04 UTC returns 992 learners at
`reserved`/`admitted` on a current admission year. The extra four are in the 6 colleges, not
Nattraja.

**2. The number moves while you read it.** Total outstanding fell from ₹6,24,37,900 to
₹6,24,12,400 — **₹25,500 collected in the ~4 minutes between two of my own queries.** Every figure
here is a photograph, not a fact. Re-run the appendix SQL before acting on any single number.

**3. Collecting the money will NOT activate anyone.** This is the most important operational point
in the document and it is covered in the next section.

---

## What clearing the fee actually does

Paying in full moves a learner to **`admitted`** and stops there. It does **not** make them
`active`, and `active` is the status that grants a login and puts a learner on class rosters.

The reason is in the platform's own promotion function,
`evaluate_learner_status_after_payment`. Its target-selection predicate excludes any status that
gates login:

```sql
AND s.gates_login = false          -- 'active' has gates_login = true, so it is filtered out
```

Only two learner statuses carry a fee threshold:

| status | threshold | gates_login | reachable by payment? |
|---|---|---|---|
| `admitted` | 30% paid | false | ✅ yes |
| `active` | 60% paid | **true** | ❌ **never** |

Confirmed against every status transition ever recorded in `learners_profile_status_history`:
1,004 rows → `reserved`, 116 rows → `admitted`, and **zero rows → `active`**. In the platform's
entire history, payment has never once produced an active learner.

The final step from `admitted` to `active` is done by application code
(`checkAndAutoActivate` in `lib/services/learner-profile-service.ts`), which fires only when a team
member opens the learner's record in the app and **saves** it, with four fields present —
`college_email` (must end `@jkkn.ac.in`), `academic_year_id`, `semester_id`, `section_id`.

**Practical consequence for the accounts team:** collection is necessary but not sufficient. Each
cleared learner still needs a records team member to open and save the profile. Budget that second
step — otherwise money arrives and the learner still cannot log in, which reads to the family as
"we paid and nothing happened".

---

## How "outstanding" is defined here

Not invented. Taken from the platform's own source of truth — the same basis used by
`vw_learner_payment_progress` and by the promotion function above:

> **outstanding = SUM(`billing_student_bills.balance_amount`) per learner, excluding rows whose
> `status` is `'superseded'`.**

Bill statuses that exist estate-wide: `unpaid` (5,516), `paid` (4,302), `partially_paid` (1,298),
`superseded` (60), `cancelled` (20). This cohort contains no `cancelled` bills, so no adjustment
for them is needed.

A learner with no bill rows at all resolves to ₹0 via `COALESCE`.

> ⚠️ **Do not cross-check these totals against the `/api/b2a/billing/outstanding` endpoint — it
> under-reports.** That route filters `.in('status', ['unpaid','partial','overdue'])`. The values
> `partial` and `overdue` do not exist in this database; the real value is `partially_paid`. The
> endpoint therefore silently drops every partially-paid bill — **₹3,15,48,900 of live balance in
> this cohort alone**, roughly half the total. Flagged for a separate ticket.

---

## Outstanding by college

| College | Learners | Outstanding | Avg per learner |
|---|---:|---:|---:|
| JKKN College of Pharmacy | 168 | ₹2,12,78,500 | ₹1,26,658 |
| JKKN College of Arts and Science (Self) | 479 | ₹1,44,92,000 | ₹30,255 |
| JKKN College of Engineering and Technology | 205 | ₹1,27,98,900 | ₹62,434 |
| JKKN College of Nursing and Research | 81 | ₹89,32,000 | ₹1,10,272 |
| JKKN College of Allied Health Sciences | 43 | ₹48,75,500 | ₹1,13,384 |
| JKKN College of Education | 1 | ₹35,500 | ₹35,500 |
| Nattraja Vidhyalya CBSE | 15 | ₹0 | ₹0 |
| **Total** | **992** | **₹6,24,12,400** | ₹62,916 |

**Read this table for shape, not just size.** Pharmacy holds 34% of the money on 17% of the
learners. Arts and Science is the mirror image — 48% of the learners on 23% of the money, and it is
the only college whose entire cohort sits under ₹50,000 each. Those are two different collection
problems: Pharmacy is a small number of large conversations, Arts and Science is a large number of
small ones.

### The Nattraja 15 are not a collections target

All 15 owe ₹0 because **no bill was ever raised against them** — zero rows in
`billing_student_bills`. They are test fixtures (sentinel ids `c0ffee00-…`, names prefixed
`[TEST]`, emails on the reserved `@example.invalid` domain), not real people. They are excluded
from every collections figure below. See the companion document
`nattraja-15-activation-runbook-2026-08-05.md`.

---

## Distribution by amount owed

Bucket edges were chosen from the actual shape of the data, not from round numbers. Two natural
gaps decide them:

- **A clean break between ₹8,300 and ₹11,300** — nobody owes anything in between. That is a real
  boundary, so ₹10,000 is a genuine cut rather than an arbitrary one.
- **A hard wall at ₹25,000** — 47 learners sit between ₹20,400 and ₹24,900, then 164 land at
  ₹25,000–₹29,500. The ₹25,000 cluster is a fee-instalment size, not a coincidence, so cutting
  there separates "nearly done" from "one instalment behind".

Above ₹50,000 the conventional ₹50k / ₹1L / ₹2L edges hold up, so they are kept.

| Bucket | Learners | % of learners | Outstanding | % of money |
|---|---:|---:|---:|---:|
| ₹0 *(the 15 fixtures — not collectable)* | 15 | 1.5% | ₹0 | 0.0% |
| **₹1 – 10,000** | **7** | 0.7% | **₹37,800** | 0.1% |
| **₹10,001 – 25,000** | **68** | 6.9% | **₹14,51,200** | 2.3% |
| ₹25,001 – 50,000 | 475 | 47.9% | ₹1,61,84,400 | 25.9% |
| ₹50,001 – 1,00,000 | 264 | 26.6% | ₹1,90,71,000 | 30.6% |
| ₹1,00,001 – 2,00,000 | 136 | 13.7% | ₹1,89,60,500 | 30.4% |
| Above ₹2,00,000 | 27 | 2.7% | ₹67,07,500 | 10.7% |
| **Total** | **992** | 100% | **₹6,24,12,400** | 100% |

**The near-miss tail is thin — that is the finding.** Only 7 real learners are within ₹10,000 of
clearing. There is no large pool of almost-paid learners waiting to be nudged over the line. Half
the population (475 learners, 48%) is bunched in ₹25,001–₹50,000, and the money is concentrated at
the top: the 163 learners above ₹1,00,000 are 16% of people but 41% of the money.

So a "chase the near-misses first" strategy clears seats but barely moves the receivable. Both
plays are worth running, for different reasons:

- **₹37,800 across 7 learners** — trivial money, but 7 seats unblocked for the cost of 7 phone
  calls. Highest effort-to-outcome ratio on the list.
- **₹1,89,60,500 across 136 learners** in the ₹1L–₹2L band — where the money actually is.

### Bucket by college

| College | ₹0 | ₹1–10k | ₹10–25k | ₹25–50k | ₹50k–1L | ₹1L–2L | >₹2L | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Pharmacy | 0 | 0 | 1 | 5 | 61 | 81 | 20 | 168 |
| Arts and Science (Self) | 0 | 6 | 66 | 407 | 0 | 0 | 0 | 479 |
| Engineering and Technology | 0 | 1 | 0 | 54 | 149 | 1 | 0 | 205 |
| Nursing and Research | 0 | 0 | 0 | 7 | 36 | 34 | 4 | 81 |
| Allied Health Sciences | 0 | 0 | 1 | 1 | 18 | 20 | 3 | 43 |
| Education | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| Nattraja Vidhyalya CBSE | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |

**Almost the entire near-miss opportunity sits in one college.** 72 of the 75 learners under
₹25,000 are at Arts and Science (Self). One coordinator there can work the whole same-day list.

---

## Same-day worklist — the 75 learners under ₹25,000

Sorted by amount owed, smallest first. Read at **11:19:59 UTC on 2026-08-05**; balances move, so
re-check before calling.

### Bucket ₹1 – 10,000 — 7 learners, ₹37,800 *(call these first)*

| # | Application | Learner | College | Programme | Status | ₹ owed | Mobile |
|---:|---|---|---|---|---|---:|---|
| 1 | JKKN-CET-1772 | RITHISH M | Engineering and Technology | B.E. Electrical and Electronics Engineering | admitted | **500** | 9042508110 |
| 2 | JKKN-CAS-1837 | POOVARASAN A | Arts and Science (Self) | B.Com. Computer Application | admitted | **3,300** | 8754097468 |
| 3 | JKKN-CAS-1839 | SUDHAKAR S | Arts and Science (Self) | B.Com. Computer Application | reserved | **4,800** | 9659367100 |
| 4 | JKKN-CAS-1899 | MAHA V | Arts and Science (Self) | B.Com. Computer Application | reserved | **6,000** | 9486294538 |
| 5 | JKKN-CAS-1650 | BHAVADHARANI B | Arts and Science (Self) | Bachelor of Computer Applications | reserved | **7,000** | 9597933772 |
| 6 | JKKN-CAS-1835 | MALATHI G | Arts and Science (Self) | B.Sc. Computer Science | admitted | **7,900** | 7373533162 |
| 7 | JKKN-CAS-1675 | BHARANIVEL P | Arts and Science (Self) | B.Com. Computer Application | admitted | **8,300** | 9750553900 |

> RITHISH M owes **₹500**. That is almost certainly a rounding or part-payment remainder rather than
> a genuine arrears position — worth checking whether it should simply be written off, since holding
> a seat over ₹500 costs more in staff time than the amount itself.

### Bucket ₹10,001 – 25,000 — 68 learners, ₹14,51,200

| # | Application | Learner | College | Programme | Status | ₹ owed | Mobile |
|---:|---|---|---|---|---|---:|---|
| 8 | JKKN-CAS-1711 | BALAJI R | Arts and Science (Self) | B.Sc. Computer Science (Cyber Security) | reserved | 11,300 | 8883424724 |
| 9 | JKKN-CAS-2011 | DHARANI V | Arts and Science (Self) | Bachelor of Computer Applications | reserved | 12,300 | 7708803071 |
| 10 | JKKN-CAS-1647 | HARISH V | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | admitted | 13,300 | 9344016221 |
| 11 | JKKN-CAS-2102 | DEEPIKA A | Arts and Science (Self) | B.Com. Computer Application | admitted | 13,400 | 8667765396 |
| 12 | JKKN-CAS-1755 | DHARSHINI K | Arts and Science (Self) | B.Sc. Microbiology | admitted | 14,000 | 9976504352 |
| 13 | JKKN-CAS-1615 | SAILESH B | Arts and Science (Self) | B.Sc. Computer Science (Cyber Security) | admitted | 14,400 | 7402204268 |
| 14 | JKKN-CNR-464 | SANTHIYA K | Allied Health Sciences | B.Sc. (PA) | admitted | 15,000 | 9080780587 |
| 15 | JKKN-CAS-2055 | KESAVARAJ M | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 15,000 | 9306242069 |
| 16 | JKKN-COP-1318 | MOHAMMED SAIFULLAH S | Pharmacy | PharmD | admitted | 15,000 | 8870840867 |
| 17 | JKKN-CAS-1636 | KAVIN C | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 15,800 | 9976755069 |
| 18 | JKKN-CAS-2039 | TAMILSELVAN V | Arts and Science (Self) | B.Sc. Computer Science | admitted | 17,000 | 9787865209 |
| 19 | JKKN-CAS-2140 | KEERTHIKA E | Arts and Science (Self) | Bachelor of Business Administration | reserved | 17,900 | 9715242647 |
| 20 | JKKN-CAS-2045 | GOWSHIKA S | Arts and Science (Self) | B.Sc. Computer Science (Cyber Security) | reserved | 18,000 | 9865357484 |
| 21 | JKKN-CAS-2318 | DIVYA V | Arts and Science (Self) | B.Com. Computer Application | admitted | 18,300 | 6382957277 |
| 22 | JKKN-CAS-1597 | INDHUJA T | Arts and Science (Self) | Bachelor of Business Administration | admitted | 18,800 | 8124610822 |
| 23 | JKKN-CAS-1891 | JAYABHARATHI E | Arts and Science (Self) | Bachelor of Business Administration | admitted | 19,500 | 8754014963 |
| 24 | JKKN-CAS-1584 | NIDHISH G | Arts and Science (Self) | Bachelor of Business Administration | admitted | 19,800 | 9805781777 |
| 25 | JKKN-CAS-2121 | DHARIKA S | Arts and Science (Self) | Clinical and Lab Technology | admitted | 20,400 | 9597650531 |
| 26 | JKKN-CAS-2057 | RAMESH M | Arts and Science (Self) | Bachelor of Business Administration | reserved | 20,900 | 9080378709 |
| 27 | JKKN-CAS-2322 | PRABHAVATHI N | Arts and Science (Self) | M.Sc. Mathematics | reserved | 21,000 | 6383746298 |
| 28 | JKKN-CAS-1957 | PRAVEEN S | Arts and Science (Self) | Bachelor of Business Administration | reserved | 21,000 | 9600490094 |
| 29 | JKKN-CAS-1799 | PREMARANJITHA S | Arts and Science (Self) | B.Sc. Physics | reserved | 21,000 | 8248457856 |
| 30 | JKKN-CAS-2113 | VIGNESH S | Arts and Science (Self) | B.Sc. Physics | reserved | 21,000 | 7418120435 |
| 31 | JKKN-CAS-1654 | BHARATH L | Arts and Science (Self) | B.Com. Computer Application | reserved | 21,300 | 9361583652 |
| 32 | JKKN-CAS-2099 | HEMA P | Arts and Science (Self) | M.Sc. Mathematics | reserved | 21,300 | 8015561923 |
| 33 | JKKN-CAS-1656 | KISHORE K | Arts and Science (Self) | Bachelor of Business Administration | reserved | 21,300 | 7708329702 |
| 34 | JKKN-CAS-2108 | PREETHI T | Arts and Science (Self) | Clinical and Lab Technology | reserved | 21,300 | 8248531950 |
| 35 | JKKN-CAS-1762 | DHARSHINI K | Arts and Science (Self) | Bachelor of Business Administration | reserved | 21,500 | 8778556408 |
| 36 | JKKN-CAS-1682 | MADHUMITHA R | Arts and Science (Self) | Bachelor of Business Administration | reserved | 21,500 | 9944558883 |
| 37 | JKKN-CAS-1563 | RISHIDHARAN T S | Arts and Science (Self) | Bachelor of Business Administration | reserved | 21,500 | 8015256249 |
| 38 | JKKN-CAS-1658 | MEGALA K | Arts and Science (Self) | B.Sc. Microbiology | admitted | 22,000 | 9003802707 |
| 39 | JKKN-CAS-1766 | DHANUSH J | Arts and Science (Self) | Bachelor of Computer Applications | admitted | 22,300 | 7904815682 |
| 40 | JKKN-CAS-1742 | GOKUL PRIYAN N | Arts and Science (Self) | B.Com. Computer Application | reserved | 22,800 | 6374230991 |
| 41 | JKKN-CAS-1858 | KABISHA S | Arts and Science (Self) | B.Sc. Computer Science (AI & Data Science) | reserved | 22,800 | 9500037861 |
| 42 | JKKN-CAS-2107 | SUMITHRA C | Arts and Science (Self) | Bachelor of Business Administration | reserved | 22,800 | 9042278837 |
| 43 | JKKN-CAS-2125 | BHUVANESHWARI M | Arts and Science (Self) | M.A. English | reserved | 23,000 | 9500312591 |
| 44 | JKKN-CAS-2072 | BHUVANESWARI A | Arts and Science (Self) | M.A. English | reserved | 23,000 | 9944073814 |
| 45 | JKKN-CAS-1963 | GURUPRIYA G | Arts and Science (Self) | M.Sc. Mathematics | reserved | 23,000 | 9489370448 |
| 46 | JKKN-CAS-2038 | MONISHKAR M.P | Arts and Science (Self) | M.A. English | reserved | 23,000 | 6382572761 |
| 47 | JKKN-CAS-1775 | SUDHIR M | Arts and Science (Self) | B.Sc. Computer Science (Cyber Security) | reserved | 23,000 | 9500536325 |
| 48 | JKKN-CAS-2147 | SUNDARAVADIVEL G | Arts and Science (Self) | M.A. English | reserved | 23,000 | 8015087237 |
| 49 | JKKN-CAS-1866 | KAVINRAJ C | Arts and Science (Self) | B.Sc. Computer Science (AI & Data Science) | reserved | 23,300 | 9840491873 |
| 50 | JKKN-CAS-1635 | NITHILA K | Arts and Science (Self) | B.Sc. Microbiology | admitted | 23,300 | 9025291773 |
| 51 | JKKN-CAS-1789 | RITHIKA S | Arts and Science (Self) | Bachelor of Computer Applications | admitted | 23,300 | 8754910048 |
| 52 | JKKN-CAS-1703 | SOWNDHARYA T | Arts and Science (Self) | B.Sc. Microbiology | reserved | 23,300 | 6369597814 |
| 53 | JKKN-CAS-1706 | THAHIRA K | Arts and Science (Self) | B.Sc. Computer Science | reserved | 23,300 | 9952157946 |
| 54 | JKKN-CAS-1852 | THARIKA S | Arts and Science (Self) | B.Com. Computer Application | reserved | 23,400 | 9629717755 |
| 55 | JKKN-CAS-1851 | LAKSHANA T | Arts and Science (Self) | Bachelor of Business Administration | reserved | 23,500 | 9791270179 |
| 56 | JKKN-CAS-1816 | LAVANYA SRI S | Arts and Science (Self) | B.Sc. Microbiology | reserved | 23,900 | 7806878577 |
| 57 | JKKN-CAS-1577 | DEVISRI S | Arts and Science (Self) | Bachelor of Computer Applications | reserved | 24,300 | 9688222238 |
| 58 | JKKN-CAS-1857 | SUKANYA S | Arts and Science (Self) | B.Sc. Computer Science (AI & Data Science) | reserved | 24,300 | 8344541244 |
| 59 | JKKN-CAS-1604 | VANISRI S | Arts and Science (Self) | B.Sc. Microbiology | reserved | 24,300 | 9894955695 |
| 60 | JKKN-CAS-1574 | YOGAPRIYA G | Arts and Science (Self) | Bachelor of Computer Applications | reserved | 24,300 | 8667218386 |
| 61 | JKKN-CAS-2129 | PRIYADHARSHINI A | Arts and Science (Self) | M.Sc. Computer Science | reserved | 24,400 | 7418266769 |
| 62 | JKKN-CAS-1999 | VISHNU PRIYA M | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 24,400 | 8667614674 |
| 63 | JKKN-CAS-1575 | ANUNIYA S | Arts and Science (Self) | Bachelor of Computer Applications | admitted | 24,800 | 9360586476 |
| 64 | JKKN-CAS-1590 | ANUPRIYA R | Arts and Science (Self) | Bachelor of Computer Applications | reserved | 24,800 | 7502830472 |
| 65 | JKKN-CAS-1569 | JAISREE N | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 24,800 | 9994909156 |
| 66 | JKKN-CAS-1594 | KAVIMANI P | Arts and Science (Self) | Bachelor of Business Administration | reserved | 24,800 | 9363269320 |
| 67 | JKKN-CAS-1777 | KEERTHIKASRI R | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 24,800 | 9585161269 |
| 68 | JKKN-CAS-1914 | LOGESWARAN T | Arts and Science (Self) | Bachelor of Business Administration | reserved | 24,800 | 8838730179 |
| 69 | JKKN-CAS-1665 | NIRMAL M | Arts and Science (Self) | Bachelor of Business Administration | reserved | 24,800 | 7708026757 |
| 70 | JKKN-CAS-1735 | KAMALI S | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 24,900 | 9790046175 |
| 71 | JKKN-CAS-1733 | MANIKANDAN K | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 24,900 | 9585781738 |
| 72 | JKKN-CAS-1973 | ARISHVA K.S | Arts and Science (Self) | B.Sc. Computer Science (Cyber Security) | admitted | 25,000 | 9361795631 |
| 73 | JKKN-CAS-1669 | DEVIKA M | Arts and Science (Self) | B.Sc. Computer Science (Cyber Security) | admitted | 25,000 | 7795052746 |
| 74 | JKKN-CAS-2065 | KALAISELVAN S | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | admitted | 25,000 | 9750219288 |
| 75 | JKKN-CAS-1663 | NAVYA M | Arts and Science (Self) | B.Sc. Textile and Fashion Designing | reserved | 25,000 | 9994401748 |

**Sub-total for the 75: ₹14,89,000.** Cross-checks against the bucket table: 7 + 68 = 75 learners,
₹37,800 + ₹14,51,200 = ₹14,89,000. ✅

### Two patterns worth noticing

**`reserved` vs `admitted` does not track how much is owed.** Both statuses appear throughout the
list, including among the seven smallest. A learner at `admitted` has cleared the 30% threshold; one
at `reserved` has paid their application and university fees but not yet 30%. For a collections
call the status is not the useful signal — the balance is.

**Six M.A. English and M.Sc. Mathematics learners cluster at exactly ₹21,000 or ₹23,000.** Identical
balances across a programme usually means one unpaid instalment of a common fee schedule rather than
15 separate stories. Those may be workable as a single programme-level conversation instead of six
individual calls.

---

## Appendix — every query used, verbatim

All executed read-only against ref `kvizhngldtiuufknvehv` on 2026-08-05. The cohort definition
(current-intake, fee-gated) is identical in each.

**B1 — headline, buckets and per-college totals, as one atomic snapshot**

Run as a single statement so every figure shares one instant — the totals drifted by ₹25,500
between two separate reads minutes apart, so consistency matters here.

```sql
WITH cohort AS (
  SELECT lp.id, lp.institution_id FROM learners_profiles lp
  JOIN admission_years ay ON ay.id=lp.admission_year_id AND ay.is_current=true
  WHERE lp.lifecycle_status::text IN ('reserved','admitted')
), owed AS (
  SELECT c.id, c.institution_id,
         COALESCE(SUM(b.balance_amount) FILTER (WHERE b.status<>'superseded'),0) AS o
  FROM cohort c LEFT JOIN billing_student_bills b ON b.student_id=c.id
  GROUP BY c.id,c.institution_id
)
SELECT jsonb_pretty(jsonb_build_object(
  'snapshot_utc', now()::text,
  'total_learners', (SELECT count(*) FROM owed),
  'total_outstanding', (SELECT round(sum(o)) FROM owed),
  'buckets', (SELECT jsonb_agg(x ORDER BY x->>'b') FROM (
     SELECT jsonb_build_object('b',bk,'learners',n,'total',t) AS x FROM (
       SELECT CASE WHEN o=0 THEN 'B0_zero' WHEN o<=10000 THEN 'B1_1to10k'
                   WHEN o<=25000 THEN 'B2_10to25k' WHEN o<=50000 THEN 'B3_25to50k'
                   WHEN o<=100000 THEN 'B4_50kto1L' WHEN o<=200000 THEN 'B5_1Lto2L'
                   ELSE 'B6_above2L' END AS bk, count(*) AS n, round(sum(o)) AS t
       FROM owed GROUP BY 1) q) y),
  'colleges', (SELECT jsonb_agg(jsonb_build_object('college',cn,'learners',n,'outstanding',t) ORDER BY t DESC)
     FROM (SELECT i.name AS cn, count(*) AS n, round(sum(o.o)) AS t
           FROM owed o LEFT JOIN institutions i ON i.id=o.institution_id
           GROUP BY i.name) z)
)) AS snapshot;
```

**B2 — the named worklist (the 75 learners under ₹25,000)**
```sql
WITH cohort AS (
  SELECT lp.id, lp.institution_id, lp.program_id, lp.lifecycle_status::text AS st,
         lp.first_name||COALESCE(' '||lp.last_name,'') AS nm, lp.application_id, lp.student_mobile
  FROM learners_profiles lp
  JOIN admission_years ay ON ay.id=lp.admission_year_id AND ay.is_current=true
  WHERE lp.lifecycle_status::text IN ('reserved','admitted')
), owed AS (
  SELECT c.*, COALESCE(SUM(b.balance_amount) FILTER (WHERE b.status<>'superseded'),0) AS o
  FROM cohort c LEFT JOIN billing_student_bills b ON b.student_id=c.id
  GROUP BY c.id,c.institution_id,c.program_id,c.st,c.nm,c.application_id,c.student_mobile
)
SELECT o.application_id, o.nm AS learner, i.name AS college,
       COALESCE(pr.program_name,'(no programme set)') AS programme,
       o.st AS status, round(o.o) AS outstanding, o.student_mobile AS mobile
FROM owed o
LEFT JOIN institutions i  ON i.id  = o.institution_id
LEFT JOIN programs    pr ON pr.id = o.program_id
WHERE o.o > 0 AND o.o <= 25000
ORDER BY o.o, i.name, o.nm;
```

**B3 — bucket × college cross-tab**
```sql
WITH cohort AS (
  SELECT lp.id, lp.institution_id FROM learners_profiles lp
  JOIN admission_years ay ON ay.id=lp.admission_year_id AND ay.is_current=true
  WHERE lp.lifecycle_status::text IN ('reserved','admitted')
), owed AS (
  SELECT c.id,c.institution_id,
         COALESCE(SUM(b.balance_amount) FILTER (WHERE b.status<>'superseded'),0) AS o
  FROM cohort c LEFT JOIN billing_student_bills b ON b.student_id=c.id
  GROUP BY c.id,c.institution_id
)
SELECT i.name AS college,
  count(*) FILTER (WHERE o=0)                       AS z,
  count(*) FILTER (WHERE o>0      AND o<=10000)     AS b1,
  count(*) FILTER (WHERE o>10000  AND o<=25000)     AS b2,
  count(*) FILTER (WHERE o>25000  AND o<=50000)     AS b3,
  count(*) FILTER (WHERE o>50000  AND o<=100000)    AS b4,
  count(*) FILTER (WHERE o>100000 AND o<=200000)    AS b5,
  count(*) FILTER (WHERE o>200000)                  AS b6,
  count(*) AS total, round(sum(o)) AS money
FROM owed o LEFT JOIN institutions i ON i.id=o.institution_id
GROUP BY i.name ORDER BY money DESC;
```

**B4 — fine histogram of the low end (this is what justified the ₹10,000 and ₹25,000 cuts)**
```sql
WITH cohort AS (
  SELECT lp.id FROM learners_profiles lp
  JOIN admission_years ay ON ay.id = lp.admission_year_id AND ay.is_current = true
  WHERE lp.lifecycle_status::text IN ('reserved','admitted')
), owed AS (
  SELECT c.id, COALESCE(SUM(b.balance_amount) FILTER (WHERE b.status <> 'superseded'),0) AS o
  FROM cohort c LEFT JOIN billing_student_bills b ON b.student_id=c.id GROUP BY c.id
)
SELECT width_bucket(o, 0, 50000, 10) AS bkt,
       round(min(o)) AS lo, round(max(o)) AS hi, count(*) AS learners, round(sum(o)) AS total
FROM owed WHERE o <= 50000 GROUP BY 1 ORDER BY 1;
```
Output showed the ₹8,300 → ₹11,300 gap (no learner in between) and the 164-learner wall starting at
exactly ₹25,000.

**B5 — bill-status distribution for the cohort (establishes what to exclude)**
```sql
SELECT b.status, count(*) AS bills,
       count(*) FILTER (WHERE b.balance_amount IS NULL) AS null_balance,
       round(sum(b.final_amount)) AS sum_final,
       round(sum(COALESCE(b.balance_amount, b.final_amount))) AS sum_balance
FROM billing_student_bills b
JOIN learners_profiles lp ON lp.id = b.student_id
JOIN admission_years ay ON ay.id = lp.admission_year_id AND ay.is_current = true
WHERE lp.lifecycle_status::text IN ('reserved','admitted')
GROUP BY b.status ORDER BY bills DESC;
```
Result: `paid` 1,923 · `unpaid` 1,077 (₹3,08,97,500) · `partially_paid` 658 (₹3,15,48,900 balance) ·
`superseded` 55. No `cancelled`. No NULL balances.

**B6 — the outstanding source of truth (the view the platform itself uses)**
```sql
SELECT pg_get_viewdef('public.vw_learner_payment_progress'::regclass, true) AS def;
```

**B7 — status ladder, proving payment cannot reach `active`**
```sql
SELECT code, label, sort_order, is_active, fee_paid_threshold_percent,
       gates_login, auto_promote_when_universal_paid
FROM admission_statuses WHERE scope='learner' ORDER BY sort_order NULLS LAST, code;
```

**B8 — every status transition ever recorded (0 rows → `active`)**
```sql
SELECT to_status::text AS to_status, reason_code, count(*) AS n
FROM learners_profile_status_history GROUP BY 1,2 ORDER BY n DESC LIMIT 30;
```

**B9 — headcount by college and status**
```sql
SELECT i.name AS college, lp.lifecycle_status::text AS status, count(*) AS learners
FROM learners_profiles lp
JOIN admission_years ay ON ay.id = lp.admission_year_id AND ay.is_current = true
LEFT JOIN institutions i ON i.id = lp.institution_id
WHERE lp.lifecycle_status::text IN ('reserved','admitted')
GROUP BY ROLLUP(i.name, lp.lifecycle_status::text)
ORDER BY i.name NULLS LAST, status NULLS LAST;
```

---

## Recommended sequence

1. **Today — call the 7.** ₹37,800, one coordinator, mostly Arts and Science (Self). Decide
   separately whether RITHISH M's ₹500 is worth collecting at all.
2. **This week — work the 68 in the ₹10–25k band.** ₹14,51,200; 66 of the 68 are at Arts and
   Science (Self), so this is one college's list. Check the ₹21,000 / ₹23,000 programme clusters for
   a single fee-schedule cause before making individual calls.
3. **In parallel, not after — open the ₹1L–₹2L band.** 136 learners holding ₹1,89,60,500. The
   near-miss work clears seats; this is where the receivable actually is.
4. **Pair every cleared learner with a records follow-up.** Payment stops at `admitted`. A team
   member must open and save the learner's profile — with `college_email`, `academic_year_id`,
   `semester_id` and `section_id` all present — before that learner can log in. Without that second
   step the family has paid and still sees nothing.

## Open questions

1. **Is the `admitted` → `active` ceiling intentional?** No learner in the platform's history has
   ever been activated by payment. If activation is meant to follow collection automatically,
   the `gates_login = false` clause in `evaluate_learner_status_after_payment` is the thing to
   revisit — that is a deliberate ruling, not a bug fix to make unilaterally.
2. **Should the `/api/b2a/billing/outstanding` status filter be corrected?** It currently hides
   ₹3.15 crore of partially-paid balance from every consumer of that endpoint.
3. **Write off RITHISH M's ₹500?** Holding a seat over ₹500 likely costs more than the amount.
