-- ============================================================================
-- Migration: 20260906020000_network_sso_foundation
-- Campus Wi-Fi captive-portal SSO — foundation schema (Part 1 revision)
-- ============================================================================
-- FILE ONLY — NOT APPLIED to any database. Director-gated apply.
--
-- Supersedes Draft PR #792 (supabase/migrations/20260512000001_create_network_
-- module_schema.sql, never applied; production has 0 network_* tables and
-- 0 fn_network_* functions). Rewritten on today's jicate/main per
-- specs/network-sso-parts-2-5-2026-09-06.md (Part 1 revision) and the
-- Director's 2026-09-06 00:05 / 00:20 rulings:
--   Q1 learner signs in with Google via MyJKKN (OAuth subflow) — so
--      network_pending_requests STAYS.
--   Q2 the MikroTik CCR2116 hotspot hosts the captive page.
--   Q4 network admin = super_admin + system_admin — no new role, no role names
--      anywhere in this file.
--
-- What changed against #792 (everything else — tables, indexes, triggers,
-- partition strategy, master seeds — is kept):
--   (1) RLS: every `profiles.role IN (...)` predicate is gone ('director' is not
--       a role_key; 0 profiles carry it). Policies read
--       is_super_admin() OR is_admin() OR (user_has_permission('network.<key>')
--       AND role_has_institution_access(institution_id)).
--   (2) GRANTS: all 7 functions are SECURITY DEFINER with SET search_path,
--       every one REVOKEd FROM anon, PUBLIC; server-side-only ones are granted
--       to service_role, the two learner-reachable ones to authenticated WITH an
--       authorization check in the body (assertion 2 of check-secdef-anon-revoke).
--   (3) CONFIG: network_module_config is DROPPED from the design. Its tunables
--       are platform_policies rows (network.* keys, scope 'global'); functions
--       read them through fn_get_policy_int / _bool / _json with the
--       institution_id as scope, so an institution row can override later.
--   (4) SEEDS: domains are jkkn.ai (radius.jkkn.ai, https://www.jkkn.ai/…);
--       master rows are seeded for EVERY row of `institutions` (INSERT … SELECT,
--       never a hardcoded id).
--   (5) PARTITIONS: 2026_09 / 2026_10 / 2026_11 + a DEFAULT partition on both
--       partitioned tables so an insert can never fail on a missing month.
--   (6) pg_cron schedules are COMMENTED (repo style) — never executed here.
--
-- Round 2 (2026-09-06, independent review of Draft #3303):
--   (7) network_devices: authenticated loses INSERT/UPDATE/DELETE on the table;
--       a person may UPDATE only device_label (column-level grant) and DELETE
--       their own rows. Registration (and every trust/whitelist flag) goes
--       through fn_network_register_device only.
--   (8) fn_network_register_device resolves role + institution from `profiles`
--       for the device owner unless the caller is service_role; the caller's
--       p_user_role / p_institution_id arguments are ignored otherwise.
--   (9) Per-role policy JSON is keyed on REAL role_keys (student, faculty,
--       admin, administrator, system_admin, warden, chief_warden,
--       gate_security) with a documented '_default' entry.
--  (10) Master-table SELECT policies carry network.view + institution scope.
--  (11) Sign-in methods: google_sso is the only active seed (Q1); the rest are
--       seeded inactive; biometric is gone (no substrate exists).
--  (12) fn_network_create_monthly_partitions covers months 0..3, schema-
--       qualifies its pg_class check, and survives a DEFAULT-partition clash
--       per month (RAISE WARNING, continue). See the function comment.
--  (13) Teleport trigger: one indexed lookup bounded by the policy window on
--       the partition key, absolute gap.
--  (14) network_radius_servers: SELECT via network.view; writes via
--       network.routers.manage; institution-scoped where institution_id is set.
--  (15) created_at/updated_at + trigger on network_lockouts;
--       updated_at + trigger on network_pending_requests.
--  (16) The four service-role-only functions and the trigger function are
--       REVOKEd from authenticated too (found by the round-2 rehearsal once
--       it reproduced Supabase's default EXECUTE grant).
--
-- Migration class: ADD_ONLY. No CREATE OR REPLACE (all objects are new; the
-- classifier treats OR REPLACE as ASK), no DROP, no ALTER of an existing
-- object, no data UPDATE/DELETE against an existing table. No BEGIN/COMMIT in
-- the file: the ship-wave applies it as ONE transaction — BEGIN…ROLLBACK
-- rehearsal, then BEGIN…COMMIT (scripts/ship-wave/apply-migrations.sh) — so
-- the file is either fully applied or not at all; it is not written to be
-- re-run (CREATE TRIGGER / POLICY / FUNCTION are deliberately not IF NOT EXISTS).
--
-- Permission grants are NOT in this file: granting the network.* keys to
-- system_admin is a data change on custom_roles (ASK class). The Director
-- grants them once in Role Management, the platform's source of truth.
--
-- Rehearsal: run on a scratch PostgreSQL 16 with STUBS for auth.uid(),
-- auth.role(), profiles, institutions, the four permission predicates and
-- platform_policies. That proves syntax, object references, grants/RLS
-- shape and the functions' control flow against those stubs. It does NOT
-- prove production permission semantics (the real user_has_permission /
-- role_has_institution_access bodies, real role assignments) — those are
-- exercised only after the Director's apply, as a real user.
--
-- Terminology: learner / Senior Learner throughout (never the legacy words).
-- ============================================================================

-- ============================================================================
-- BLOCK 1: MASTER TABLES (CRUDable per institution; seeded with system rows)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: network_auth_methods
-- Purpose: Authentication methods accepted by captive portal (per institution)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_auth_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  code TEXT NOT NULL,                    -- machine key: 'google_sso' (the only active seed, Q1), 'email_password','microsoft_sso','rfid','guest_token' (seeded inactive)
  display_name TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,                        -- Lucide icon for portal UI
  display_order INT NOT NULL DEFAULT 100,

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,  -- seeded rows cannot be deleted

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_network_auth_methods_institution ON public.network_auth_methods(institution_id);
CREATE INDEX IF NOT EXISTS idx_network_auth_methods_active ON public.network_auth_methods(institution_id, is_active) WHERE is_active = true;

CREATE TRIGGER set_network_auth_methods_updated_at
  BEFORE UPDATE ON public.network_auth_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_bandwidth_tiers
-- Purpose: Attendance-based bandwidth tiers (Director decision #7)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_bandwidth_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  code TEXT NOT NULL,                    -- 'tier_a','tier_b','tier_c','tier_d'
  display_name TEXT NOT NULL,
  attendance_min_pct NUMERIC(5,2) NOT NULL,  -- inclusive lower bound, e.g. 95.00
  attendance_max_pct NUMERIC(5,2) NOT NULL,  -- inclusive upper bound, e.g. 100.00
  download_mbps INT NOT NULL,
  upload_mbps INT NOT NULL,
  display_order INT NOT NULL DEFAULT 100,

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (institution_id, code),
  CHECK (attendance_min_pct >= 0 AND attendance_max_pct <= 100),
  CHECK (attendance_min_pct <= attendance_max_pct),
  CHECK (download_mbps > 0 AND upload_mbps > 0)
);

CREATE INDEX IF NOT EXISTS idx_network_bandwidth_tiers_institution ON public.network_bandwidth_tiers(institution_id);

CREATE TRIGGER set_network_bandwidth_tiers_updated_at
  BEFORE UPDATE ON public.network_bandwidth_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_block_reasons
-- Purpose: Catalog of reasons a person can be blocked from the network
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_block_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  code TEXT NOT NULL,                    -- 'fee_overdue','lockout_threshold','session_expired','terminated_user','security_incident','manual_ban'
  display_name TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  is_user_visible BOOLEAN NOT NULL DEFAULT true,  -- shown on portal "blocked" page

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_network_block_reasons_institution ON public.network_block_reasons(institution_id);

CREATE TRIGGER set_network_block_reasons_updated_at
  BEFORE UPDATE ON public.network_block_reasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- BLOCK 2: OPERATIONAL TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: network_routers
-- Purpose: Registry of MikroTik routers per institution
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,

  hostname TEXT NOT NULL,
  description TEXT,
  model TEXT,                            -- 'CCR2116-12G-4S+'
  routeros_version TEXT,
  serial_number TEXT,

  -- RADIUS configuration (architecture pivot 2026-05-09; see Spec-Decisions-Locked decision #25)
  -- Each MikroTik points at exactly ONE network_radius_servers row, sending RADIUS over TLS (RADSEC).
  -- RouterOS 7 /radius supports protocol=radsec natively; the linked server row may still be 'radius_udp' where RADSEC is unavailable.
  radius_server_id UUID,                       -- FK set after network_radius_servers is created (constraint below)
  radius_shared_secret_ref TEXT NOT NULL,      -- vault/secret-store reference; never plaintext (RouterOS fixes the RADSEC secret to 'radsec'; this ref matters for radius_udp)
  radius_nas_identifier TEXT,                  -- arbitrary string router puts in Access-Request; maps to institution + campus

  -- Optional admin REST API access (for panic-button kicks, IoT whitelist syncs).
  -- Not the primary auth path. Auth flows entirely through RADIUS.
  api_endpoint TEXT,                           -- 'https://172.20.0.1' for admin REST (optional)
  api_verify_tls BOOLEAN NOT NULL DEFAULT false,

  campus_label TEXT,                     -- 'main','engineering','medical','arts'
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,

  last_health_check_at TIMESTAMPTZ,
  last_health_status TEXT CHECK (last_health_status IN ('ok','degraded','down')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (institution_id, hostname)
);

CREATE INDEX IF NOT EXISTS idx_network_routers_institution ON public.network_routers(institution_id);
CREATE INDEX IF NOT EXISTS idx_network_routers_active ON public.network_routers(institution_id, is_active) WHERE is_active = true;

CREATE TRIGGER set_network_routers_updated_at
  BEFORE UPDATE ON public.network_routers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_radius_servers
-- Purpose: Registry of FreeRADIUS endpoints that terminate RADIUS/RADSEC from
--          MikroTik routers and proxy auth decisions to MyJKKN's HTTP API.
--          Architecture pivot 2026-05-09 (see Spec-Decisions-Locked decision #25).
--          One JICATE-managed VPS serves all customer routers as multi-tenant
--          RADIUS termination — clients.conf entries on the VPS map each
--          router to its institution_id via NAS-Identifier.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_radius_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- This is the JICATE-managed shared infra; institution_id is nullable for the
  -- shared row, OR set to the institution that owns a dedicated RADIUS box.
  institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,

  display_name TEXT NOT NULL,                  -- 'JICATE Shared RADIUS (Hetzner FRA)'
  hostname TEXT NOT NULL,                      -- 'radius.jkkn.ai'
  ipv4_address TEXT,                           -- DNS preferred, but pinned for clients.conf
  auth_port INT NOT NULL DEFAULT 2083,         -- RADSEC default
  acct_port INT NOT NULL DEFAULT 2083,         -- accounting on same port for RADSEC
  coa_port INT NOT NULL DEFAULT 3799,          -- RFC 5176 dynamic auth

  protocol TEXT NOT NULL DEFAULT 'radsec' CHECK (protocol IN ('radsec', 'radius_udp')),  -- 'radius_udp' (ports 1812/1813) where RADSEC is unavailable
  tls_cert_fingerprint TEXT,                   -- pinned cert SHA-256 for RouterOS to verify

  -- Where this RADIUS server proxies auth decisions
  myjkkn_auth_endpoint TEXT NOT NULL,          -- 'https://www.jkkn.ai/api/network/radius-auth'
  myjkkn_acct_endpoint TEXT,                   -- if accounting goes through HTTP rather than direct DB writes

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,

  last_health_check_at TIMESTAMPTZ,
  last_health_status TEXT CHECK (last_health_status IN ('ok','degraded','down')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (hostname, auth_port)
);

CREATE INDEX IF NOT EXISTS idx_network_radius_servers_active ON public.network_radius_servers(is_active) WHERE is_active = true;

CREATE TRIGGER set_network_radius_servers_updated_at
  BEFORE UPDATE ON public.network_radius_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Now that the table exists, link network_routers.radius_server_id to it.
-- (Both tables are born in this file — this is not an alteration of an existing object.)
ALTER TABLE public.network_routers
  ADD CONSTRAINT fk_network_routers_radius_server
  FOREIGN KEY (radius_server_id) REFERENCES public.network_radius_servers(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- Table: network_pending_requests
-- Purpose: Captures captive-portal context across the MyJKKN auth round-trip.
--          Q1 (2026-09-06): the learner signs in with Google via MyJKKN, so
--          this OAuth-subflow table is on the primary path — the hotspot
--          redirects to /api/network/sso, MyJKKN runs Google OAuth (mirrors
--          samlReqId), then hands the browser back to the hotspot login URL
--          with a one-time credential the router forwards over RADIUS.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_pending_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES public.network_routers(id) ON DELETE CASCADE,

  -- Captive portal request context (captured from MikroTik hotspot variables)
  client_mac TEXT NOT NULL,              -- 'AA:BB:CC:DD:EE:FF'
  client_ip TEXT,
  ap_mac TEXT,                           -- access point MAC (for room mapping)
  ssid TEXT,
  rssi INT,                              -- signal strength
  redirect_url TEXT,                     -- where the person wanted to go before captive ($(link-orig))

  -- Request fingerprint
  user_agent TEXT,
  device_hint TEXT,                      -- 'mobile','tablet','laptop' from UA parse

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  consumed_at TIMESTAMPTZ                -- set on resume; row deleted by handler
);

CREATE INDEX IF NOT EXISTS idx_network_pending_requests_expires ON public.network_pending_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_network_pending_requests_mac ON public.network_pending_requests(institution_id, client_mac);

CREATE TRIGGER set_network_pending_requests_updated_at
  BEFORE UPDATE ON public.network_pending_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_sessions  (PARTITIONED by created_at for forever-retention)
-- Purpose: Active and historical Wi-Fi sessions. Partitioned monthly so the
--          live table stays fast and old partitions can be archived to cold
--          storage without affecting current queries.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES public.network_routers(id) ON DELETE RESTRICT,

  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL for guest sessions
  user_role TEXT,                        -- frozen at session start
  auth_method_code TEXT NOT NULL,        -- references network_auth_methods.code

  client_mac TEXT NOT NULL,
  client_ip TEXT,
  ap_mac TEXT,
  ssid TEXT,
  device_label TEXT,                     -- person-assigned name from device-list page

  bandwidth_tier_code TEXT,              -- references network_bandwidth_tiers.code at session start
  download_mbps INT,                     -- snapshot at session start
  upload_mbps INT,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_reason TEXT,                       -- 'logout','timeout','admin_kick','fee_block','user_terminated','router_restart'

  bytes_uploaded BIGINT DEFAULT 0,
  bytes_downloaded BIGINT DEFAULT 0,

  authenticated_via_myjkkn BOOLEAN NOT NULL DEFAULT true,  -- false = guest token
  is_emergency_open BOOLEAN NOT NULL DEFAULT false,        -- decision #17 failover

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_network_sessions_institution_started ON public.network_sessions(institution_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_sessions_user ON public.network_sessions(user_id, started_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_network_sessions_active ON public.network_sessions(institution_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_network_sessions_mac ON public.network_sessions(client_mac, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_sessions_router ON public.network_sessions(router_id, started_at DESC);
-- Teleport check: (institution, MAC) bounded on the partition key — one index probe, prunable.
CREATE INDEX IF NOT EXISTS idx_network_sessions_mac_created ON public.network_sessions(institution_id, client_mac, created_at DESC);

-- Initial partitions: this month + next two, plus a DEFAULT so an insert can
-- never fail on a month the cron has not created yet. Cron creates rolling.
CREATE TABLE IF NOT EXISTS public.network_sessions_2026_09 PARTITION OF public.network_sessions
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS public.network_sessions_2026_10 PARTITION OF public.network_sessions
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS public.network_sessions_2026_11 PARTITION OF public.network_sessions
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS public.network_sessions_default PARTITION OF public.network_sessions DEFAULT;

-- ----------------------------------------------------------------------------
-- Table: network_devices
-- Purpose: Tracks devices per person; enforces max-devices-per-role policy.
--          MAC is the natural key; role-bound caps live in platform_policies
--          (network.devices.max_per_role).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  client_mac TEXT NOT NULL,
  device_label TEXT,                     -- person-assigned: "My iPhone"
  device_type TEXT,                      -- 'phone','laptop','tablet','iot','other'

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_sessions INT NOT NULL DEFAULT 0,

  is_trusted BOOLEAN NOT NULL DEFAULT false,  -- one-tap login for repeat (decision #15)
  is_primary BOOLEAN NOT NULL DEFAULT false,  -- person's main device (auto-pin)
  is_iot_whitelisted BOOLEAN NOT NULL DEFAULT false,  -- decision #22 IoT MAC

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (institution_id, user_id, client_mac)
);

CREATE INDEX IF NOT EXISTS idx_network_devices_user ON public.network_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_network_devices_mac ON public.network_devices(institution_id, client_mac);
CREATE INDEX IF NOT EXISTS idx_network_devices_iot ON public.network_devices(institution_id, is_iot_whitelisted) WHERE is_iot_whitelisted = true;

CREATE TRIGGER set_network_devices_updated_at
  BEFORE UPDATE ON public.network_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_lockouts
-- Purpose: Failed-login lockout tracker (decision #5: 5 attempts → 30 min)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Lockouts can target a person OR MAC OR IP (whichever is failing)
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_mac TEXT,
  client_ip TEXT,

  failed_attempts INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  locked_until TIMESTAMPTZ,              -- NULL = not currently locked
  cleared_at TIMESTAMPTZ,                -- set when admin manually clears or window resets

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- moves on every counter bump / clear

  CHECK (user_id IS NOT NULL OR client_mac IS NOT NULL OR client_ip IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_network_lockouts_user_active ON public.network_lockouts(user_id, locked_until)
  WHERE locked_until IS NOT NULL AND cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_network_lockouts_mac_active ON public.network_lockouts(client_mac, locked_until)
  WHERE locked_until IS NOT NULL AND cleared_at IS NULL;

CREATE TRIGGER set_network_lockouts_updated_at
  BEFORE UPDATE ON public.network_lockouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_audit_log  (PARTITIONED by created_at)
-- Purpose: Append-only audit trail for ALL network actions. Read access is
--          network.audit.view (plus super/admin bypass). Forever retention via
--          partitioning.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,

  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL = system event
  actor_role TEXT,
  action TEXT NOT NULL,                  -- 'session_created','session_ended','user_kicked','user_banned','panic_open','iot_whitelisted','config_changed','router_health_changed', etc.
  target_type TEXT,                      -- 'session','user','device','router','config'
  target_id UUID,

  metadata JSONB,                        -- action-specific payload
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_network_audit_log_institution_created ON public.network_audit_log(institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_audit_log_actor ON public.network_audit_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_network_audit_log_action ON public.network_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_audit_log_target ON public.network_audit_log(target_type, target_id) WHERE target_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.network_audit_log_2026_09 PARTITION OF public.network_audit_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS public.network_audit_log_2026_10 PARTITION OF public.network_audit_log
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS public.network_audit_log_2026_11 PARTITION OF public.network_audit_log
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS public.network_audit_log_default PARTITION OF public.network_audit_log DEFAULT;

-- ============================================================================
-- BLOCK 3: FUNCTIONS / TRIGGERS
-- All seven are SECURITY DEFINER with a pinned search_path. Grants are in
-- BLOCK 3b, immediately after the definitions, in this same file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_network_create_monthly_partitions
-- Purpose: Run monthly via cron. Ensures the CURRENT month and the next 3
--          months of partitions exist for both network_sessions and
--          network_audit_log (a first run in a fresh environment covers today,
--          not only the future). Each partition it creates is born locked
--          (anon/PUBLIC revoked, RLS on) — the same treatment the hand-written
--          partitions above get in BLOCK 4.
--
--          DEFAULT-partition clash: both parents keep a DEFAULT partition so a
--          session insert can never fail on a missing month (the auth path
--          must not depend on cron). The cost: if the cron has missed a month
--          and rows for it already sit in the DEFAULT partition, PostgreSQL
--          refuses to attach that month's partition ("updated partition
--          constraint for default partition would be violated by some row").
--          Each month is therefore its own sub-transaction: a refused month is
--          RAISE WARNING'd (visible in the database log) and the loop
--          continues with the next month and the other parent, so one bad
--          month never stops partition creation. Recovery is an ops action:
--          move the stray rows out of the DEFAULT partition, then re-run.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_create_monthly_partitions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_month DATE;
  next_month DATE;
  partition_name TEXT;
  parent_table TEXT;
  parents TEXT[] := ARRAY['network_sessions', 'network_audit_log'];
  created_count INTEGER := 0;
BEGIN
  FOREACH parent_table IN ARRAY parents LOOP
    FOR i IN 0..3 LOOP
      target_month := date_trunc('month', NOW() + (i || ' months')::interval)::date;
      next_month := target_month + INTERVAL '1 month';
      partition_name := parent_table || '_' || to_char(target_month, 'YYYY_MM');

      IF NOT EXISTS (
        SELECT 1 FROM pg_class
         WHERE relname = partition_name
           AND relnamespace = 'public'::regnamespace
      ) THEN
        BEGIN
          EXECUTE format(
            'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
            partition_name, parent_table, target_month, next_month
          );
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC', partition_name);
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
          created_count := created_count + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'fn_network_create_monthly_partitions: could not create % (%): %',
            partition_name, SQLSTATE, SQLERRM;
        END;
      END IF;
    END LOOP;
  END LOOP;

  RETURN created_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_cleanup_pending_requests
-- Purpose: Sweep expired captive-portal pending rows (table born in this file).
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_cleanup_pending_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE
    FROM network_pending_requests
   WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_log_audit
-- Purpose: Single insert path for audit rows (used by all service calls).
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_log_audit(
  p_institution_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO network_audit_log (
    institution_id, actor_id, actor_role, action,
    target_type, target_id, metadata, ip_address, user_agent
  ) VALUES (
    p_institution_id, p_actor_id, p_actor_role, p_action,
    p_target_type, p_target_id, p_metadata, p_ip_address, p_user_agent
  )
  RETURNING id INTO audit_id;
  RETURN audit_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_record_failed_attempt
-- Purpose: Increment lockout counter; lock if threshold reached.
--          Reads network.lockout.max_attempts and network.lockout.duration_minutes
--          from platform_policies (institution override > global default).
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_record_failed_attempt(
  p_institution_id UUID,
  p_user_id UUID,
  p_client_mac TEXT,
  p_client_ip TEXT
)
RETURNS BOOLEAN  -- true = now locked
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_attempts INT;
  v_lockout_minutes INT;
  v_window_minutes INT := 30;  -- attempts within this window count toward threshold
  v_lockout_id UUID;
  v_attempts INT;
  v_now TIMESTAMPTZ := NOW();
  v_now_locked BOOLEAN := false;
BEGIN
  v_max_attempts    := fn_get_policy_int('network.lockout.max_attempts', 5, p_institution_id);
  v_lockout_minutes := fn_get_policy_int('network.lockout.duration_minutes', 30, p_institution_id);

  -- Find existing live lockout row (within window, not cleared)
  SELECT id, failed_attempts INTO v_lockout_id, v_attempts
    FROM network_lockouts
   WHERE institution_id = p_institution_id
     AND ((p_user_id IS NOT NULL AND user_id = p_user_id)
          OR (p_user_id IS NULL AND client_mac = p_client_mac))
     AND cleared_at IS NULL
     AND last_attempt_at > v_now - (v_window_minutes || ' minutes')::INTERVAL
   ORDER BY last_attempt_at DESC
   LIMIT 1;

  IF v_lockout_id IS NULL THEN
    INSERT INTO network_lockouts (institution_id, user_id, client_mac, client_ip, failed_attempts, first_attempt_at, last_attempt_at)
    VALUES (p_institution_id, p_user_id, p_client_mac, p_client_ip, 1, v_now, v_now);
    RETURN false;
  END IF;

  v_attempts := v_attempts + 1;

  IF v_attempts >= v_max_attempts THEN
    UPDATE network_lockouts
       SET failed_attempts = v_attempts,
           last_attempt_at = v_now,
           locked_until = v_now + (v_lockout_minutes || ' minutes')::INTERVAL
     WHERE id = v_lockout_id;
    v_now_locked := true;
  ELSE
    UPDATE network_lockouts
       SET failed_attempts = v_attempts,
           last_attempt_at = v_now
     WHERE id = v_lockout_id;
  END IF;

  RETURN v_now_locked;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_is_user_locked
-- Purpose: Check if a person/MAC is currently locked out (used at login gate).
--          Reachable by authenticated callers, so it authorizes: a signed-in
--          person may ask about themselves; anyone else needs
--          network.lockouts.manage in that institution (or super/admin).
--          service_role (the RADIUS path) is not subject to the check.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_is_user_locked(
  p_institution_id UUID,
  p_user_id UUID,
  p_client_mac TEXT
)
RETURNS TIMESTAMPTZ  -- returns locked_until if locked, else NULL
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  IF NOT (
       auth.role() = 'service_role'
    OR (p_user_id IS NOT NULL AND p_user_id = auth.uid())
    OR is_super_admin()
    OR is_admin()
    OR (user_has_permission('network.lockouts.manage') AND role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'fn_network_is_user_locked: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT locked_until INTO v_locked_until
    FROM network_lockouts
   WHERE institution_id = p_institution_id
     AND ((p_user_id IS NOT NULL AND user_id = p_user_id)
          OR (p_user_id IS NULL AND client_mac = p_client_mac))
     AND cleared_at IS NULL
     AND locked_until IS NOT NULL
     AND locked_until > NOW()
   ORDER BY locked_until DESC
   LIMIT 1;
  RETURN v_locked_until;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_register_device
-- Purpose: Register a device for a person; enforce max-devices-per-role from
--          platform_policies (network.devices.max_per_role, keyed by role_key).
--          Returns existing device row if MAC already registered.
--          Reachable by authenticated callers, so it authorizes: a signed-in
--          person may register their own devices only; registering for someone
--          else needs network.sessions.manage in that institution (or
--          super/admin). service_role (the RADIUS path) is not subject to it.
--
--          Role + institution are NOT taken from the caller unless the caller
--          is service_role: for everyone else they are read from `profiles`
--          for the device OWNER (p_user_id) — profiles.role is the primary
--          role_key (synced from user_roles by trigger) and
--          profiles.institution_id is the owner's own college. So a learner
--          cannot claim an admin cap, and cannot reset the count by naming
--          another institution. The p_user_role / p_institution_id arguments
--          are honoured only on the service_role path (the RADIUS route has
--          already looked the profile up) and are otherwise ignored.
--
--          Cap lookup: policy JSON ->> role_key, else JSON ->> '_default',
--          else 3.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_register_device(
  p_institution_id UUID,
  p_user_id UUID,
  p_user_role TEXT,
  p_client_mac TEXT,
  p_device_type TEXT DEFAULT NULL,
  p_device_label TEXT DEFAULT NULL
)
RETURNS UUID  -- network_devices.id; NULL if cap exceeded
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id UUID;
  v_max_devices INT;
  v_current_count INT;
  v_new_id UUID;
  v_institution_id UUID;
  v_role TEXT;
  v_caps JSONB;
BEGIN
  IF p_user_id IS NULL OR p_client_mac IS NULL THEN
    RAISE EXCEPTION 'fn_network_register_device: p_user_id and p_client_mac are required' USING ERRCODE = '22004';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_institution_id := p_institution_id;
    v_role := p_user_role;
  ELSE
    -- Trust the profile, never the caller.
    SELECT p.institution_id, p.role INTO v_institution_id, v_role
      FROM profiles p
     WHERE p.id = p_user_id;
    IF NOT FOUND OR v_institution_id IS NULL THEN
      RAISE EXCEPTION 'fn_network_register_device: no profile / institution for %', p_user_id USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT (
       auth.role() = 'service_role'
    OR p_user_id = auth.uid()
    OR is_super_admin()
    OR is_admin()
    OR (user_has_permission('network.sessions.manage') AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'fn_network_register_device: not authorized' USING ERRCODE = '42501';
  END IF;

  -- Already registered?
  SELECT id INTO v_existing_id
    FROM network_devices
   WHERE institution_id = v_institution_id
     AND user_id = p_user_id
     AND client_mac = p_client_mac;

  IF v_existing_id IS NOT NULL THEN
    UPDATE network_devices
       SET last_seen_at = NOW(),
           total_sessions = total_sessions + 1
     WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  -- Cap check: role_key entry, then '_default', then a safe literal.
  v_caps := fn_get_policy_json('network.devices.max_per_role', '{}'::jsonb, v_institution_id);
  v_max_devices := COALESCE(
    (v_caps ->> v_role)::INT,
    (v_caps ->> '_default')::INT,
    3
  );

  SELECT COUNT(*) INTO v_current_count
    FROM network_devices
   WHERE institution_id = v_institution_id AND user_id = p_user_id;

  IF v_current_count >= v_max_devices THEN
    RETURN NULL;  -- caller surfaces "device cap reached"
  END IF;

  INSERT INTO network_devices (institution_id, user_id, client_mac, device_type, device_label, total_sessions)
  VALUES (v_institution_id, p_user_id, p_client_mac, p_device_type, p_device_label, 1)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_detect_teleport
-- Purpose: Anomaly check (decision #23). Same MAC seen on two distant APs
--          within an impossible-movement window writes an audit row that the
--          alert worker forwards to the Director. Window comes from
--          platform_policies (network.alerts.teleport_window_seconds).
--
--          Cost on the auth path: ONE index probe. The lookup is bounded on
--          created_at (the partition key) to [NEW.created_at - window,
--          NEW.created_at], so the planner prunes to at most two monthly
--          partitions and idx_network_sessions_mac_created answers it; no
--          partition is scanned. The gap is compared as an absolute value, so
--          an out-of-order predecessor (backfill, clock skew) cannot raise a
--          false anomaly with a negative interval. It stays a trigger rather
--          than moving into fn_network_log_audit so that EVERY session insert
--          is checked, whichever code path writes it.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.fn_network_detect_teleport()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_ap TEXT;
  v_prev_started TIMESTAMPTZ;
  v_window_seconds INT;
  v_window INTERVAL;
BEGIN
  IF NEW.ap_mac IS NULL OR NEW.client_mac IS NULL THEN
    RETURN NEW;
  END IF;

  v_window_seconds := fn_get_policy_int('network.alerts.teleport_window_seconds', 60, NEW.institution_id);
  v_window := make_interval(secs => v_window_seconds);

  SELECT ap_mac, started_at INTO v_prev_ap, v_prev_started
    FROM network_sessions
   WHERE institution_id = NEW.institution_id
     AND client_mac = NEW.client_mac
     AND created_at >= NEW.created_at - v_window
     AND created_at <= NEW.created_at
     AND id != NEW.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_prev_ap IS NOT NULL
     AND v_prev_ap != NEW.ap_mac
     AND abs(EXTRACT(EPOCH FROM (NEW.started_at - v_prev_started))) < v_window_seconds THEN
    PERFORM fn_network_log_audit(
      NEW.institution_id,
      NEW.user_id,
      NEW.user_role,
      'anomaly_teleport_detected',
      'session',
      NEW.id,
      jsonb_build_object(
        'prev_ap', v_prev_ap,
        'new_ap', NEW.ap_mac,
        'gap_seconds', EXTRACT(EPOCH FROM (NEW.started_at - v_prev_started))
      ),
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_network_sessions_detect_teleport
  AFTER INSERT ON public.network_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_network_detect_teleport();

-- ============================================================================
-- BLOCK 3b: FUNCTION GRANTS (CLAUDE.md "Lock new RPCs from anon", 2026-06-06)
-- Supabase's default privileges hand anon AND authenticated a direct EXECUTE
-- on every new function; REVOKE FROM PUBLIC alone removes neither. Every
-- function is revoked from anon and PUBLIC here, the service-role-only ones
-- ALSO from authenticated (round 2: the scratch rehearsal reproduced the
-- default grant and showed a signed-in caller could otherwise run
-- fn_network_record_failed_attempt against anyone), then granted only to the
-- caller it serves:
--   service_role  — the RADIUS route / cron / server-side services only
--   authenticated — the two learner-reachable checks (each authorizes in-body)
--   (none)        — the trigger function; fired by the table, never called
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.fn_network_create_monthly_partitions() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_network_create_monthly_partitions() TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_network_cleanup_pending_requests() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_network_cleanup_pending_requests() TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_network_log_audit(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_network_log_audit(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_network_record_failed_attempt(UUID, UUID, TEXT, TEXT) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_network_record_failed_attempt(UUID, UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_network_is_user_locked(UUID, UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_network_is_user_locked(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_network_register_device(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_network_register_device(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Trigger function: revoke only. Fired by the AFTER INSERT trigger, never called.
REVOKE EXECUTE ON FUNCTION public.fn_network_detect_teleport() FROM anon, authenticated, PUBLIC;

-- ============================================================================
-- BLOCK 4: TABLE GRANTS + ROW-LEVEL SECURITY
-- Every relation born here (10 tables + 8 partitions) is revoked from anon and
-- PUBLIC and has RLS enabled. Partitions carry no policies: a query that names
-- a partition directly sees nothing; all reads go through the parent, whose
-- policies apply. Writes to the operational tables are service-role only
-- (no client INSERT/UPDATE/DELETE policies) unless stated. network_devices
-- additionally REVOKEs INSERT/UPDATE/DELETE from authenticated at the table
-- level (Supabase's default privileges grant ALL to authenticated on every new
-- table, and a FOR ALL self policy would otherwise let a person insert past the
-- cap or flip is_trusted / is_iot_whitelisted on their own rows).
--
-- Policy shape (CLAUDE.md standard):
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('<key>') AND role_has_institution_access(institution_id))
-- No role name appears in any policy. The captive page itself reads through
-- the service role, so no learner needs a cross-institution read of anything.
-- ============================================================================

REVOKE ALL ON TABLE public.network_auth_methods       FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_bandwidth_tiers    FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_block_reasons      FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_routers            FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_radius_servers     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_pending_requests   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_sessions           FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_sessions_2026_09   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_sessions_2026_10   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_sessions_2026_11   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_sessions_default   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_devices            FROM anon, PUBLIC;
-- Devices: authenticated keeps SELECT (self + admin policies below), may UPDATE
-- only device_label, may DELETE (own rows via policy). INSERT and every other
-- column are reachable only through fn_network_register_device / service_role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.network_devices FROM authenticated;
GRANT  UPDATE (device_label) ON TABLE public.network_devices TO authenticated;
GRANT  DELETE ON TABLE public.network_devices TO authenticated;
REVOKE ALL ON TABLE public.network_lockouts           FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_audit_log          FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_audit_log_2026_09  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_audit_log_2026_10  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_audit_log_2026_11  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.network_audit_log_default  FROM anon, PUBLIC;

ALTER TABLE public.network_sessions_2026_09  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_sessions_2026_10  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_sessions_2026_11  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_sessions_default  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_audit_log_2026_09 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_audit_log_2026_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_audit_log_2026_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_audit_log_default ENABLE ROW LEVEL SECURITY;

-- Master tables: network.view in that institution reads (the captive page reads
-- them through the service role, not as the learner); writes need
-- network.settings.manage in that institution.

ALTER TABLE public.network_auth_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_methods_select" ON public.network_auth_methods FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.view') AND role_has_institution_access(institution_id))
  );
CREATE POLICY "auth_methods_write" ON public.network_auth_methods FOR ALL
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.settings.manage') AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.settings.manage') AND role_has_institution_access(institution_id))
  );

ALTER TABLE public.network_bandwidth_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bandwidth_tiers_select" ON public.network_bandwidth_tiers FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.view') AND role_has_institution_access(institution_id))
  );
CREATE POLICY "bandwidth_tiers_write" ON public.network_bandwidth_tiers FOR ALL
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.settings.manage') AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.settings.manage') AND role_has_institution_access(institution_id))
  );

ALTER TABLE public.network_block_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_reasons_select" ON public.network_block_reasons FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.view') AND role_has_institution_access(institution_id))
  );
CREATE POLICY "block_reasons_write" ON public.network_block_reasons FOR ALL
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.settings.manage') AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.settings.manage') AND role_has_institution_access(institution_id))
  );

-- Routers: network.view reads the registry (a sessions screen needs router
-- names); network.routers.manage in that institution does everything.

ALTER TABLE public.network_routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routers_view_select" ON public.network_routers FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.view') AND role_has_institution_access(institution_id))
  );
CREATE POLICY "routers_admin_all" ON public.network_routers FOR ALL
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.routers.manage') AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.routers.manage') AND role_has_institution_access(institution_id))
  );

-- RADIUS servers: network.view reads, network.routers.manage writes. institution_id
-- is nullable (the JICATE-shared row): where it is set, the caller must also
-- hold access to that institution, so one college's router admin cannot edit
-- another college's dedicated RADIUS row (its auth endpoint, its pinned cert).
-- The shared (NULL) row is reachable by any network.routers.manage holder —
-- see "Assumptions for review" in the PR (Q3, VPS ownership, is open).

ALTER TABLE public.network_radius_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_servers_view_select" ON public.network_radius_servers FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.view')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );
CREATE POLICY "radius_servers_admin_all" ON public.network_radius_servers FOR ALL
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.routers.manage')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.routers.manage')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );

-- Pending requests: no client policies. Server-side route handlers use the
-- service role only.

ALTER TABLE public.network_pending_requests ENABLE ROW LEVEL SECURITY;

-- Sessions: a person sees their own sessions; network.sessions.view sees the
-- institution's. Writes only via service role.

ALTER TABLE public.network_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_self_select" ON public.network_sessions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "sessions_admin_select" ON public.network_sessions FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.sessions.view') AND role_has_institution_access(institution_id))
  );

-- Devices: a person sees, renames (device_label only — column-level grant
-- above) and removes their OWN rows; network.devices.view sees the
-- institution's. No client INSERT: registration is fn_network_register_device,
-- which enforces the per-role cap. is_trusted / is_iot_whitelisted / is_primary
-- are service-role-only columns.

ALTER TABLE public.network_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_self_select" ON public.network_devices FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "devices_self_update" ON public.network_devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "devices_self_delete" ON public.network_devices FOR DELETE
  USING (user_id = auth.uid());
CREATE POLICY "devices_admin_select" ON public.network_devices FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.devices.view') AND role_has_institution_access(institution_id))
  );

-- Lockouts: network.lockouts.manage in that institution.

ALTER TABLE public.network_lockouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lockouts_admin_all" ON public.network_lockouts FOR ALL
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.lockouts.manage') AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.lockouts.manage') AND role_has_institution_access(institution_id))
  );

-- Audit log: network.audit.view in that institution. Writes only via
-- service role / fn_network_log_audit.

ALTER TABLE public.network_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_view_select" ON public.network_audit_log FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('network.audit.view') AND role_has_institution_access(institution_id))
  );

-- ============================================================================
-- BLOCK 5: SEED DATA
-- Master rows for EVERY institution (INSERT … SELECT; never a hardcoded id),
-- one placeholder RADIUS server, and the tunables as platform_policies rows.
-- ============================================================================

-- Auth methods (5 system rows × every institution). Q1 (2026-09-06 00:20):
-- the learner signs in with Google via MyJKKN and never types a password, so
-- google_sso is the ONLY active method and comes first. The other four are
-- seeded is_active = false (catalogue rows an admin may switch on later);
-- 'biometric' is not seeded at all — no facial/fingerprint substrate exists.
INSERT INTO public.network_auth_methods (institution_id, code, display_name, description, icon_name, display_order, is_active, is_system)
SELECT i.id, m.code, m.display_name, m.description, m.icon_name, m.display_order, m.is_active, true
  FROM institutions i
 CROSS JOIN (VALUES
    ('google_sso',     'Sign in with Google',     'Use your Google account linked to MyJKKN',        'google',      10,  true),
    ('email_password', 'MyJKKN Email + Password', 'Sign in with your MyJKKN account',                'mail',        20,  false),
    ('microsoft_sso',  'Sign in with Microsoft',  'Use your Microsoft 365 account linked to MyJKKN', 'microsoft',   30,  false),
    ('rfid',           'RFID Card Tap',           'Tap your JKKN ID card on the reader',             'credit-card', 40,  false),
    ('guest_token',    'Guest Token',             'One-time code from reception desk',               'key',         100, false)
  ) AS m(code, display_name, description, icon_name, display_order, is_active)
ON CONFLICT (institution_id, code) DO NOTHING;

-- Bandwidth tiers (4 system rows × every institution)
INSERT INTO public.network_bandwidth_tiers (institution_id, code, display_name, attendance_min_pct, attendance_max_pct, download_mbps, upload_mbps, display_order, is_system)
SELECT i.id, t.code, t.display_name, t.min_pct, t.max_pct, t.down, t.up, t.display_order, true
  FROM institutions i
 CROSS JOIN (VALUES
    ('tier_a', 'Excellent (95%+)', 95.00, 100.00, 50, 25, 10),
    ('tier_b', 'Good (85-95%)',    85.00,  94.99, 20, 10, 20),
    ('tier_c', 'Fair (75-85%)',    75.00,  84.99, 10,  5, 30),
    ('tier_d', 'At Risk (<75%)',    0.00,  74.99,  5,  2, 40)
  ) AS t(code, display_name, min_pct, max_pct, down, up, display_order)
ON CONFLICT (institution_id, code) DO NOTHING;

-- Block reasons (5 system rows × every institution)
INSERT INTO public.network_block_reasons (institution_id, code, display_name, description, severity, is_user_visible, is_system)
SELECT i.id, r.code, r.display_name, r.description, r.severity, true, true
  FROM institutions i
 CROSS JOIN (VALUES
    ('fee_overdue',       'Fee Payment Overdue',      'Wi-Fi access suspended until fees are cleared. Contact the accounts office.', 'critical'),
    ('lockout_threshold', 'Too Many Failed Attempts', 'Account temporarily locked. Try again after 30 minutes.',                     'warning'),
    ('session_expired',   'Session Expired',          'Your session has timed out. Please sign in again.',                            'info'),
    ('terminated_user',   'Account Inactive',         'Your account is no longer active. Contact administration.',                    'critical'),
    ('security_incident', 'Security Block',           'Network access blocked. Contact the IT helpdesk.',                             'critical')
  ) AS r(code, display_name, description, severity)
ON CONFLICT (institution_id, code) DO NOTHING;

-- RADIUS server registry (1 row to start: the JICATE-shared VPS placeholder).
-- IPv4 + tls_cert_fingerprint are filled in once the VPS is provisioned (Part 5).
INSERT INTO public.network_radius_servers (institution_id, display_name, hostname, auth_port, acct_port, coa_port, protocol, myjkkn_auth_endpoint, is_active, is_primary, notes)
VALUES
  (NULL, 'JICATE Shared RADIUS (placeholder)', 'radius.jkkn.ai', 2083, 2083, 3799, 'radsec',
   'https://www.jkkn.ai/api/network/radius-auth', true, true,
   'Awaiting VPS provisioning (Hetzner CCX13). Update ipv4_address and tls_cert_fingerprint once provisioned. See Smoke-Test-RADIUS-2026-05-09 for substrate proof.')
ON CONFLICT (hostname, auth_port) DO NOTHING;

-- Tunables → platform_policies (global defaults; an institution-scoped row
-- overrides any of them later without a deploy). The unique index on
-- platform_policies is an expression index (COALESCE(scope_id, …)), which
-- ON CONFLICT cannot name — so each row guards itself with WHERE NOT EXISTS.
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system)
SELECT s.policy_key, 'global', NULL, s.value::jsonb, s.description, s.data_type, true
  FROM (VALUES
    ('network.lockout.max_attempts',        '5',     'Wi-Fi: failed sign-ins before lockout',                                                          'number'),
    ('network.lockout.duration_minutes',    '30',    'Wi-Fi: how long a lockout lasts (minutes)',                                                      'number'),
    -- Both maps are keyed on custom_roles.role_key (student = learner,
    -- faculty = Senior Learner, admin / administrator / system_admin = admin,
    -- warden / chief_warden / gate_security = persistent). '_default' is the
    -- documented fallback for any role_key not listed; readers fall back to
    -- '_default', then to a safe literal.
    ('network.session.length_hours.by_role',
       '{"_default":8,"student":8,"faculty":24,"admin":4,"administrator":4,"system_admin":4,"warden":0,"chief_warden":0,"gate_security":0}',
       'Wi-Fi: hours before each role_key must sign in again; 0 = persistent session; _default applies to role_keys not listed',   'object'),
    ('network.devices.max_per_role',
       '{"_default":3,"student":3,"faculty":10,"admin":15,"administrator":15,"system_admin":15}',
       'Wi-Fi: registered devices allowed per person, by role_key; _default applies to role_keys not listed',                    'object'),
    ('network.guest.token_expiry_hours',    '24',    'Wi-Fi: how long a reception-issued guest token stays valid (hours)',                             'number'),
    ('network.failover.auto_open_enabled',  'true',  'Wi-Fi: open the network automatically when MyJKKN is unreachable (decision #17)',                'boolean'),
    ('network.consent.dpdpa_required',      'true',  'Wi-Fi: show the DPDPA consent screen on first sign-in',                                          'boolean'),
    ('network.portal.languages_enabled',    '["ta","en"]', 'Wi-Fi: languages offered on the captive portal',                                            'array'),
    ('network.session.idle_timeout_minutes','30',    'Wi-Fi: end a session after this many idle minutes',                                              'number'),
    ('network.alerts.teleport_window_seconds','60',  'Wi-Fi: same MAC on a different access point within this window flags an anomaly',               'number'),
    ('network.alerts.failed_login_spike',   '20',    'Wi-Fi: failed sign-ins per minute that raises a Director alert',                                 'number'),
    ('network.retention.archive_after_days','365',   'Wi-Fi: sessions older than this are archived to cold partitions',                                'number'),
    ('network.radius.coa_on_fee_change',    'true',  'Wi-Fi: send a RADIUS Change-of-Authorization (RFC 5176) when fee status changes',                'boolean'),
    ('network.emergency_open',              'false', 'Wi-Fi: panic switch — network is open without sign-in; institution rows may override',           'boolean')
  ) AS s(policy_key, value, description, data_type)
 WHERE NOT EXISTS (
   SELECT 1 FROM platform_policies p
    WHERE p.policy_key = s.policy_key AND p.scope_type = 'global' AND p.scope_id IS NULL
 );

