# Vendor & Item Rating Feedback Loop — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Close the procurement loop — every verified delivery produces an objective vendor score, the store admin and the requester add two light ratings, and that score/rating shows up exactly where the next purchase decision is made (Compare & Award, Ask AI, the request item picker, supplier list).

**Architecture:** One table `procurement_ratings` written only through two SECURITY DEFINER RPCs. Two read RPCs return *raw* KPIs (counts/sums) per vendor and per item×vendor×manufacturer. A pure TypeScript function `computeVendorScore()` turns KPIs into a 0–100 score + grade A/B/C/D(Watch), so weights can change without a migration and are unit-tested. A daily pg_cron job sends "rate your items" prompts through the existing `procurement_notify_users`.

**Tech Stack:** Supabase Postgres (plpgsql, pg_cron — both enabled live), Next.js App Router, React Query, shadcn/ui, vitest.

**Design decisions (approved 2026-10-06, see brainstorm):**

| Rater | When | What |
|---|---|---|
| System | GRN verified | on-time, fill rate, acceptance, invoice match, price held, quote response |
| Store admin (GRN `verified_by` / `received_by`) | GRN verify screen, optional | delivery experience ★1–5 + chips + note |
| Requester (`procurement_purchase_requests.requested_by`) | card appears on acceptance; nudge day 15 (consumable) / 30 (equipment), one reminder +7d | item ★1–5, meets spec yes/partly/no, comment (required ≤2★) |

Weights (sum 100): on-time 20 · fill 10 · acceptance 20 · requester ★ 20 · invoice match 10 · price held 5 · store-admin ★ 10 · quote response 5.
Grades: A ≥85 · B ≥70 · C ≥50 · D <50 = **Watch**. "New" until 3 verified GRNs. Stars shrunk to global mean with prior weight 3. Window: last 12 months.

**Live facts (checked 2026-10-06):** 0 GRNs, 8 POs / 7 vendors, `expected_delivery_date` NULL on every PO, `delivery_time_days` filled on quotation **headers** (not items), `ims_stock_batches.supplier_id` exists but procurement never fills it, `ims_suppliers.rating` unused. pg_cron + pg_net installed.

