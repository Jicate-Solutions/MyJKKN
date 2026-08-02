-- Migration: 20260730130000_ims_pos_anon_lockdown
-- Purpose: Close the anon exposure on the IMS/POS surface before JKKN Pharmacy
--          starts billing, and stop leaking merchant payment details org-wide.
--
-- WHAT WAS WRONG (verified against the live project):
--
--  1. `anon` held SELECT, INSERT, UPDATE, DELETE **and TRUNCATE** on 34 ims_*
--     tables, including ims_sales, ims_sale_items, ims_stock_summary,
--     ims_stock_batches, ims_stores, ims_upi_qr_payments and
--     ims_financial_transactions. These are Supabase's ALTER DEFAULT PRIVILEGES
--     grants, never revoked for IMS. The transfer engine already documents
--     exactly why that matters — 20260801002300_ims_transfer_stock_engine.sql:482
--     ("RLS is not a substitute") — but the POS tables never got the same
--     treatment.
--
--  2. 54 ims_* policies are `TO public` rather than `TO authenticated`. The
--     20260226 hardening wrote `TO authenticated`, but the 20260728 cross-
--     institution rewrite used `ALTER POLICY … USING (…)`, which does NOT
--     preserve the role list — so every rewritten policy silently widened back
--     to PUBLIC. anon is therefore inside the policy set, and the only thing
--     actually stopping it is that anon lacks EXECUTE on
--     ims_accessible_institution_ids(), which makes policy evaluation error out.
--     One missing grant is the entire barrier for all POS revenue data, and
--     TRUNCATE does not consult policies at all.
--
--  3. ims_stores_select is `USING (true)`, deliberately opened by
--     20260303_fix_ims_stores_select_policy.sql on the reasoning that "store
--     names/codes are operational metadata, not confidential". But ims_stores
--     also holds upi_vpa, upi_merchant_name, gstin, sale_number_prefix and the
--     receipt header/footer — so every authenticated user in the organisation
--     could read the merchant UPI address that POS QR codes are minted against.
--
--  4. The ims-receipts storage bucket is `public = true` with a bucket-wide
--     `SELECT TO public` policy, so an anonymous caller could enumerate and
--     download every customer receipt: name, medicines purchased, amounts,
--     cashier, store GSTIN.
--
-- SAFETY CHECK done before writing this: `authenticated` holds its OWN grants on
-- all 38 ims_* tables (SELECT on 38, INSERT/UPDATE/DELETE on 36) and does not
-- depend on PUBLIC, so revoking PUBLIC cannot break the app. service_role and
-- postgres bypass RLS and keep their grants.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Revoke anon and PUBLIC on every ims_* relation.
--    Done as a loop rather than a hand-written list so a table added later
--    cannot be missed by a stale enumeration, and scoped to the ims_ prefix so
--    other modules' grants are left exactly as they are.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname LIKE 'ims\_%'
       AND c.relkind IN ('r', 'v', 'm', 'p')   -- tables, views, matviews, partitioned
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', r.relname);
  END LOOP;
END $$;

