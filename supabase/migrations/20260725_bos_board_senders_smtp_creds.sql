-- ─────────────────────────────────────────────────────────────────────────────
-- 20260725_bos_board_senders_smtp_creds.sql
--
-- Model 3 for per-board sender identity: let each board authenticate as its OWN
-- mailbox (its own SMTP username + password) rather than sharing the
-- institution account and relying on send-as aliases / SMTP relay.
--
-- On Google Workspace (smtp.gmail.com) a single login can only send as another
-- address if that address is a verified send-as alias — otherwise Gmail
-- rewrites the From. Giving a board its own credentials sidesteps that: the
-- board logs in AS itself (e.g. hodece@jkkn.ac.in), so its From is always
-- legitimate.
--
-- Fully additive + backward-compatible: a bos_board_senders row with blank
-- smtp_user/password keeps the existing behaviour (From override on the shared
-- institution account — Models 1/2). Only rows that fill credentials switch to
-- per-board authentication (Model 3).
--
-- host/port/secure are optional overrides — blank inherits the institution's
-- smtp_configuration values, since same-domain boards typically share the same
-- server and only differ by mailbox + password.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE bos_board_senders
  ADD COLUMN IF NOT EXISTS smtp_host                VARCHAR(255),
  ADD COLUMN IF NOT EXISTS smtp_port                INTEGER,
  ADD COLUMN IF NOT EXISTS smtp_secure              BOOLEAN,
  ADD COLUMN IF NOT EXISTS smtp_user                VARCHAR(255),
  -- Historical column-name convention matches smtp_configuration: value is
  -- stored as-is (the app supplies an app-password / SMTP secret).
  ADD COLUMN IF NOT EXISTS smtp_password_encrypted  TEXT;

COMMENT ON COLUMN bos_board_senders.smtp_user IS
  'Per-board SMTP username. When set (with smtp_password_encrypted), this board authenticates as its own mailbox (Model 3). NULL → uses the institution smtp_configuration account with a From-only override.';
COMMENT ON COLUMN bos_board_senders.smtp_password_encrypted IS
  'Per-board SMTP password / app-password (stored as-is, mirroring smtp_configuration). Paired with smtp_user for per-board authentication.';
COMMENT ON COLUMN bos_board_senders.smtp_host IS
  'Optional per-board SMTP host override; NULL inherits the institution smtp_configuration host.';
COMMENT ON COLUMN bos_board_senders.smtp_port IS
  'Optional per-board SMTP port override; NULL inherits the institution smtp_configuration port.';
COMMENT ON COLUMN bos_board_senders.smtp_secure IS
  'Optional per-board TLS flag override; NULL inherits the institution smtp_configuration setting.';