-- ============================================================================
-- BLOCK 6: pg_cron (NOT executed here — enable after the Director's apply,
-- repo style: commented schedules)
-- ============================================================================
-- SELECT cron.schedule('network-cleanup-pending-requests', '*/5 * * * *', 'SELECT public.fn_network_cleanup_pending_requests();');
-- SELECT cron.schedule('network-create-monthly-partitions', '0 3 25 * *', 'SELECT public.fn_network_create_monthly_partitions();');

-- ============================================================================
-- TABLE / FUNCTION COMMENTS (self-documentation for downstream PRs)
-- ============================================================================

COMMENT ON TABLE public.network_auth_methods       IS 'Per-institution catalog of authentication methods displayed on the captive portal';
COMMENT ON TABLE public.network_bandwidth_tiers    IS 'Attendance-driven bandwidth tiers applied at session start';
COMMENT ON TABLE public.network_block_reasons      IS 'Catalog of reasons a person can be blocked; surfaces plain-language messaging on the portal';
COMMENT ON TABLE public.network_routers            IS 'Registry of MikroTik routers per institution. radius_shared_secret_ref references a vault entry; routers RADIUS-auth via the linked network_radius_servers row.';
COMMENT ON TABLE public.network_radius_servers     IS 'Registry of FreeRADIUS endpoints (typically JICATE-shared VPSes) that terminate RADIUS/RADSEC from routers and proxy auth decisions to the MyJKKN HTTP API.';
COMMENT ON TABLE public.network_pending_requests   IS 'Short-lived (10 min TTL) context for the Google-via-MyJKKN OAuth subflow (Q1, 2026-09-06): hotspot → /api/network/sso → OAuth → back to the hotspot login URL.';
COMMENT ON TABLE public.network_sessions           IS 'Active and historical Wi-Fi sessions, partitioned monthly by created_at. Forever retention; cold partitions archived offline.';
COMMENT ON TABLE public.network_devices            IS 'Per-person device registration; enforces the max-devices-per-role policy from platform_policies (network.devices.max_per_role).';
COMMENT ON TABLE public.network_lockouts           IS 'Failed-attempt lockout state. Defaults: 5 attempts in 30 min → 30 min lockout (platform_policies network.lockout.*).';
COMMENT ON TABLE public.network_audit_log          IS 'Append-only audit trail. Read via network.audit.view (super/admin bypass). Partitioned monthly.';

