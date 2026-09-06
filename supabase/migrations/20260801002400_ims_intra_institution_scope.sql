-- Phase 3: allow a supply request WITHIN one institution (warehouse -> operating store).
--
-- 'inter_institution' cannot express it, and is RLS-dead anyway:
-- ims_indent_requests_select filters institution_id = the caller's institution,
-- but on an inter-institution request that column holds the REQUESTER's
-- institution — so the supplying side can never see the row it is meant to
-- fulfil. With 'intra_institution' both sides share institution_id and the
-- existing policy simply works, with no policy change.

ALTER TABLE public.ims_indent_requests DROP CONSTRAINT IF EXISTS ims_indent_requests_scope_check;
ALTER TABLE public.ims_indent_requests
  ADD CONSTRAINT ims_indent_requests_scope_check
  CHECK (request_scope IN ('internal', 'inter_institution', 'intra_institution'));

CREATE OR REPLACE FUNCTION public.ims_is_supply_scope(p_scope TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS
$$ SELECT COALESCE(p_scope, '') IN ('inter_institution', 'intra_institution') $$;

COMMENT ON FUNCTION public.ims_is_supply_scope IS
  'True for store-to-store supply scopes (as opposed to internal department indents). Single place to add future supply scopes.';

-- A supply request must name BOTH ends. The old constraint permitted a NULL
-- destination_store_id, which would leave the receipt step with nowhere to
-- credit the stock.
ALTER TABLE public.ims_indent_requests
  DROP CONSTRAINT IF EXISTS ims_indent_requests_inter_inst_required_check;
ALTER TABLE public.ims_indent_requests
  DROP CONSTRAINT IF EXISTS ims_indent_requests_supply_shape_check;
ALTER TABLE public.ims_indent_requests
  ADD CONSTRAINT ims_indent_requests_supply_shape_check CHECK (
    NOT public.ims_is_supply_scope(request_scope)
    OR (source_store_id IS NOT NULL
        AND destination_store_id IS NOT NULL
        AND destination_institution_id IS NOT NULL)
  );

-- Intra-institution means exactly that.
ALTER TABLE public.ims_indent_requests
  DROP CONSTRAINT IF EXISTS ims_indent_requests_intra_same_institution_check;
ALTER TABLE public.ims_indent_requests
  ADD CONSTRAINT ims_indent_requests_intra_same_institution_check CHECK (
    request_scope <> 'intra_institution' OR destination_institution_id = institution_id
  );

-- These column names read BACKWARDS relative to physical goods flow. Record it
-- in the schema so the next reader is not caught out; the services alias them to
-- requesting_store / supplying_store at the read layer.
COMMENT ON COLUMN public.ims_indent_requests.source_store_id IS
  'INVERTED vs physical flow: the REQUESTING store (goods END here). The supplier is destination_store_id.';
COMMENT ON COLUMN public.ims_indent_requests.destination_store_id IS
  'INVERTED vs physical flow: the SUPPLYING store (goods COME FROM here). On ims_supply_shipments the same words mean the physical opposite.';
