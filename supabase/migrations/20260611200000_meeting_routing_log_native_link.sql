-- =============================================================================
-- Meeting routing log — native engine linkage (Phase N2)
-- Added: 2026-06-11
-- =============================================================================
-- The /book funnel now books through the NATIVE engine (meeting_types /
-- meeting_bookings) instead of Cal.com. New log rows reference the native
-- meeting type; cal_event_type_id stays for pre-N2 rows. cal_booking_uid now
-- stores the NATIVE booking uid for new rows (column name kept for history).

ALTER TABLE public.meeting_routing_log
  ADD COLUMN IF NOT EXISTS meeting_type_id uuid REFERENCES public.meeting_types(id);

COMMENT ON COLUMN public.meeting_routing_log.meeting_type_id IS
  'Native meeting_types.id used for the routed booking (Phase N2+). NULL on pre-N2 rows which used cal_event_type_id.';
COMMENT ON COLUMN public.meeting_routing_log.cal_booking_uid IS
  'Booking uid. Pre-N2 rows: Cal.com booking uid. N2+ rows: native meeting_bookings.uid.';

NOTIFY pgrst, 'reload schema';