**House rules that apply (read before starting):**
- Branch off `main`, not the current PR branch: `git switch -c feat/procurement-rating-loop origin/main`.
- Migration version token = text before the FIRST `_`; must be unique and newer than `20271006150000`.
- Repo migrations can drift from live — before `CREATE OR REPLACE` of an existing function, diff against `select pg_get_functiondef('public.<fn>'::regproc)` on live.
- Use `errorMessage()` from `lib/utils/supabase-error.ts` (PostgREST errors aren't `Error`).
- Use `user_has_permission()` / `is_super_admin()`, never `check_permission()`.
- No full `tsc` (OOMs) — lint changed files: `npx eslint <files>`; unit tests: `npx vitest run <path>`.
- Dental store = test data; Pharmacy = production. Never test POS here.

---

## PR 1 — Data foundation (no UI change)

### Task 1: Fill `expected_delivery_date` when POs are created

**Files:**
- Create: `supabase/migrations/20271007100000_procurement_po_expected_delivery.sql`

**Step 1: Confirm live body matches repo**

Run via Supabase MCP `execute_sql`:
```sql
select pg_get_functiondef('public.procurement_award_create_pos(uuid,uuid)'::regprocedure);
```
Expected: identical to `supabase/migrations/20271006130000_procurement_final_approval_chain.sql:184-264`. If not, base the edit on the live body.

**Step 2: Write migration** — copy the whole function from lines 184–265 of `20271006130000_…sql` and make exactly these two changes:

In the `FOR v_vendor IN SELECT …` list add:
```sql
           max(q.delivery_time_days)                              AS delivery_days,
```
In the PO `INSERT` column list add `expected_delivery_date` after `po_format_id`, and in the `SELECT` add after `s.default_po_format_id,`:
```sql
           CASE WHEN v_vendor.delivery_days IS NOT NULL
                THEN current_date + v_vendor.delivery_days END,
```
Keep the trailing `REVOKE ALL ON FUNCTION public.procurement_award_create_pos(uuid, uuid) FROM public, anon, authenticated;`.

Append a one-off backfill for the 8 existing POs:
```sql
UPDATE public.procurement_purchase_orders po
   SET expected_delivery_date = (po.approved_at::date + q.delivery_time_days)
  FROM public.procurement_quotations q
 WHERE q.rfq_id = po.rfq_id AND q.supplier_id = po.supplier_id
   AND po.expected_delivery_date IS NULL
   AND po.approved_at IS NOT NULL AND q.delivery_time_days IS NOT NULL;
```

**Step 3: Apply** with `mcp__supabase__apply_migration` (name `procurement_po_expected_delivery`).

**Step 4: Verify**
```sql
select count(*) filter (where expected_delivery_date is not null) as filled, count(*) from procurement_purchase_orders;
```
Expected: `filled` > 0 (POs whose vendor quoted delivery days).

**Step 5: Commit** `feat(procurement): POs carry an expected delivery date from the quote`

---

### Task 2: Stock batches remember the vendor

**Files:**
- Modify: `lib/services/procurement/domain-adapters/types.ts` (`AcceptedReceiptLine`, ~line 60)
- Modify: `lib/services/procurement/grn-service.ts` (two `adapter.postReceipt` calls, ~line 463 and ~line 800)
- Modify: `lib/services/procurement/domain-adapters/ims-adapter.ts` (~line 114 insert)

**Step 1:** In `AcceptedReceiptLine` after `purchaseOrderId?`, add:
```ts
  /** Vendor on the GRN — stamped on the stock batch so issues/returns trace back to who supplied it. */
  supplierId?: string | null;
```
**Step 2:** In both `postReceipt({...})` calls add `supplierId: grn.supplier_id,` (second call: `parentGrn.supplier_id`). Check that the GRN `select` feeding the first call includes `supplier_id`; add it if missing.

**Step 3:** In `ims-adapter.ts` insert object add `supplier_id: line.supplierId ?? null,`.

**Step 4:** `npx eslint lib/services/procurement/domain-adapters/types.ts lib/services/procurement/grn-service.ts lib/services/procurement/domain-adapters/ims-adapter.ts` → no errors.

**Step 5: Commit** `fix(procurement): stock batches from a GRN record the supplier`

---

### Task 3: Ratings table + write RPCs

**Files:**
- Create: `supabase/migrations/20271007100100_procurement_ratings.sql`

**Step 1: Write migration**
```sql
-- Vendor & item ratings. Writes only through the two RPCs below.
CREATE TABLE IF NOT EXISTS public.procurement_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('delivery', 'item_quality')),
  grn_id        uuid NOT NULL REFERENCES public.procurement_grn(id) ON DELETE CASCADE,
  grn_item_id   uuid REFERENCES public.procurement_grn_items(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL REFERENCES public.ims_suppliers(id),
  item_id       uuid,                 -- procurement_grn_items.domain_item_id
  manufacturer  text,                 -- from the awarded quotation line
  request_id    uuid REFERENCES public.procurement_purchase_requests(id) ON DELETE SET NULL,
  rater_id      uuid NOT NULL REFERENCES public.profiles(id),
  stars         smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  meets_spec    text CHECK (meets_spec IN ('yes', 'partly', 'no')),
  tags          text[] NOT NULL DEFAULT '{}',
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procurement_ratings_shape CHECK (
    (kind = 'delivery'     AND grn_item_id IS NULL     AND meets_spec IS NULL) OR
    (kind = 'item_quality' AND grn_item_id IS NOT NULL AND meets_spec IS NOT NULL)),
  CONSTRAINT procurement_ratings_low_needs_comment CHECK (
    kind <> 'item_quality' OR stars > 2 OR length(trim(coalesce(comment, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS procurement_ratings_delivery_once
  ON public.procurement_ratings (grn_id, rater_id) WHERE kind = 'delivery';
CREATE UNIQUE INDEX IF NOT EXISTS procurement_ratings_item_once
  ON public.procurement_ratings (grn_item_id, rater_id) WHERE kind = 'item_quality';
CREATE INDEX IF NOT EXISTS procurement_ratings_supplier ON public.procurement_ratings (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS procurement_ratings_item     ON public.procurement_ratings (item_id, supplier_id);

ALTER TABLE public.procurement_ratings ENABLE ROW LEVEL SECURITY;
-- Read = whoever can read the GRN (inherits procurement_grn RLS). No write policies: RPC only.
DROP POLICY IF EXISTS procurement_ratings_read ON public.procurement_ratings;
CREATE POLICY procurement_ratings_read ON public.procurement_ratings FOR SELECT TO authenticated
  USING (rater_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.procurement_grn g WHERE g.id = grn_id));
REVOKE INSERT, UPDATE, DELETE ON public.procurement_ratings FROM anon, authenticated;
GRANT SELECT ON public.procurement_ratings TO authenticated;

-- Store admin: one delivery rating per GRN.
CREATE OR REPLACE FUNCTION public.procurement_rate_delivery(
  p_grn_id uuid, p_stars int, p_tags text[] DEFAULT '{}', p_comment text DEFAULT NULL
) RETURNS public.procurement_ratings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g procurement_grn%ROWTYPE;
  r procurement_ratings;
BEGIN
  SELECT * INTO g FROM procurement_grn WHERE id = p_grn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found.' USING ERRCODE = 'P0002'; END IF;
  IF g.status NOT IN ('partially_accepted', 'replacement_requested', 'accepted', 'completed') THEN
    RAISE EXCEPTION 'Rate the delivery after it is verified.' USING ERRCODE = '55000';
  END IF;
  IF auth.uid() IS DISTINCT FROM g.verified_by AND auth.uid() IS DISTINCT FROM g.received_by
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the person who received or verified this delivery can rate it.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO procurement_ratings (kind, grn_id, supplier_id, rater_id, stars, tags, comment)
  VALUES ('delivery', g.id, g.supplier_id, auth.uid(), p_stars, coalesce(p_tags, '{}'), nullif(trim(p_comment), ''))
  ON CONFLICT (grn_id, rater_id) WHERE kind = 'delivery'
  DO UPDATE SET stars = EXCLUDED.stars, tags = EXCLUDED.tags, comment = EXCLUDED.comment, updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.procurement_rate_delivery(uuid, int, text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_rate_delivery(uuid, int, text[], text) TO authenticated;

-- Requester: one quality rating per accepted GRN line. Low ratings alert the purchase team.
CREATE OR REPLACE FUNCTION public.procurement_rate_item(
  p_grn_item_id uuid, p_stars int, p_meets_spec text, p_comment text DEFAULT NULL
) RETURNS public.procurement_ratings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gi  procurement_grn_items%ROWTYPE;
  g   procurement_grn%ROWTYPE;
  v_rfq procurement_rfqs%ROWTYPE;
  v_req procurement_purchase_requests%ROWTYPE;
  v_mfr text;
  r   procurement_ratings;
  v_team uuid[];
BEGIN
  SELECT * INTO gi FROM procurement_grn_items WHERE id = p_grn_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found.' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(gi.accepted_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Only items you received can be rated.' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO g FROM procurement_grn WHERE id = gi.grn_id;
  SELECT rfq.* INTO v_rfq FROM procurement_purchase_orders po
    JOIN procurement_rfqs rfq ON rfq.id = po.rfq_id WHERE po.id = g.purchase_order_id;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = v_rfq.source_request_id;
  IF auth.uid() IS DISTINCT FROM v_req.requested_by AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the person who asked for this item can rate it.' USING ERRCODE = '42501';
  END IF;
  SELECT qi.manufacturer INTO v_mfr FROM procurement_purchase_order_items poi
    JOIN procurement_quotation_items qi ON qi.id = poi.source_quotation_item_id
   WHERE poi.id = gi.po_item_id;

  INSERT INTO procurement_ratings
    (kind, grn_id, grn_item_id, supplier_id, item_id, manufacturer, request_id, rater_id, stars, meets_spec, comment)
  VALUES ('item_quality', g.id, gi.id, g.supplier_id, gi.domain_item_id, nullif(trim(v_mfr), ''),
          v_req.id, auth.uid(), p_stars, p_meets_spec, nullif(trim(p_comment), ''))
  ON CONFLICT (grn_item_id, rater_id) WHERE kind = 'item_quality'
  DO UPDATE SET stars = EXCLUDED.stars, meets_spec = EXCLUDED.meets_spec,
                comment = EXCLUDED.comment, updated_at = now()
  RETURNING * INTO r;

  IF r.stars <= 2 OR r.meets_spec = 'no' THEN
    SELECT array_agg(DISTINCT u) INTO v_team FROM (
      SELECT v_rfq.created_by AS u UNION SELECT v_rfq.award_submitted_by
      UNION SELECT p.id FROM profiles p
       WHERE coalesce(p.is_active, true) AND (p.is_super_admin = true OR p.role = 'super_admin')
    ) t WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
    PERFORM procurement_notify_users(
      v_req.id, v_team,
      'Poor rating: ' || gi.item_name,
      r.stars || '★' || CASE WHEN r.meets_spec = 'no' THEN ', not to spec' ELSE '' END
        || ' — ' || left(coalesce(r.comment, ''), 140),
      'Open request', 'rating-low-' || r.id || '-' || r.stars || '-' || r.meets_spec);
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.procurement_rate_item(uuid, int, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_rate_item(uuid, int, text, text) TO authenticated;
```

**Step 2: Apply** (`procurement_ratings`).

**Step 3: Verify shape + guards** (live has no GRNs, so verify the guard paths):
```sql
select public.procurement_rate_item(gen_random_uuid(), 4, 'yes', null);
```
Expected: ERROR `Item not found.`
```sql
select has_table_privilege('authenticated','public.procurement_ratings','INSERT');
```
Expected: `false`.

**Step 4: Commit** `feat(procurement): ratings table and rate-delivery / rate-item RPCs`

---

### Task 4: KPI read RPCs

**Files:**
- Create: `supabase/migrations/20271007100200_procurement_rating_kpis.sql`

**Step 1: Write migration** — SECURITY DEFINER so every viewer sees the same score (RLS would otherwise give a store admin a partial view). Returns aggregates only, no names/comments except the item RPC's anonymous latest comment.

```sql
CREATE OR REPLACE FUNCTION public.procurement_vendor_kpis(p_supplier_ids uuid[])
RETURNS TABLE (
  supplier_id uuid, grn_count int,
  on_time_eligible int, on_time int,
  ordered_qty numeric, received_qty numeric, accepted_qty numeric,
  invoice_lines int, invoice_matched int,
  price_lines int, price_held int,
  delivery_star_sum int, delivery_star_n int,
  item_star_sum int, item_star_n int,
  quote_requests int, quote_fast int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT unnest(p_supplier_ids) AS supplier_id),
  grn AS (
    SELECT g.*, po.expected_delivery_date
      FROM procurement_grn g JOIN procurement_purchase_orders po ON po.id = g.purchase_order_id
     WHERE g.supplier_id = ANY (p_supplier_ids)
       AND g.status IN ('partially_accepted','replacement_requested','accepted','completed')
       AND g.created_at > now() - interval '12 months'),
  g_agg AS (
    SELECT supplier_id, count(*)::int AS grn_count,
           count(*) FILTER (WHERE expected_delivery_date IS NOT NULL)::int AS on_time_eligible,
           count(*) FILTER (WHERE created_at::date <= expected_delivery_date + 2)::int AS on_time
      FROM grn GROUP BY supplier_id),
  gi_agg AS (
    SELECT grn.supplier_id,
           sum(gi.ordered_quantity) AS ordered_qty, sum(gi.received_quantity) AS received_qty,
           sum(gi.accepted_quantity) AS accepted_qty,
           count(*) FILTER (WHERE gi.match_status IS NOT NULL AND gi.match_status <> 'awaiting_invoice')::int AS invoice_lines,
           count(*) FILTER (WHERE gi.match_status = 'matched')::int AS invoice_matched
      FROM grn JOIN procurement_grn_items gi ON gi.grn_id = grn.id GROUP BY grn.supplier_id),
  price AS (
    SELECT po.supplier_id, count(*)::int AS price_lines,
           count(*) FILTER (WHERE poi.unit_price <= qi.unit_price)::int AS price_held
      FROM procurement_purchase_orders po
      JOIN procurement_purchase_order_items poi ON poi.po_id = po.id
      JOIN procurement_quotation_items qi ON qi.id = poi.source_quotation_item_id
     WHERE po.supplier_id = ANY (p_supplier_ids) AND po.approved_at > now() - interval '12 months'
     GROUP BY po.supplier_id),
  stars AS (
    SELECT supplier_id,
           sum(stars) FILTER (WHERE kind = 'delivery')::int AS delivery_star_sum,
           count(*)   FILTER (WHERE kind = 'delivery')::int AS delivery_star_n,
           sum(stars) FILTER (WHERE kind = 'item_quality')::int AS item_star_sum,
           count(*)   FILTER (WHERE kind = 'item_quality')::int AS item_star_n
      FROM procurement_ratings
     WHERE supplier_id = ANY (p_supplier_ids) AND created_at > now() - interval '12 months'
     GROUP BY supplier_id),
  quotes AS (
    SELECT rv.supplier_id, count(*)::int AS quote_requests,
           count(*) FILTER (WHERE q.created_at <= rv.sent_at + interval '3 days')::int AS quote_fast
      FROM procurement_rfq_vendors rv
      LEFT JOIN procurement_quotations q ON q.rfq_id = rv.rfq_id AND q.supplier_id = rv.supplier_id
     WHERE rv.supplier_id = ANY (p_supplier_ids) AND rv.sent_at > now() - interval '12 months'
     GROUP BY rv.supplier_id)
  SELECT s.supplier_id, coalesce(g.grn_count,0), coalesce(g.on_time_eligible,0), coalesce(g.on_time,0),
         coalesce(gi.ordered_qty,0), coalesce(gi.received_qty,0), coalesce(gi.accepted_qty,0),
         coalesce(gi.invoice_lines,0), coalesce(gi.invoice_matched,0),
         coalesce(p.price_lines,0), coalesce(p.price_held,0),
         coalesce(st.delivery_star_sum,0), coalesce(st.delivery_star_n,0),
         coalesce(st.item_star_sum,0), coalesce(st.item_star_n,0),
         coalesce(qq.quote_requests,0), coalesce(qq.quote_fast,0)
    FROM s LEFT JOIN g_agg g USING (supplier_id) LEFT JOIN gi_agg gi USING (supplier_id)
    LEFT JOIN price p USING (supplier_id) LEFT JOIN stars st USING (supplier_id)
    LEFT JOIN quotes qq USING (supplier_id);
$$;

-- Global star means for shrinkage (one row).
CREATE OR REPLACE FUNCTION public.procurement_rating_means()
RETURNS TABLE (delivery_mean numeric, item_mean numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT avg(stars) FILTER (WHERE kind = 'delivery'), avg(stars) FILTER (WHERE kind = 'item_quality')
    FROM procurement_ratings WHERE created_at > now() - interval '12 months';
$$;

-- Item × vendor × manufacturer ratings, for the request item picker.
CREATE OR REPLACE FUNCTION public.procurement_item_vendor_ratings(p_item_ids uuid[])
RETURNS TABLE (item_id uuid, supplier_id uuid, supplier_name text, manufacturer text,
               star_sum int, star_n int, meets_no int, latest_comment text, last_rated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.item_id, r.supplier_id, s.name, r.manufacturer,
         sum(r.stars)::int, count(*)::int, count(*) FILTER (WHERE r.meets_spec = 'no')::int,
         (array_agg(r.comment ORDER BY r.updated_at DESC) FILTER (WHERE r.comment IS NOT NULL))[1],
         max(r.updated_at)
    FROM procurement_ratings r JOIN ims_suppliers s ON s.id = r.supplier_id
   WHERE r.kind = 'item_quality' AND r.item_id = ANY (p_item_ids)
   GROUP BY r.item_id, r.supplier_id, s.name, r.manufacturer;
$$;

REVOKE ALL ON FUNCTION public.procurement_vendor_kpis(uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_rating_means() FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_item_vendor_ratings(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_vendor_kpis(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_rating_means() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_item_vendor_ratings(uuid[]) TO authenticated;
```

**Step 2: Apply**, then verify:
```sql
select * from procurement_vendor_kpis(array(select distinct supplier_id from procurement_purchase_orders));
```
Expected: 7 rows, `grn_count = 0`, `price_lines > 0` for awarded vendors, `quote_requests ≥ 0`.

**Step 3: Commit** `feat(procurement): vendor KPI and item rating read RPCs`

---

### Task 5: Score function (pure TS, TDD)

**Files:**
- Create: `lib/procurement/vendor-score.ts`
- Test: `lib/procurement/__tests__/vendor-score.test.ts`

**Step 1: Write the failing tests**
```ts
import { describe, expect, it } from 'vitest';
import { computeVendorScore, shrinkStars, type VendorKpis } from '../vendor-score';

const base: VendorKpis = {
  supplier_id: 's1', grn_count: 5, on_time_eligible: 5, on_time: 5,
  ordered_qty: 100, received_qty: 100, accepted_qty: 100,
  invoice_lines: 10, invoice_matched: 10, price_lines: 4, price_held: 4,
  delivery_star_sum: 25, delivery_star_n: 5, item_star_sum: 25, item_star_n: 5,
  quote_requests: 2, quote_fast: 2,
};
const means = { delivery_mean: 4, item_mean: 4 };

describe('shrinkStars', () => {
  it('pulls a single 5★ toward the mean', () => {
    expect(shrinkStars(5, 1, 4)).toBeCloseTo(4.25);
  });
  it('returns the mean when there are no ratings', () => {
    expect(shrinkStars(0, 0, 4)).toBe(4);
  });
});

describe('computeVendorScore', () => {
  it('a perfect vendor with history is A', () => {
    const r = computeVendorScore(base, means);
    expect(r.isNew).toBe(false);
    expect(r.grade).toBe('A');
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
  it('fewer than 3 GRNs is New, no grade', () => {
    const r = computeVendorScore({ ...base, grn_count: 2 }, means);
    expect(r.isNew).toBe(true);
    expect(r.grade).toBeNull();
  });
  it('late, short, rejected vendor is Watch', () => {
    const r = computeVendorScore(
      { ...base, on_time: 1, received_qty: 60, accepted_qty: 30, item_star_sum: 8, delivery_star_sum: 8, invoice_matched: 3 },
      means,
    );
    expect(r.grade).toBe('D');
  });
  it('parts with no data are excluded, not counted as zero', () => {
    const r = computeVendorScore({ ...base, on_time_eligible: 0, on_time: 0, quote_requests: 0, quote_fast: 0 }, means);
    expect(r.parts.find((p) => p.key === 'on_time')?.value).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
});
```

**Step 2:** `npx vitest run lib/procurement/__tests__/vendor-score.test.ts` → FAIL (module not found).

**Step 3: Implement**
```ts
/** Vendor score: raw KPIs from procurement_vendor_kpis() → 0–100 + grade. Weights live here, not in SQL. */
export interface VendorKpis {
  supplier_id: string; grn_count: number;
  on_time_eligible: number; on_time: number;
  ordered_qty: number; received_qty: number; accepted_qty: number;
  invoice_lines: number; invoice_matched: number;
  price_lines: number; price_held: number;
  delivery_star_sum: number; delivery_star_n: number;
  item_star_sum: number; item_star_n: number;
  quote_requests: number; quote_fast: number;
}
export interface RatingMeans { delivery_mean: number | null; item_mean: number | null }
export type Grade = 'A' | 'B' | 'C' | 'D';
export interface ScorePart { key: string; label: string; weight: number; value: number | null }
export interface VendorScore { score: number | null; grade: Grade | null; isNew: boolean; grnCount: number; parts: ScorePart[] }

export const MIN_GRNS_FOR_GRADE = 3;
const PRIOR_WEIGHT = 3;
const DEFAULT_MEAN = 4;

export function shrinkStars(sum: number, n: number, mean: number, prior = PRIOR_WEIGHT): number {
  return (prior * mean + sum) / (prior + n);
}
const ratio = (num: number, den: number) => (den > 0 ? Math.min(num / den, 1) : null);
const stars01 = (sum: number, n: number, mean: number | null) =>
  n > 0 ? (shrinkStars(sum, n, mean ?? DEFAULT_MEAN) - 1) / 4 : null;

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export function computeVendorScore(k: VendorKpis, m: RatingMeans): VendorScore {
  const parts: ScorePart[] = [
    { key: 'on_time',    label: 'On time',            weight: 20, value: ratio(k.on_time, k.on_time_eligible) },
    { key: 'fill',       label: 'Full quantity',      weight: 10, value: ratio(k.received_qty, k.ordered_qty) },
    { key: 'acceptance', label: 'Accepted at GRN',    weight: 20, value: ratio(k.accepted_qty, k.received_qty) },
    { key: 'item_stars', label: 'Requester rating',   weight: 20, value: stars01(k.item_star_sum, k.item_star_n, m.item_mean) },
    { key: 'invoice',    label: 'Invoice matched',    weight: 10, value: ratio(k.invoice_matched, k.invoice_lines) },
    { key: 'price',      label: 'Price held',         weight: 5,  value: ratio(k.price_held, k.price_lines) },
    { key: 'delivery',   label: 'Store admin rating', weight: 10, value: stars01(k.delivery_star_sum, k.delivery_star_n, m.delivery_mean) },
    { key: 'quote',      label: 'Quotes within 3 days', weight: 5, value: ratio(k.quote_fast, k.quote_requests) },
  ];
  const isNew = k.grn_count < MIN_GRNS_FOR_GRADE;
  // USER CONTRIBUTION (learning mode): missing-data policy — see note below.
  const known = parts.filter((p) => p.value !== null);
  const totalWeight = known.reduce((s, p) => s + p.weight, 0);
  const score = totalWeight > 0
    ? Math.round((known.reduce((s, p) => s + p.weight * (p.value as number), 0) / totalWeight) * 100)
    : null;
  return { score, grade: isNew || score === null ? null : gradeFor(score), isNew, grnCount: k.grn_count, parts };
}
```
> **USER CONTRIBUTION point:** the 3 lines after the comment decide what happens when a part has no data. Renormalising (shown) means a vendor never asked for a quote isn't punished; the alternative — treating missing as a neutral 0.8 — keeps a vendor with only one good metric from looking perfect. Let the user choose before finalising.

**Step 4:** run tests → PASS. Lint the two files.

**Step 5: Commit** `feat(procurement): vendor score from KPIs with star shrinkage`

---

### Task 6: Client service + hooks

**Files:**
- Create: `lib/services/procurement/rating-service.ts`
- Create: `hooks/procurement/use-ratings.ts`
- Create: `types/procurement/ratings.ts` (row type for `procurement_ratings`, `ItemVendorRating`)

`rating-service.ts` (follow `quotation-service.ts` style — static class, `createClient()` from the same import it uses, throw via `errorMessage()`):
- `rateDelivery(grnId, stars, tags, comment)` → `rpc('procurement_rate_delivery', {...})`
- `rateItem(grnItemId, stars, meetsSpec, comment)` → `rpc('procurement_rate_item', {...})`
- `getVendorScores(supplierIds)` → calls `procurement_vendor_kpis` + `procurement_rating_means` in parallel, maps through `computeVendorScore`, returns `Map<string, VendorScore>`
- `getItemVendorRatings(itemIds)` → `procurement_item_vendor_ratings`
- `getMyRatings({ grnId? requestId? })` → `from('procurement_ratings').select('*')` filtered

`use-ratings.ts`: React Query hooks `useVendorScores(ids)` (key `['procurement','vendor-scores', sortedIds]`, `staleTime: 5 * 60_000`, `enabled: ids.length > 0`), `useItemVendorRatings(itemIds)`, `useRateDelivery()`, `useRateItem()` (invalidate `['procurement','vendor-scores']`, `['procurement','ratings']`, toast on success/error).

Lint, commit `feat(procurement): rating service and hooks`. **Open PR 1** (base `main`).

---

## PR 2 — Collect: two light touches

### Task 7: Shared `StarRating`

**Files:**
- Create: `components/ui/star-rating.tsx`
- Modify: `components/events/feedback/feedback-question-input.tsx:67` — replace the private `RatingInput` star branch with the shared component (keep numeric branch for scale > 5).

Lift `RatingInput` as-is (radiogroup, click-again-clears, `aria-label "{n} out of 5"`) into `StarRating({ value, onChange, disabled, size?: 'sm'|'md' })`, plus a read-only `StarDisplay({ value, count? })` for badges. Lint both files; manually check an events feedback form still renders. Commit.

### Task 8: Delivery rating on GRN verify

**Files:**
- Create: `components/procurement/delivery-rating-row.tsx`
- Modify: `app/(routes)/procurement/grn/[id]/page.tsx` (render after verification status is shown)

Row: "How was this delivery?" `StarRating` + chips `Damaged packing`, `Wrong documents`, `Late without notice`, `Courteous` (toggle into `tags`) + optional note + Save. Visible only when GRN status ∈ verified set and the viewer is `verified_by`/`received_by` or super admin; prefill from `getMyRatings({ grnId })`. Never blocks verify; collapsed "Rated ★4 · Edit" once saved. Lint, commit.

### Task 9: "Rate items" card on the request page

**Files:**
- Create: `components/procurement/rate-items-card.tsx`
- Modify: `app/(routes)/procurement/requests/[id]/page.tsx` (render near the journey section, anchor `id="rate"`)
- Modify: `lib/services/procurement/rating-service.ts` — add `getRateableLines(requestId)`: request → rfqs (`source_request_id`) → POs → GRNs (verified set) → grn_items with `accepted_quantity > 0`, joined with the caller's existing ratings.

Shown only to `requested_by` (and super admin). One row per accepted line: item name, vendor, GRN date, `StarRating`, meets-spec segmented control (Yes / Partly / No), comment (textarea becomes required with helper text when ★ ≤ 2 — mirror the DB check so the user never sees a raw constraint error). Header shows "3 to rate". Saved rows collapse to "★4 · Yes · Edit". Lint, commit.

### Task 10: "To rate" count on My requests

**Files:** the Overview "My requests" list component (find via `grep -rn "My requests" components/procurement app/(routes)/procurement`).
Add a small badge `N to rate` linking to `/procurement/requests/{id}#rate`, fed by one batched query (count of unrated accepted lines per request for the current user). Lint, commit. **Open PR 2.**

---

## PR 3 — Prompts (daily job)

### Task 11: `procurement_send_rating_prompts()` + cron

**Files:** Create `supabase/migrations/20271007100300_procurement_rating_prompts.sql`

```sql
CREATE OR REPLACE FUNCTION public.procurement_send_rating_prompts()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sent int := 0;
BEGIN
  FOR r IN
    WITH lines AS (
      SELECT req.id AS request_id, req.requested_by, req.request_number, g.id AS grn_id,
             g.verified_at,
             CASE WHEN g.domain = 'resource_mgmt' OR i.item_type = 'equipment' THEN 30 ELSE 15 END AS wait_days
        FROM procurement_grn g
        JOIN procurement_grn_items gi ON gi.grn_id = g.id AND gi.accepted_quantity > 0
        JOIN procurement_purchase_orders po ON po.id = g.purchase_order_id
        JOIN procurement_rfqs rfq ON rfq.id = po.rfq_id
        JOIN procurement_purchase_requests req ON req.id = rfq.source_request_id
        LEFT JOIN ims_items i ON i.id = gi.domain_item_id
       WHERE g.status IN ('partially_accepted','replacement_requested','accepted','completed')
         AND g.verified_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM procurement_ratings pr
                          WHERE pr.grn_item_id = gi.id AND pr.rater_id = req.requested_by))
    SELECT request_id, requested_by, request_number, grn_id, count(*) AS n,
           CASE WHEN now() >= min(verified_at) + make_interval(days => max(wait_days) + 7) THEN 2 ELSE 1 END AS stage
      FROM lines
     GROUP BY request_id, requested_by, request_number, grn_id
    HAVING now() >= min(verified_at) + make_interval(days => max(wait_days))
       AND now() <  min(verified_at) + make_interval(days => max(wait_days) + 14)
  LOOP
    PERFORM procurement_notify_users(
      r.request_id, ARRAY[r.requested_by],
      CASE r.stage WHEN 1 THEN 'How are the items from ' ELSE 'Reminder: rate the items from ' END || r.request_number || '?',
      r.n || ' item(s) to rate — takes a minute and helps pick better vendors next time.',
      'Rate items', 'rate-prompt-' || r.grn_id || '-' || r.stage);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END $$;
REVOKE ALL ON FUNCTION public.procurement_send_rating_prompts() FROM public, anon, authenticated;

SELECT cron.unschedule('procurement-rating-prompts')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procurement-rating-prompts');
SELECT cron.schedule('procurement-rating-prompts', '30 3 * * *',   -- 09:00 IST
  $$SELECT public.procurement_send_rating_prompts()$$);
```
Note: the notification URL is `/procurement/requests/{id}` (fixed in `procurement_notify_users`); the card is visible without the `#rate` anchor. Idempotency key makes re-runs safe.

Verify: `select procurement_send_rating_prompts();` → `0` (no GRNs yet); `select jobname, schedule from cron.job where jobname = 'procurement-rating-prompts';` → one row. Commit, **open PR 3**.

---

## PR 4 — Feed back into decisions

### Task 12: Vendor badge on Compare & Award

**Files:**
- Create: `components/procurement/vendor-score-badge.tsx` — `New` (grey, "3 deliveries needed"), `A`/`B` (green/blue), `C` (amber), `D` red "Watch". Tooltip lists `parts` with value % or "no data yet", plus `grnCount`.
- Modify: `components/procurement/quotes-section.tsx` — call `useVendorScores(vendorColumns.map(v => v.supplierId))` once; render `<VendorScoreBadge score={scores.get(v.supplierId)} />` after the name `<span>` in the column header (~line 731). Also beside the vendor name in the single-vendor card (~613–665).

### Task 13: Watch vendor needs a reason

**Files:**
- Create: `supabase/migrations/20271007100400_procurement_award_watch_reason.sql` — `ALTER TABLE procurement_rfqs ADD COLUMN IF NOT EXISTS award_watch_reason text;`
- Modify: the award submit flow in `quotes-section.tsx` (search `submitAward` / `procurement_submit_award`) — if any awarded vendor's grade is `D`, show a required textarea "Why this vendor?" and write it to `award_watch_reason` in the same mutation before calling the RPC.
- Modify: the Super Admin award approval view (find via `grep -rn "award_submitted_at" components/procurement`) — show the reason in an amber callout.

Client-side gate only in v1 (score is computed in TS); note this in the PR body.

### Task 14: Score in Ask AI facts

**Files:**
- Modify: `lib/procurement/quotation-compare-facts.ts` — add to `FactVendor`: `score: number | null; grade: string | null; deliveries_rated: number; low_item_ratings: { item: string; stars: number; comment: string | null }[]`.
- Modify: `app/api/procurement/rfqs/[id]/ai-chat/route.ts` — fetch `procurement_vendor_kpis` + means + `procurement_item_vendor_ratings` for the RFQ's `domain_item_id`s server-side, pass into `buildCompareFacts`.
- Modify: the system prompt in `quotation-compare-agent.ts` — one line: "Vendor score/grade is history from past deliveries; mention it when recommending, never override price/spec facts with it; 'New' means no history, not bad."
- Test: extend the existing compare-facts test (if present) with a vendor carrying a score; otherwise add `lib/procurement/__tests__/quotation-compare-facts.score.test.ts` asserting the fields pass through.

### Task 15: Item picker hint on the request form

**Files:** the PR item line component (find via `grep -rn "domain_item_id" components/procurement | grep -i "request"`).
After an IMS item is picked, `useItemVendorRatings([itemId])` → under the field: `Last bought: <Vendor> · ★4.2 (6)`; if any vendor+manufacturer combo has shrunk avg ≤ 2.5 or `meets_no > 0`, amber line: `⚠ <Vendor> / <Manufacturer>: ★2.0 — "<latest_comment>"`. Comment shown without the rater's name.

### Task 16: Score on the supplier list

**Files:** `app/(routes)/ims/settings/suppliers/page.tsx` — add a "Score" column using `useVendorScores(visibleIds)` + `VendorScoreBadge`; row click → existing detail/drawer gets a "Recent ratings" list (`procurement_ratings` select by `supplier_id`, last 10, RLS-scoped). Stop reading/writing `ims_suppliers.rating` anywhere (it is unused today — leave the column, mark deprecated in `types/ims/suppliers.ts`).

Lint all touched files; **open PR 4**.

---

## End-to-end check (after PR 1–4, on Dental test store)

1. Create a PR as a test requester → RFQ → 2 quotes (one with `delivery_time_days = 3`) → award → PO has `expected_delivery_date`.
2. GRN: receive 10, accept 8, reject 2; verify. Batch row has `supplier_id`.
3. As verifier: rate delivery ★4 + "Damaged packing".
4. As requester: card shows the line; rate ★2 without comment → blocked in UI; with comment → saved; purchase team + super admin get "Poor rating" notification.
5. Compare & Award on a new RFQ with that vendor → badge "New" (1 GRN); tooltip shows acceptance 80%.
6. `update procurement_grn set verified_at = now() - interval '16 days' where id = …;` then `select procurement_send_rating_prompts();` → `0` (already rated). Repeat on an unrated GRN → `1`, notification arrives; second run → still one notification (idempotent).
7. Clean up all test rows.

## Out of scope (v1)
- Ratings from indent/department consumers (needs batch on `ims_stock_issues`).
- Sharing scorecards with vendors; periodic snapshots/trends; server-side enforcement of the Watch reason.
