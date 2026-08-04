-- ============================================================================
-- Item codes generate themselves.
--
-- ims_items.code was free text with no format rule, no trim, no uppercasing and
-- no uniqueness pre-check — the only validation was "is it non-empty". The live
-- data shows what that produced: 837 of the 838 items came from two CSV imports
-- where codes were assigned offline, and the ONE item ever created by hand
-- through the form got `202510459`. A junk number, now inactive. The manual path
-- was live and unguarded.
--
-- WHY A TRIGGER RATHER THAN SERVICE CODE. Three different places insert into
-- ims_items — the item form (inventory-service.createItem), the bulk import
-- (inventory-service.server.bulkImport) and procurement's reconcileNewItem —
-- and a fourth will turn up. One BEFORE INSERT trigger covers all of them.
--
-- It also settles the lesson recorded in sales-service.ts:636-650, where the
-- client-side sale-number generator was DELETED: pre-allocating a number in the
-- browser burned it whenever the save failed, and the browser's clock disagreed
-- with the UTC-keyed counter between 00:00 and 05:30 IST. Drawing the number
-- inside the inserting transaction fixes both — a rolled-back insert rolls back
-- its counter bump too.
--
-- WHY THE COUNTER IS KEYED ON institution_id. 20260801002700 is the cautionary
-- tale: the indent counter was keyed (store_id, date) while indent_number was
-- GLOBALLY unique, so the second store to raise an indent on a given day hit a
-- 23505. The counter's scope must equal the constraint's scope, and ims_items is
-- UNIQUE (institution_id, code). Never store_id.
--
-- WHY NO DATE COLUMN. Every existing IMS counter (sale, GRN, indent) is
-- counter_date-scoped and resets daily. That is right for documents and wrong
-- for item codes, which must stay monotonic forever.
-- ============================================================================

SET lock_timeout = '15s';

-- ── a) Per-category prefix ──────────────────────────────────────────────────
-- Pharmacy derives its prefix from the CATEGORY (SOL/LIQ/GLW map 1:1 onto
-- AUTO-SOLID / AUTO-LIQUID / AUTO-GLASSWARE). Dental derives it from the
-- institution and ignores category entirely. Both conventions have to keep
-- working, so the prefix can come from either — see the settings table below.
ALTER TABLE public.ims_item_categories
    ADD COLUMN IF NOT EXISTS item_code_prefix TEXT;

COMMENT ON COLUMN public.ims_item_categories.item_code_prefix IS
    'Optional prefix for auto-generated item codes in this category. NULL means '
    'fall back to the institution prefix. Only meaningful when the institution has '
    'use_category_prefix = true.';

-- Seeded for Pharmacy's three categories ONLY, deliberately.
-- ims_item_categories has no institution_id and its `code` is GLOBALLY unique, so
-- a prefix on a shared category would leak across institutions. Dental's items sit
-- under the shared AUTO-CONSUMABLE / AUTO-SURGICAL, and must fall through to the
-- institution prefix to keep getting DCH.
UPDATE public.ims_item_categories SET item_code_prefix = 'SOL' WHERE code = 'AUTO-SOLID';
UPDATE public.ims_item_categories SET item_code_prefix = 'LIQ' WHERE code = 'AUTO-LIQUID';
UPDATE public.ims_item_categories SET item_code_prefix = 'GLW' WHERE code = 'AUTO-GLASSWARE';

