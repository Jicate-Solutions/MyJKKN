-- Service-request approval steps: retire instead of orphan (2026-09-22).
--
-- Removing a step from a service type's flow deleted the row unless past
-- requests referenced it (service_request_approvals.approval_step_id), in which
-- case the delete was silently skipped and the step stayed in the LIVE flow.
-- Bonafide Certificate (Engineering) carried a ghost third "Principal" step
-- from 2026-07-22: 197 requests were approved Principal → Facilitator →
-- Principal while HR believed the flow was two steps. A referenced step must be
-- retired, not deleted: the row stays as the FK target for history, and every
-- live read (builder, new requests, approval routing, pending queues) filters
-- is_active = true.

-- 1) The flag. Existing rows are live.
ALTER TABLE public.service_request_approval_steps
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_sr_approval_steps_type_active
  ON public.service_request_approval_steps (service_type_id, step_order)
  WHERE is_active;

-- 2) step_order is unique among LIVE steps only, so a retired step's number can
--    be reused by a step added later.
ALTER TABLE public.service_request_approval_steps
  DROP CONSTRAINT IF EXISTS service_request_approval_steps_service_type_id_step_order_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_approval_steps_type_order_active
  ON public.service_request_approval_steps (service_type_id, step_order)
  WHERE is_active;

COMMENT ON COLUMN public.service_request_approval_steps.is_active IS
  'false = retired from the live flow (removed by HR after requests had already referenced it). Kept only as the FK target for service_request_approvals history; every live read filters on true.';

-- 3) Data fix — Bonafide Certificate (Engineering), service_type
--    f7ba87bf-fbac-4a36-b606-ea7479ba2dc1. Intended flow: Facilitator (Saranya G)
--    → Principal. Step 1 and 2 are rewritten in place (their ids stay the FK
--    targets of past approvals); the ghost step 3 is retired.
UPDATE public.service_request_approval_steps
   SET step_name = 'Facilitator', approver_role = 'faculty',
       approver_user_ids = ARRAY['04bfa810-95ac-4b05-9004-17eabeb0c2c5']::uuid[]
 WHERE id = 'b77c35f6-8270-4ecd-9615-ff77870e6761'
   AND service_type_id = 'f7ba87bf-fbac-4a36-b606-ea7479ba2dc1' AND step_order = 1;

UPDATE public.service_request_approval_steps
   SET step_name = 'Principal', approver_role = 'principal',
       approver_user_ids = ARRAY['ce564f06-6e81-496e-a553-21150b3688ea']::uuid[]
 WHERE id = 'c0e1a4e0-00bf-45ec-91fd-cc0fe3cd6aac'
   AND service_type_id = 'f7ba87bf-fbac-4a36-b606-ea7479ba2dc1' AND step_order = 2;

UPDATE public.service_request_approval_steps
   SET is_active = false
 WHERE id = '3a5ee201-cbea-484f-8ca5-6dbe649ed829'
   AND service_type_id = 'f7ba87bf-fbac-4a36-b606-ea7479ba2dc1' AND step_order = 3;
