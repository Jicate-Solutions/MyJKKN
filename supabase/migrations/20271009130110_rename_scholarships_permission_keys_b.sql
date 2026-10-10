-- ─── Rename billing "discounts" → "scholarships" — part 2b: permission keys, roles whose id starts 5–9 ───
-- 2026-10-09. See 20271009130000_rename_discounts_to_scholarships.sql for the rationale.
--
-- Rewrites 'billing.discounts.*' → 'billing.scholarships.*' in custom_roles.permissions,
-- values (true/false) carried over untouched. Split into three id-prefix batches because
-- trg_log_custom_role_change writes one role_audit_log row per updated role (and
-- rebuilds old/new permission snapshots), so renaming all 75 roles in one exec_sql call
-- hit the 57014 statement timeout. The audit rows are kept on purpose: a permission
-- rename SHOULD show up in the role audit trail.
--
-- Idempotent: a role already renamed has no billing.discounts.* key left and is skipped.
-- Apply all three (130100 / 130110 / 130120) before 130130, which moves the policies.
-- Applied through the Supabase MCP apply_migration as "rename_scholarships_permission_keys_b"; ledger version aligned to 20271009130110.

UPDATE public.custom_roles cr
   SET permissions = (
         SELECT jsonb_object_agg(
                  CASE WHEN e.k LIKE 'billing.discounts.%'
                       THEN 'billing.scholarships.' || substr(e.k, length('billing.discounts.') + 1)
                       ELSE e.k END,
                  e.v)
           FROM jsonb_each(cr.permissions) AS e(k, v)),
       updated_at = now()
 WHERE jsonb_typeof(cr.permissions) = 'object'
   AND substr(cr.id::text, 1, 1) BETWEEN '5' AND '9'
   AND EXISTS (SELECT 1 FROM jsonb_object_keys(cr.permissions) AS k
                WHERE k LIKE 'billing.discounts.%');