-- ── b) Per-institution settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ims_item_code_settings (
    institution_id      UUID PRIMARY KEY REFERENCES public.institutions(id) ON DELETE CASCADE,
    prefix              TEXT NOT NULL,
    use_category_prefix BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ims_item_code_settings IS
    'How auto-generated item codes are shaped per institution. An explicit table '
    'rather than reusing institutions.counselling_code, which means something else '
    'and is dirty: it has duplicates (CAS twice) and junk values (1234, 123, MATRIC).';
COMMENT ON COLUMN public.ims_item_code_settings.use_category_prefix IS
    'true: the item category''s item_code_prefix wins when it has one (Pharmacy). '
    'false: every item gets this institution''s prefix regardless of category (Dental).';

INSERT INTO public.ims_item_code_settings (institution_id, prefix, use_category_prefix)
VALUES
    -- Dental: everything is DCH, whatever the category says.
    ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'DCH', false),
    -- Pharmacy: categories supply SOL / LIQ / GLW; COP only if one has no prefix.
    ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'COP', true)
ON CONFLICT (institution_id) DO NOTHING;

-- ── c) The counter ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ims_item_code_counters (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    prefix         TEXT NOT NULL,
    last_number    INTEGER NOT NULL DEFAULT 0,

    -- Per-prefix, not a constant. Pharmacy's live codes are 3 digits (SOL-394) and
    -- Dental's are 4 (DCH-0076). Storing the width lets each series continue
    -- unbroken — SOL-395, DCH-0077 — instead of restarting at a new width. It is a
    -- MINIMUM: past the ceiling lpad simply stops padding and SOL-999 becomes
    -- SOL-1000, which still sorts and never collides.
    pad_width      INTEGER NOT NULL DEFAULT 4 CHECK (pad_width BETWEEN 1 AND 12),

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ims_item_code_counters_institution_prefix_unique UNIQUE (institution_id, prefix)
);

COMMENT ON TABLE public.ims_item_code_counters IS
    'Monotonic item-code sequence per (institution, prefix). Deliberately has NO '
    'counter_date, unlike the sale/GRN/indent counters: item codes never reset.';

-- Seeded from the codes that already exist, so a generated code can never land on
-- a legacy one. Measured before writing this: SOL 394/3, LIQ 194/3, GLW 173/3,
-- DCH 76/4. The junk `202510459` does not match the pattern and is ignored, which
-- is the intended outcome — it is not part of any series.
INSERT INTO public.ims_item_code_counters (institution_id, prefix, last_number, pad_width)
SELECT i.institution_id,
       upper((regexp_match(i.code, '^([A-Za-z]+)-([0-9]+)$'))[1]),
       max(((regexp_match(i.code, '^([A-Za-z]+)-([0-9]+)$'))[2])::INT),
       max(length((regexp_match(i.code, '^([A-Za-z]+)-([0-9]+)$'))[2]))
  FROM public.ims_items i
 WHERE i.institution_id IS NOT NULL
   AND i.code ~ '^[A-Za-z]+-[0-9]+$'
 GROUP BY 1, 2
ON CONFLICT (institution_id, prefix) DO NOTHING;

-- No policies, exactly like ims_sale_number_counters: the SECURITY DEFINER
-- function is the only thing that ever touches this table.
ALTER TABLE public.ims_item_code_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_item_code_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ims_item_code_settings_select ON public.ims_item_code_settings;
CREATE POLICY ims_item_code_settings_select
    ON public.ims_item_code_settings
    FOR SELECT
    TO authenticated
    USING (
        public.get_current_user_role() = 'super_admin'
        OR institution_id IN (SELECT public.ims_accessible_institution_ids())
    );

REVOKE ALL ON public.ims_item_code_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ims_item_code_settings FROM PUBLIC, anon;
GRANT SELECT ON public.ims_item_code_settings TO authenticated;