COMMENT ON FUNCTION public.fn_network_create_monthly_partitions IS 'Create partitions for the current month + 3 ahead (born locked: anon revoked, RLS on); a month refused by the DEFAULT partition is WARNed and skipped. Schedule via pg_cron monthly.';
COMMENT ON FUNCTION public.fn_network_cleanup_pending_requests  IS 'Delete expired pending captive-portal rows. Schedule every 5 minutes via pg_cron.';
COMMENT ON FUNCTION public.fn_network_log_audit                 IS 'Single insert path for network_audit_log. service_role only; use from server-side code.';
COMMENT ON FUNCTION public.fn_network_record_failed_attempt     IS 'Increment failed-login counter and lock when the policy threshold is reached. Returns true if now locked. service_role only.';
COMMENT ON FUNCTION public.fn_network_is_user_locked            IS 'Returns locked_until if the person/MAC is currently locked, else NULL. Self, network.lockouts.manage, super/admin, or service_role.';
COMMENT ON FUNCTION public.fn_network_register_device           IS 'Register or update a device for a person. Enforces the per-role_key max-devices policy; role + institution come from the owner''s profile unless the caller is service_role. Returns NULL if cap exceeded. Self, network.sessions.manage, super/admin, or service_role.';
COMMENT ON FUNCTION public.fn_network_detect_teleport           IS 'Trigger function — flags impossible-movement anomalies when the same MAC is seen on different APs within the policy window.';
