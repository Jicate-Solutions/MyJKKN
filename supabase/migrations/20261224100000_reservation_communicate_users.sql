-- ─── Reservation communications — admin/approver messages to a booked user ──
-- 2026-09-17
--
-- THE GAP. Resource Management → Reservations has approvals, cancellations,
-- and a back-and-forth thread (resource_reservation_comments, 20261129140000)
-- for hashing out what is blocking a PENDING request. Nothing lets an
-- approver or resource admin proactively TELL a booker something — "the
-- venue moved", "bring your ID", "please justify this booking" — regardless
-- of status. The only existing outbound channel is the system-triggered
-- lifecycle notification (submitted/approved/rejected/cancelled) fired by
-- ReservationService.dispatchNotification; there is no ad-hoc path.
--
-- THIS MIGRATION adds:
--   1. reservation_communications — an immutable log of sent messages, one
--      row per (reservation, message), so a message shows on the booking it
--      was about even when several reservations were messaged in one bulk
--      action.
--   2. The permission key gating who may send one:
--      resources.reservations.communicate.
--
-- Delivery itself (the in-app notification) is written by the API route at
-- send time via the shared fanoutNotification() helper — the service-role
-- write the `notifications` INSERT policy requires (BUG-004009) — not by
-- anything in this migration.
--
-- No BEGIN/COMMIT: applied through the exec_sql RPC, which forbids explicit
-- transaction control. Every statement is idempotent. Applied as THREE
-- separate calls (table+RLS, grant-true, grant-false) — one exec_sql
-- statement touching every custom_roles row twice hits the PostgREST
-- statement timeout (57014), same lesson as 20260909160200.

-- ── 1. The table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reservation_communications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid NOT NULL
                    REFERENCES public.resource_reservations(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL
                    REFERENCES public.institutions(id),
  sender_id       uuid NOT NULL DEFAULT auth.uid()
                    CONSTRAINT reservation_communications_sender_id_fkey
                    REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id    uuid NOT NULL
                    CONSTRAINT reservation_communications_recipient_id_fkey
                    REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject         text,
  message         text NOT NULL
                    CONSTRAINT reservation_communications_message_length
                    CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reservation_communications IS
  'Immutable log of ad-hoc messages an approver/admin sent to a reservation''s booker. One row per (reservation, message) so a bulk send across several bookings still logs against each one. Delivery is a fanoutNotification() in-app notification written by the API route with the service-role client; notification_id links back to it.';

CREATE INDEX IF NOT EXISTS idx_reservation_communications_reservation
  ON public.reservation_communications (reservation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reservation_communications_recipient
  ON public.reservation_communications (recipient_id);

CREATE INDEX IF NOT EXISTS idx_reservation_communications_institution
  ON public.reservation_communications (institution_id);

-- ── 2. Row level security ───────────────────────────────────────────────────
-- Same audience as the comment thread: reuse fn_can_read_reservation_comments
-- (20261129140000) rather than re-deriving "booker OR approver OR
-- institution-scoped admin staff" a second time.
ALTER TABLE public.reservation_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_communications_select ON public.reservation_communications;
CREATE POLICY reservation_communications_select ON public.reservation_communications
  FOR SELECT TO authenticated
  USING (public.fn_can_read_reservation_comments(reservation_id));

-- Defence in depth: the actual write always goes through the API route under
-- the service-role client (the notification fan-out requires it), but the
-- policy still encodes exactly who is entitled to, so the log table is never
-- an open relay if something ever writes to it directly as the caller.
DROP POLICY IF EXISTS reservation_communications_insert ON public.reservation_communications;
CREATE POLICY reservation_communications_insert ON public.reservation_communications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.user_has_permission('resources.reservations.communicate')
    AND EXISTS (
      SELECT 1
        FROM public.resource_reservations rr
        JOIN public.resources r ON r.id = rr.resource_id
       WHERE rr.id = reservation_communications.reservation_id
         AND public.role_has_institution_access(r.institution_id)
    )
  );

-- No UPDATE/DELETE policy: an immutable audit log of what was sent.

-- ── 3. Grants + schema reload ───────────────────────────────────────────────
REVOKE ALL ON public.reservation_communications FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.reservation_communications TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── 4. Permission grants ─────────────────────────────────────────────────────
-- Catalog entry ships in the same commit: lib/constants/permissions.ts, under
-- the `resources` module, right after resources.approvals.reject.
--
-- Mirrors who already holds resources.approvals.approve: messaging a booker
-- is the same class of act as approving/rejecting their request, done by the
-- same resource-approval roles. Super admin bypasses permission checks
-- entirely (user_has_permission short-circuits), so no explicit grant there.
--
-- Every other role gets an explicit `false` (not left absent) — this
-- namespace's existing keys are already explicit-false across the board, and
-- `permissions ? 'key'` (presence) is a false positive for "granted": absence
-- and false must read the same to any caller, but the audit view expects the
-- explicit shape.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'resources.reservations.communicate', true
)
WHERE role_name IN (
  'Administrator',
  'Admission Staff',
  'Chief Administrative Officer',
  'Chief Executive Officer',
  'Chief Operating Officer',
  'Executive Administrative Officer',
  'JICATE Staff',
  'Managing Director',
  'Payment Audit Admin (Test Institution)'
);

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'resources.reservations.communicate', false
)
WHERE role_name NOT IN (
  'Administrator',
  'Admission Staff',
  'Chief Administrative Officer',
  'Chief Executive Officer',
  'Chief Operating Officer',
  'Executive Administrative Officer',
  'JICATE Staff',
  'Managing Director',
  'Payment Audit Admin (Test Institution)'
);