-- ── d) The generator ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_next_item_code(
    p_institution_id UUID,
    p_category_id    UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_prefix    TEXT;
    v_inst_pref TEXT;
    v_use_cat   BOOLEAN;
    v_next      INTEGER;
    v_pad       INTEGER;
BEGIN
    -- institution_id is nullable on ims_items (added 2026-02-18 for super admins
    -- with no institution), and Postgres treats NULLs as distinct in a UNIQUE, so
    -- uniqueness silently lapses for those rows. There is no sequence to draw
    -- from and nothing to collide with, so fall back to a timestamp rather than
    -- opening a counter row keyed on NULL.
    IF p_institution_id IS NULL THEN
        RETURN 'ITM-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD')
                      || '-' || lpad((extract(epoch FROM clock_timestamp())::BIGINT % 100000)::TEXT, 5, '0');
    END IF;

    SELECT s.prefix, s.use_category_prefix
      INTO v_inst_pref, v_use_cat
      FROM public.ims_item_code_settings s
     WHERE s.institution_id = p_institution_id;

    -- Unconfigured institutions behave like Pharmacy: let a category speak if it has
    -- something to say. Dental opts out explicitly.
    v_use_cat := COALESCE(v_use_cat, true);

    IF v_use_cat AND p_category_id IS NOT NULL THEN
        SELECT NULLIF(btrim(c.item_code_prefix), '')
          INTO v_prefix
          FROM public.ims_item_categories c
         WHERE c.id = p_category_id;
    END IF;

    IF v_prefix IS NULL THEN
        v_prefix := NULLIF(btrim(COALESCE(v_inst_pref, '')), '');
    END IF;

    -- Last resort before ITM. counselling_code is the only institution-level short
    -- code that exists, but it is not maintained for this purpose — hence the
    -- shape test rather than trusting it.
    IF v_prefix IS NULL THEN
        SELECT upper(regexp_replace(COALESCE(inst.counselling_code, ''), '[^A-Za-z]', '', 'g'))
          INTO v_prefix
          FROM public.institutions inst
         WHERE inst.id = p_institution_id;

        IF COALESCE(v_prefix, '') !~ '^[A-Z]{2,6}$' THEN
            v_prefix := NULL;
        END IF;
    END IF;

    v_prefix := upper(regexp_replace(COALESCE(v_prefix, 'ITM'), '[^A-Za-z0-9]', '', 'g'));
    IF v_prefix = '' THEN
        v_prefix := 'ITM';
    END IF;

    -- The whole allocation, atomic. Same shape as ims_next_sale_number; the row
    -- lock taken by ON CONFLICT DO UPDATE is what serialises concurrent creators.
    INSERT INTO public.ims_item_code_counters (institution_id, prefix, last_number, pad_width)
    VALUES (p_institution_id, v_prefix, 1, 4)
    ON CONFLICT (institution_id, prefix)
    DO UPDATE SET last_number = ims_item_code_counters.last_number + 1,
                  updated_at  = now()
    RETURNING last_number, pad_width INTO v_next, v_pad;

    RETURN v_prefix || '-' || lpad(v_next::TEXT, COALESCE(v_pad, 4), '0');
END;
$function$;

COMMENT ON FUNCTION public.ims_next_item_code(UUID, UUID) IS
    'Allocates the next item code for an institution. Prefix resolution: category '
    'prefix (if the institution uses them) -> institution prefix -> sanitised '
    'counselling_code -> ITM. Atomic; safe under concurrency.';

REVOKE ALL     ON FUNCTION public.ims_next_item_code(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ims_next_item_code(UUID, UUID) TO   authenticated;

-- ── e) Fill it in on the way past ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ims_items_autofill_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        NEW.code := public.ims_next_item_code(NEW.institution_id, NEW.category_id);
    ELSE
        -- A supplied code still gets trimmed. The form never trimmed, and an
        -- invisible trailing space is a duplicate the unique index will not catch.
        NEW.code := btrim(NEW.code);
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.ims_items_autofill_code() IS
    'Fills ims_items.code when the insert leaves it blank. NOT NULL is checked '
    'after BEFORE triggers run, so passing NULL is legal and is how every caller '
    'now asks for a generated code.';

DROP TRIGGER IF EXISTS ims_items_autofill_code ON public.ims_items;
CREATE TRIGGER ims_items_autofill_code
    BEFORE INSERT ON public.ims_items
    FOR EACH ROW
    EXECUTE FUNCTION public.ims_items_autofill_code();

