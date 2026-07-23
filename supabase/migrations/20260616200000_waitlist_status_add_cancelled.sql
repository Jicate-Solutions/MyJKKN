-- Admin can cancel a waiting/offered upgrade request; give it a distinct terminal status
-- (separate from the auto-expiry 'expired') for audit clarity.
ALTER TYPE public.waitlist_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
