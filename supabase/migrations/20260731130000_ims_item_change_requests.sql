-- ============================================================================
-- Item edits that need a second signature.
--
-- A POS store manager runs the counter: they sell, they see stock, they read
-- reports. What they must NOT do is quietly change what an item IS — its price,
-- its name, whether it is sellable. Those edits become REQUESTS that a super admin
-- approves, and approving applies the change.
--
-- Two rules shape the design, and both are about the apply step rather than the
-- approval step. Approving is a click; applying runs with elevated rights against
-- a JSON document that a non-admin composed.
--
--   1. THE COLUMN ALLOWLIST IS THE SET CLAUSE. A request is free to contain
--      {"institution_id": "<another college>"} — nothing stops the proposer
--      writing that. It is not enough to filter such keys out; the apply step
--      lists the columns it will write, literally, so an unlisted column is
--      unwritable by construction rather than by a filter someone forgets to
--      update. id / institution_id / store_id / created_* are absent on purpose.
--
--   2. A STALE REQUEST IS REFUSED, NOT APPLIED. The values are captured when the
--      request is raised. If the item moved in the meantime, applying would
--      silently clobber whoever changed it — and worse, the approver would have
--      approved a before/after diff that no longer describes reality. So the
--      function re-checks every proposed field against what the row holds NOW and
--      refuses if any of them moved.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ims_item_change_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    item_id           UUID NOT NULL REFERENCES public.ims_items(id) ON DELETE CASCADE,
    institution_id    UUID NOT NULL REFERENCES public.institutions(id),
    -- Which counter the request came from. Nullable: the item catalogue is
    -- institution-scoped, so a request is not necessarily tied to one store.
    store_id          UUID REFERENCES public.ims_stores(id),

    requested_by      UUID NOT NULL REFERENCES public.profiles(id),
    requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason            TEXT,

    -- {column: newValue} — only the fields the requester actually changed.
    proposed_changes  JSONB NOT NULL,
    -- {column: valueWhenRequested} — the other half of the diff the approver
    -- reads, and what staleness is judged against.
    current_values    JSONB NOT NULL,

    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

    reviewed_by       UUID REFERENCES public.profiles(id),
    reviewed_at       TIMESTAMPTZ,
    review_note       TEXT,
    applied_at        TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- An empty request is a bug, not an edit.
    CONSTRAINT ims_item_change_requests_not_empty
        CHECK (jsonb_typeof(proposed_changes) = 'object' AND proposed_changes <> '{}'::jsonb)
);

COMMENT ON TABLE public.ims_item_change_requests IS
    'Proposed edits to ims_items from users who may request but not apply changes '
    '(e.g. pos_store_manager). Approving through ims_review_item_change_request '
    'applies the change in the same transaction.';

-- The approval queue reads pending-first, newest-first.
CREATE INDEX IF NOT EXISTS idx_ims_item_change_requests_status
    ON public.ims_item_change_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_item_change_requests_item
    ON public.ims_item_change_requests (item_id);
CREATE INDEX IF NOT EXISTS idx_ims_item_change_requests_requester
    ON public.ims_item_change_requests (requested_by, status);

-- One open request per item. A second pending edit to the same item would give
-- the approver two diffs both claiming to start from the current values, and
-- whichever applied second would be stale.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ims_item_change_requests_one_open
    ON public.ims_item_change_requests (item_id)
    WHERE status = 'pending';

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.ims_item_change_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON TABLE public.ims_item_change_requests FROM anon, PUBLIC, authenticated;
GRANT  SELECT, INSERT ON TABLE public.ims_item_change_requests TO authenticated;
-- No UPDATE/DELETE grant on purpose: a request changes state ONLY through
-- ims_review_item_change_request, so nobody can mark their own request approved.

DROP POLICY IF EXISTS ims_item_change_requests_select ON public.ims_item_change_requests;
CREATE POLICY ims_item_change_requests_select
    ON public.ims_item_change_requests FOR SELECT TO authenticated
    USING (
        public.get_current_user_role() = 'super_admin'
        OR requested_by = auth.uid()
        OR institution_id IN (SELECT public.ims_accessible_institution_ids())
    );

DROP POLICY IF EXISTS ims_item_change_requests_insert ON public.ims_item_change_requests;
CREATE POLICY ims_item_change_requests_insert
    ON public.ims_item_change_requests FOR INSERT TO authenticated
    WITH CHECK (
        -- You may only raise a request as yourself, for an institution you can
        -- already reach. A raised request grants nothing until it is approved.
        requested_by = auth.uid()
        AND (
            public.get_current_user_role() = 'super_admin'
            OR institution_id IN (SELECT public.ims_accessible_institution_ids())
        )
    );

-- ============================================================================
-- Review a request: approve (and apply) or reject, in one transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ims_review_item_change_request(
    p_request_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_req      public.ims_item_change_requests;
    v_item     public.ims_items;
    v_merged   JSONB;
    v_key      TEXT;
    v_stale    TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Only a super admin decides. SECURITY DEFINER bypasses RLS, so without this
    -- the requester could approve their own edit by calling the function directly.
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

    -- ── Reject ──────────────────────────────────────────────────────────────
    IF NOT p_approve THEN
        UPDATE public.ims_item_change_requests
           SET status = 'rejected', reviewed_by = auth.uid(),
               reviewed_at = now(), review_note = p_note, updated_at = now()
         WHERE id = p_request_id;

        RETURN jsonb_build_object('status', 'rejected', 'item_id', v_req.item_id);
    END IF;

    -- ── Approve ─────────────────────────────────────────────────────────────
    SELECT * INTO v_item FROM public.ims_items WHERE id = v_req.item_id FOR UPDATE;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'The item no longer exists' USING ERRCODE = 'no_data_found';
    END IF;

    -- Staleness: every field being changed must still hold the value it held when
    -- the request was raised. Otherwise the approver is looking at a diff that no
    -- longer describes the row, and applying would clobber whoever moved it.
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

    -- Merge, then write ONLY the columns named below. This SET list IS the
    -- allowlist: id, institution_id, store_id, created_by and the timestamps are
    -- absent, so a request naming them cannot move them however it is composed.
    v_merged := to_jsonb(v_item) || v_req.proposed_changes;

    UPDATE public.ims_items AS i
       SET code                    = m.code,
           name                    = m.name,
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

COMMENT ON FUNCTION public.ims_review_item_change_request(UUID, BOOLEAN, TEXT) IS
    'Super-admin only. Approving applies the proposed change to ims_items and marks '
    'the request approved in ONE transaction; rejecting records the decision. '
    'Refuses a request whose underlying values moved since it was raised.';

-- Anon must never reach this: it edits the item catalogue.
REVOKE ALL     ON FUNCTION public.ims_review_item_change_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ims_review_item_change_request(UUID, BOOLEAN, TEXT) TO   authenticated;
