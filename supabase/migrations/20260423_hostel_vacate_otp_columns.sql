-- Migration: Parent OTP columns for hostel_vacate_requests (PR-C, 2026-04-23)
--
-- Mirrors the proven pattern from hostel_leave_requests (parent_consent_otp,
-- parent_consent_otp_expires_at). Hostel office / admin generates a 6-digit
-- OTP, relays it to the parent, and enters it back into the vacate detail
-- page to advance the engine past pending_parent.
--
-- SMS dispatch to parent is deliberately NOT wired in this PR — matches the
-- current hostel_leave_requests behaviour (line 470 of notification-service.ts
-- has `// await sendSMS(notification)` commented). That integration is a
-- separate cross-module effort.

ALTER TABLE hostel_vacate_requests
  ADD COLUMN IF NOT EXISTS parent_consent_otp TEXT,
  ADD COLUMN IF NOT EXISTS parent_consent_otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN hostel_vacate_requests.parent_consent_otp IS
  '6-digit OTP generated when pending_parent stage becomes active. NULL once consumed or expired. Mirrors hostel_leave_requests pattern.';

COMMENT ON COLUMN hostel_vacate_requests.parent_consent_otp_expires_at IS
  'Expiry timestamp (30 min from generation). Service rejects verification after this.';

COMMENT ON COLUMN hostel_vacate_requests.parent_consent_at IS
  'Timestamp of successful parent consent verification. Stamped after verifyParentOtp advances the engine.';