-- Sequences too: an INSERT grant is useless without nextval(), but leaving
-- USAGE behind is untidy and shows up in exposure sweeps.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname LIKE 'ims\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, PUBLIC', r.relname);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Re-scope every `TO public` ims_* policy to `TO authenticated`.
--
--    ALTER POLICY cannot change a policy's role list, so each one has to be
--    dropped and recreated. Rebuilt from the catalog rather than transcribed by
--    hand: 54 policies with expressions this dense would not survive being
--    retyped, and regenerating guarantees the predicate is preserved byte for
--    byte. Only the role list changes.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r        RECORD;
  v_cmd    TEXT;
  v_sql    TEXT;
  v_count  INTEGER := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl,
           pol.polname,
           pol.polcmd,
           pg_get_expr(pol.polqual, pol.polrelid)      AS using_expr,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
      FROM pg_policy pol
      JOIN pg_class c     ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname LIKE 'ims\_%'
       AND 0 = ANY (pol.polroles)     -- oid 0 in polroles means TO PUBLIC
  LOOP
    v_cmd := CASE r.polcmd
               WHEN 'r' THEN 'SELECT'
               WHEN 'a' THEN 'INSERT'
               WHEN 'w' THEN 'UPDATE'
               WHEN 'd' THEN 'DELETE'
               WHEN '*' THEN 'ALL'
             END;

    EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.tbl);

    v_sql := format('CREATE POLICY %I ON public.%I FOR %s TO authenticated',
                    r.polname, r.tbl, v_cmd);

    -- INSERT accepts only WITH CHECK; SELECT and DELETE accept only USING;
    -- UPDATE and ALL accept both.
    IF r.using_expr IS NOT NULL AND v_cmd <> 'INSERT' THEN
      v_sql := v_sql || format(' USING (%s)', r.using_expr);
    END IF;
    IF r.check_expr IS NOT NULL AND v_cmd IN ('INSERT', 'UPDATE', 'ALL') THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', r.check_expr);
    END IF;

    EXECUTE v_sql;
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Re-scoped % ims_* policies from PUBLIC to authenticated', v_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ims_stores: stop handing every user in the organisation the merchant VPA.
--
--    The reason 20260303 opened this up was an auth.uid() timing flake for super
--    admins whose profiles.institution_id IS NULL. That case is kept explicitly
--    via the super-admin arms, so the fix does not regress it. All 14 current
--    super admins have profiles.role = 'super_admin'; is_super_admin() is added
--    as a second signal in case the flag and the role ever diverge.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS ims_stores_select ON public.ims_stores;

CREATE POLICY ims_stores_select ON public.ims_stores
  FOR SELECT TO authenticated
  USING (
    institution_id IN (SELECT public.ims_accessible_institution_ids())
    OR public.get_current_user_role() = 'super_admin'
    OR public.is_super_admin()
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Receipts are patient purchase records, not public files.
--
--    Flipping the bucket to private means the stored PDF is reachable only
--    through a signed URL. lib/utils/ims-receipt-pdf.ts must mint one instead of
--    using getPublicUrl (done in the same change) — otherwise WhatsApp/email
--    sharing silently starts producing dead links.
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets SET public = false WHERE id = 'ims-receipts';

DROP POLICY IF EXISTS "Public can view IMS receipts" ON storage.objects;

-- Authenticated users may read receipts for stores they can reach. Path layout is
-- {store_id}/{YYYY-MM}/{sale_id}.pdf (lib/utils/ims-receipt-pdf.ts:55), so the
-- first path segment is the store id.
CREATE POLICY "ims_receipts_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ims-receipts'
    AND EXISTS (
      SELECT 1 FROM public.ims_stores s
       WHERE s.id::text = split_part(storage.objects.name, '/', 1)
         AND (
           s.institution_id IN (SELECT public.ims_accessible_institution_ids())
           OR public.get_current_user_role() = 'super_admin'
           OR public.is_super_admin()
         )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. ims_stock_movements: let a store admin actually SEE the ledger for the store
--    they run.
--
--    This policy still uses the pre-20260728 shape,
--        institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
--    i.e. it was missed by the cross-institution-grants rewrite that moved 62 other
--    policies onto ims_accessible_institution_ids(). It matters now because the POS
--    checkout writes this table: JKKN Pharmacy's store admin has
--    profiles.institution_id = Jicate and reaches the Pharmacy through
--    ims_user_store_grants, so every movement row he generates is one he cannot
--    read back. Stock history would look permanently empty to the person running
--    the counter.
--
--    NOT FIXED HERE (flagged instead): ims_indent_requests,
--    ims_indent_request_items, ims_supply_shipments and
--    ims_supply_shipment_item_batches carry the same stale pattern across 10 more
--    policies. Same latent cross-institution bug, but they belong to the indent and
--    transfer features rather than the POS, and rewriting them on go-live day is
--    risk without reward. Worth a follow-up.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS ims_stock_movements_select ON public.ims_stock_movements;

CREATE POLICY ims_stock_movements_select ON public.ims_stock_movements
  FOR SELECT TO authenticated
  USING (
    institution_id IN (SELECT public.ims_accessible_institution_ids())
    OR public.get_current_user_role() = 'super_admin'
    OR public.is_super_admin()
  );

COMMENT ON POLICY "ims_receipts_select_authenticated" ON storage.objects IS
'IMS POS receipts are customer purchase records (name, medicines, amounts). The '
'bucket was public=true with bucket-wide anon SELECT, so anyone could enumerate '
'and download all of them. Sharing now goes through signed URLs.';