-- ── f) A generated code is not a proposable field ───────────────────────────
-- ims_review_item_change_request currently has `code = m.code` first in its SET
-- list, so an approved change request could rewrite a generated code even after
-- the form stops offering the field. Drop it from the allowlist; everything else
-- in the function is unchanged.
CREATE OR REPLACE FUNCTION public.ims_review_item_change_request(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_req    public.ims_item_change_requests;
    v_item   public.ims_items;
    v_merged JSONB;
    v_key    TEXT;
    v_stale  TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF public.get_current_user_role() <> 'super_admin' THEN
        RAISE EXCEPTION 'Only a super admin can review item change requests'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_req
      FROM public.ims_item_change_requests
     WHERE id = p_request_id
     FOR UPDATE;

    IF v_req.id IS NULL THEN
        RAISE EXCEPTION 'Change request not found' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'This request was already %', v_req.status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NOT p_approve THEN
        UPDATE public.ims_item_change_requests
           SET status = 'rejected', reviewed_by = auth.uid(),
               reviewed_at = now(), review_note = p_note, updated_at = now()
         WHERE id = p_request_id;

        RETURN jsonb_build_object('status', 'rejected', 'item_id', v_req.item_id);
    END IF;

    SELECT * INTO v_item FROM public.ims_items WHERE id = v_req.item_id FOR UPDATE;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'The item no longer exists' USING ERRCODE = 'no_data_found';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(v_req.proposed_changes) LOOP
        IF (to_jsonb(v_item) -> v_key) IS DISTINCT FROM (v_req.current_values -> v_key) THEN
            v_stale := v_stale || v_key;
        END IF;
    END LOOP;

    IF array_length(v_stale, 1) > 0 THEN
        RAISE EXCEPTION
            'The item changed since this request was raised (%). Ask for a fresh request.',
            array_to_string(v_stale, ', ')
            USING ERRCODE = 'serialization_failure';
    END IF;

    v_merged := to_jsonb(v_item) || v_req.proposed_changes;

    -- `code` is deliberately absent: it is generated and immutable.
    -- `id`, `institution_id`, `store_id` and the created_* columns remain absent
    -- for the original reason — a request must not move an item between stores.
    UPDATE public.ims_items AS i
       SET name                    = m.name,
           description             = m.description,
           company_name            = m.company_name,
           brand                   = m.brand,
           category_id             = m.category_id,
           item_type               = m.item_type,
           base_unit_id            = m.base_unit_id,
           purchase_unit_id        = m.purchase_unit_id,
           sale_unit_id            = m.sale_unit_id,
           indent_unit_id          = m.indent_unit_id,
           cost_price              = m.cost_price,
           mrp                     = m.mrp,
           selling_price           = m.selling_price,
           gst_rate                = m.gst_rate,
           hsn_code                = m.hsn_code,
           reorder_level           = m.reorder_level,
           max_stock_level         = m.max_stock_level,
           is_active               = m.is_active,
           track_batch             = m.track_batch,
           track_expiry            = m.track_expiry,
           is_sellable_to_students = m.is_sellable_to_students,
           is_distributable        = m.is_distributable,
           is_bundle               = m.is_bundle,
           is_chemical             = m.is_chemical,
           variant_attributes      = m.variant_attributes,
           image_url               = m.image_url,
           updated_at              = now()
      FROM jsonb_populate_record(NULL::public.ims_items, v_merged) AS m
     WHERE i.id = v_req.item_id;

    UPDATE public.ims_item_change_requests
       SET status = 'approved', reviewed_by = auth.uid(),
           reviewed_at = now(), review_note = p_note,
           applied_at = now(), updated_at = now()
     WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'status',  'approved',
        'item_id', v_req.item_id,
        'applied', v_req.proposed_changes
    );
END;
$function$;
