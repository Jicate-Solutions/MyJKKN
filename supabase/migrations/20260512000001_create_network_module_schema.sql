-- ============================================================================
-- Network Module Schema (Captive Portal SSO + MikroTik Integration)
-- Created: 2026-05-12
-- Purpose: Foundation tables for MyJKKN-MikroTik captive portal SSO module.
--          Mirrors the SAML SSO pattern (saml_pending_requests + saml_sessions)
--          extended with multi-tenant institution_id scoping and per-institution
--          configuration so the same schema serves JKKN and future JICATE
--          customers without DDL changes.
--
-- Director-locked decisions (Spec-Decisions-Locked-2026-05-08):
--   - Multi-tenant from Day 1 (every table has institution_id)
--   - Mirror SAML pattern, do not invent
--   - 95% MyJKKN-auth target / 90 days; <40% kill threshold
--   - Forever retention (1 yr active + monthly partition archive)
--   - 5/30-min lockout, role-based session length & device caps
--   - Tamil + English captive portal, DPDPA consent first-login
--   - Director + super_admin only for audit log
-- ============================================================================

-- ============================================================================
-- BLOCK 1: MASTER TABLES (CRUDable per institution; seeded with system rows)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: network_auth_methods
-- Purpose: Authentication methods accepted by captive portal (per institution)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_auth_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  code TEXT NOT NULL,                    -- machine key: 'email_password','rfid','google_sso','microsoft_sso','guest_token','biometric'
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

CREATE INDEX idx_network_auth_methods_institution ON network_auth_methods(institution_id);
CREATE INDEX idx_network_auth_methods_active ON network_auth_methods(institution_id, is_active) WHERE is_active = true;

CREATE TRIGGER set_network_auth_methods_updated_at
  BEFORE UPDATE ON network_auth_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_bandwidth_tiers
-- Purpose: Attendance-based bandwidth tiers (Director decision #7)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_bandwidth_tiers (
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

CREATE INDEX idx_network_bandwidth_tiers_institution ON network_bandwidth_tiers(institution_id);

CREATE TRIGGER set_network_bandwidth_tiers_updated_at
  BEFORE UPDATE ON network_bandwidth_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_block_reasons
-- Purpose: Catalog of reasons a user can be blocked from network
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_block_reasons (
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

CREATE INDEX idx_network_block_reasons_institution ON network_block_reasons(institution_id);

CREATE TRIGGER set_network_block_reasons_updated_at
  BEFORE UPDATE ON network_block_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BLOCK 2: OPERATIONAL TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: network_routers
-- Purpose: Registry of MikroTik routers per institution
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,

  hostname TEXT NOT NULL,
  description TEXT,
  model TEXT,                            -- 'CCR2116-12G-4S+'
  routeros_version TEXT,
  serial_number TEXT,

  -- RADIUS configuration (architecture pivot 2026-05-09; see Spec-Decisions-Locked decision #25)
  -- Each MikroTik points at exactly ONE network_radius_servers row, sending RADIUS over TLS (RADSEC).
  radius_server_id UUID,                       -- FK set after network_radius_servers is created (deferred constraint below)
  radius_shared_secret_ref TEXT NOT NULL,      -- vault/secret-store reference; never plaintext
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

CREATE INDEX idx_network_routers_institution ON network_routers(institution_id);
CREATE INDEX idx_network_routers_active ON network_routers(institution_id, is_active) WHERE is_active = true;

CREATE TRIGGER set_network_routers_updated_at
  BEFORE UPDATE ON network_routers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_radius_servers
-- Purpose: Registry of FreeRADIUS endpoints that terminate RADIUS/RADSEC from
--          MikroTik routers and proxy auth decisions to MyJKKN's HTTP API.
--          Architecture pivot 2026-05-09 (see Spec-Decisions-Locked decision #25).
--          One JICATE-managed VPS serves all customer routers as multi-tenant
--          RADIUS termination — clients.conf entries on the VPS map each
--          router to its institution_id via NAS-Identifier.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_radius_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- This is the JICATE-managed shared infra; institution_id is nullable for the
  -- shared row, OR set to the institution that owns a dedicated RADIUS box.
  institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,

  display_name TEXT NOT NULL,                  -- 'JICATE Shared RADIUS (Hetzner FRA)'
  hostname TEXT NOT NULL,                      -- 'radius.myjkkn.ai'
  ipv4_address TEXT,                           -- DNS preferred, but pinned for clients.conf
  auth_port INT NOT NULL DEFAULT 2083,         -- RADSEC default
  acct_port INT NOT NULL DEFAULT 2083,         -- accounting on same port for RADSEC
  coa_port INT NOT NULL DEFAULT 3799,          -- RFC 5176 dynamic auth

  protocol TEXT NOT NULL DEFAULT 'radsec' CHECK (protocol IN ('radsec', 'radius_udp')),
  tls_cert_fingerprint TEXT,                   -- pinned cert SHA-256 for RouterOS to verify

  -- Where this RADIUS server proxies auth decisions
  myjkkn_auth_endpoint TEXT NOT NULL,          -- 'https://myjkkn.ai/api/network/radius-auth'
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

CREATE INDEX idx_network_radius_servers_active ON network_radius_servers(is_active) WHERE is_active = true;

CREATE TRIGGER set_network_radius_servers_updated_at
  BEFORE UPDATE ON network_radius_servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now that the table exists, link network_routers.radius_server_id to it.
ALTER TABLE network_routers
  ADD CONSTRAINT fk_network_routers_radius_server
  FOREIGN KEY (radius_server_id) REFERENCES network_radius_servers(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- Table: network_pending_requests
-- Purpose: Captures captive-portal context across MyJKKN auth round-trip.
--          PRIMARY auth path (RADIUS) does NOT use this table — it's only
--          needed for the OAuth subflow (Google/Microsoft sign-in), where
--          users round-trip through MyJKKN's web auth before MikroTik
--          completes the hotspot login. For username+password auth, RADIUS
--          is single-round-trip and this table is bypassed entirely.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_pending_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES network_routers(id) ON DELETE CASCADE,

  -- Captive portal request context (captured from MikroTik redirect URL)
  client_mac TEXT NOT NULL,              -- 'AA:BB:CC:DD:EE:FF'
  client_ip TEXT,
  ap_mac TEXT,                           -- access point MAC (for room mapping)
  ssid TEXT,
  rssi INT,                              -- signal strength
  redirect_url TEXT,                     -- where user wanted to go before captive

  -- Request fingerprint
  user_agent TEXT,
  device_hint TEXT,                      -- 'mobile','tablet','laptop' from UA parse

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  consumed_at TIMESTAMPTZ                -- set on resume; row deleted by handler
);

CREATE INDEX idx_network_pending_requests_expires ON network_pending_requests(expires_at);
CREATE INDEX idx_network_pending_requests_mac ON network_pending_requests(institution_id, client_mac);

ALTER TABLE network_pending_requests ENABLE ROW LEVEL SECURITY;
-- No client policies: server-side route handlers use service role only.

-- ----------------------------------------------------------------------------
-- Table: network_sessions  (PARTITIONED by created_at for forever-retention)
-- Purpose: Active and historical WiFi sessions. Partitioned monthly so the
--          live table stays fast and old partitions can be archived to cold
--          storage without affecting current queries.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES network_routers(id) ON DELETE RESTRICT,

  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL for guest sessions
  user_role TEXT,                        -- frozen at session start
  auth_method_code TEXT NOT NULL,        -- references network_auth_methods.code

  client_mac TEXT NOT NULL,
  client_ip TEXT,
  ap_mac TEXT,
  ssid TEXT,
  device_label TEXT,                     -- user-assigned name from device-list page

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

CREATE INDEX idx_network_sessions_institution_started ON network_sessions(institution_id, started_at DESC);
CREATE INDEX idx_network_sessions_user ON network_sessions(user_id, started_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_network_sessions_active ON network_sessions(institution_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX idx_network_sessions_mac ON network_sessions(client_mac, started_at DESC);
CREATE INDEX idx_network_sessions_router ON network_sessions(router_id, started_at DESC);

-- Initial partitions: current month + next two months. Cron creates rolling.
CREATE TABLE network_sessions_2026_05 PARTITION OF network_sessions
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE network_sessions_2026_06 PARTITION OF network_sessions
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE network_sessions_2026_07 PARTITION OF network_sessions
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- ----------------------------------------------------------------------------
-- Table: network_devices
-- Purpose: Tracks devices per user; enforces max-devices-per-role policy.
--          MAC is the natural key; role-bound caps live in network_module_config.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  client_mac TEXT NOT NULL,
  device_label TEXT,                     -- user-assigned: "My iPhone"
  device_type TEXT,                      -- 'phone','laptop','tablet','iot','other'

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_sessions INT NOT NULL DEFAULT 0,

  is_trusted BOOLEAN NOT NULL DEFAULT false,  -- one-tap login for repeat (decision #15)
  is_primary BOOLEAN NOT NULL DEFAULT false,  -- user's main device (auto-pin)
  is_iot_whitelisted BOOLEAN NOT NULL DEFAULT false,  -- decision #22 IoT MAC

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (institution_id, user_id, client_mac)
);

CREATE INDEX idx_network_devices_user ON network_devices(user_id);
CREATE INDEX idx_network_devices_mac ON network_devices(institution_id, client_mac);
CREATE INDEX idx_network_devices_iot ON network_devices(institution_id, is_iot_whitelisted) WHERE is_iot_whitelisted = true;

CREATE TRIGGER set_network_devices_updated_at
  BEFORE UPDATE ON network_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Table: network_lockouts
-- Purpose: Failed-login lockout tracker (decision #5: 5 attempts → 30 min)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Lockouts can target user OR MAC OR IP (whichever is failing)
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_mac TEXT,
  client_ip TEXT,

  failed_attempts INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  locked_until TIMESTAMPTZ,              -- NULL = not currently locked
  cleared_at TIMESTAMPTZ,                -- set when admin manually clears or window resets

  CHECK (user_id IS NOT NULL OR client_mac IS NOT NULL OR client_ip IS NOT NULL)
);

CREATE INDEX idx_network_lockouts_user_active ON network_lockouts(user_id, locked_until)
  WHERE locked_until IS NOT NULL AND cleared_at IS NULL;
CREATE INDEX idx_network_lockouts_mac_active ON network_lockouts(client_mac, locked_until)
  WHERE locked_until IS NOT NULL AND cleared_at IS NULL;

-- ----------------------------------------------------------------------------
-- Table: network_audit_log  (PARTITIONED by created_at)
-- Purpose: Append-only audit trail for ALL network actions. Director + super_admin
--          read access only (decision #18). Forever retention via partitioning.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_audit_log (
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

CREATE INDEX idx_network_audit_log_institution_created ON network_audit_log(institution_id, created_at DESC);
CREATE INDEX idx_network_audit_log_actor ON network_audit_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_network_audit_log_action ON network_audit_log(action, created_at DESC);
CREATE INDEX idx_network_audit_log_target ON network_audit_log(target_type, target_id) WHERE target_id IS NOT NULL;

CREATE TABLE network_audit_log_2026_05 PARTITION OF network_audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE network_audit_log_2026_06 PARTITION OF network_audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE network_audit_log_2026_07 PARTITION OF network_audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- ----------------------------------------------------------------------------
-- Table: network_module_config
-- Purpose: Per-institution tunables. Q3 config-table principle: anything a
--          super_admin might tweak without a deploy lives here.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS network_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  config_key TEXT NOT NULL,              -- 'lockout.max_attempts', 'session.length.learner_hours', 'devices.max.learner', etc.
  display_name TEXT NOT NULL,
  description TEXT,
  config_value JSONB NOT NULL,           -- typed payload: {"value": 5} or {"by_role": {"learner": 8, "admin": 4}}
  value_type TEXT NOT NULL CHECK (value_type IN ('integer','number','string','boolean','json','duration_minutes','duration_hours')),
  default_value JSONB,                   -- baseline if institution wants to reset
  category TEXT,                         -- 'auth','session','bandwidth','privacy','alerts','failover'

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (institution_id, config_key)
);

CREATE INDEX idx_network_module_config_institution ON network_module_config(institution_id);
CREATE INDEX idx_network_module_config_category ON network_module_config(institution_id, category);

CREATE TRIGGER set_network_module_config_updated_at
  BEFORE UPDATE ON network_module_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BLOCK 3: FUNCTIONS / TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_network_create_monthly_partitions
-- Purpose: Run monthly via cron. Ensures next 2 months of partitions exist
--          for both network_sessions and network_audit_log.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_create_monthly_partitions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
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
    FOR i IN 1..3 LOOP
      target_month := date_trunc('month', NOW() + (i || ' months')::interval)::date;
      next_month := target_month + INTERVAL '1 month';
      partition_name := parent_table || '_' || to_char(target_month, 'YYYY_MM');

      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
          partition_name, parent_table, target_month, next_month
        );
        created_count := created_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN created_count;
END;
$$;

COMMENT ON FUNCTION fn_network_create_monthly_partitions IS
  'Create rolling monthly partitions for network_sessions and network_audit_log. Run via pg_cron monthly.';

-- ----------------------------------------------------------------------------
-- fn_network_cleanup_pending_requests
-- Purpose: Sweep expired captive-portal pending rows.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_cleanup_pending_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM network_pending_requests WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_log_audit
-- Purpose: Single insert path for audit rows (used by all service calls).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_log_audit(
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
--          Reads max_attempts and lockout_minutes from network_module_config.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_record_failed_attempt(
  p_institution_id UUID,
  p_user_id UUID,
  p_client_mac TEXT,
  p_client_ip TEXT
)
RETURNS BOOLEAN  -- true = now locked
LANGUAGE plpgsql
SECURITY DEFINER
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
  SELECT (config_value->>'value')::INT INTO v_max_attempts
    FROM network_module_config
   WHERE institution_id = p_institution_id AND config_key = 'lockout.max_attempts' AND is_active = true;
  v_max_attempts := COALESCE(v_max_attempts, 5);

  SELECT (config_value->>'value')::INT INTO v_lockout_minutes
    FROM network_module_config
   WHERE institution_id = p_institution_id AND config_key = 'lockout.duration_minutes' AND is_active = true;
  v_lockout_minutes := COALESCE(v_lockout_minutes, 30);

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
-- Purpose: Check if user/MAC is currently locked out (used at login gate)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_is_user_locked(
  p_institution_id UUID,
  p_user_id UUID,
  p_client_mac TEXT
)
RETURNS TIMESTAMPTZ  -- returns locked_until if locked, else NULL
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
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
-- Purpose: Register device for user; enforce max-devices-per-role.
--          Returns existing device row if MAC already registered.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_register_device(
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
AS $$
DECLARE
  v_existing_id UUID;
  v_max_devices INT;
  v_current_count INT;
  v_new_id UUID;
BEGIN
  -- Already registered?
  SELECT id INTO v_existing_id
    FROM network_devices
   WHERE institution_id = p_institution_id
     AND user_id = p_user_id
     AND client_mac = p_client_mac;

  IF v_existing_id IS NOT NULL THEN
    UPDATE network_devices
       SET last_seen_at = NOW(),
           total_sessions = total_sessions + 1
     WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  -- Cap check
  SELECT (config_value->'by_role'->>p_user_role)::INT INTO v_max_devices
    FROM network_module_config
   WHERE institution_id = p_institution_id AND config_key = 'devices.max_per_user' AND is_active = true;
  v_max_devices := COALESCE(v_max_devices, 3);

  SELECT COUNT(*) INTO v_current_count
    FROM network_devices
   WHERE institution_id = p_institution_id AND user_id = p_user_id;

  IF v_current_count >= v_max_devices THEN
    RETURN NULL;  -- caller surfaces "device cap reached" to user
  END IF;

  INSERT INTO network_devices (institution_id, user_id, client_mac, device_type, device_label, total_sessions)
  VALUES (p_institution_id, p_user_id, p_client_mac, p_device_type, p_device_label, 1)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- fn_network_detect_teleport
-- Purpose: Anomaly check (decision #23). Same MAC seen on two distant APs
--          within an impossible-movement window writes an audit row that the
--          alert worker forwards to Director WhatsApp.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_network_detect_teleport()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_ap TEXT;
  v_prev_started TIMESTAMPTZ;
  v_window_seconds INT := 60;  -- if same MAC on different AP within 60s, flag
BEGIN
  IF NEW.ap_mac IS NULL OR NEW.client_mac IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ap_mac, started_at INTO v_prev_ap, v_prev_started
    FROM network_sessions
   WHERE institution_id = NEW.institution_id
     AND client_mac = NEW.client_mac
     AND id != NEW.id
   ORDER BY started_at DESC
   LIMIT 1;

  IF v_prev_ap IS NOT NULL
     AND v_prev_ap != NEW.ap_mac
     AND NEW.started_at - v_prev_started < (v_window_seconds || ' seconds')::INTERVAL THEN
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
  AFTER INSERT ON network_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_network_detect_teleport();

-- ============================================================================
-- BLOCK 4: ROW-LEVEL SECURITY
-- ============================================================================

-- Master tables: read-anyone authenticated, write super_admin/director only

ALTER TABLE network_auth_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_methods_select" ON network_auth_methods FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_methods_write" ON network_auth_methods FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

ALTER TABLE network_bandwidth_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bandwidth_tiers_select" ON network_bandwidth_tiers FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "bandwidth_tiers_write" ON network_bandwidth_tiers FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

ALTER TABLE network_block_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_reasons_select" ON network_block_reasons FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "block_reasons_write" ON network_block_reasons FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

-- Routers: super_admin/director/administrator only

ALTER TABLE network_routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routers_admin_all" ON network_routers FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

ALTER TABLE network_radius_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_servers_admin_all" ON network_radius_servers FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

-- Sessions: user sees own sessions; admins see all in their institution

ALTER TABLE network_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_self_select" ON network_sessions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "sessions_admin_select" ON network_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator','principal','warden')));
-- Writes only via service role (no client INSERT/UPDATE/DELETE policies)

-- Devices: user sees own devices; admins see all in their institution

ALTER TABLE network_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_self_all" ON network_devices FOR ALL
  USING (user_id = auth.uid());
CREATE POLICY "devices_admin_select" ON network_devices FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

-- Lockouts: admin-only visibility

ALTER TABLE network_lockouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lockouts_admin_all" ON network_lockouts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

-- Audit log: Director + super_admin ONLY (decision #18)

ALTER TABLE network_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_director_select" ON network_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director')));
-- Writes only via service role / SECURITY DEFINER functions

-- Module config: admin-only

ALTER TABLE network_module_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_admin_all" ON network_module_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin','director','administrator')));

-- ============================================================================
-- BLOCK 5: SEED DATA (JKKN = institution_id = (first row of institutions))
-- ============================================================================

DO $$
DECLARE
  v_jkkn_id UUID;
BEGIN
  -- Resolve JKKN institution. Adjust the WHERE clause if a different code is canonical.
  SELECT id INTO v_jkkn_id FROM institutions ORDER BY created_at ASC LIMIT 1;

  IF v_jkkn_id IS NULL THEN
    RAISE NOTICE 'No institutions found; skipping network seed. Run seed manually after first institution exists.';
    RETURN;
  END IF;

  -- Auth methods (6 system rows)
  INSERT INTO network_auth_methods (institution_id, code, display_name, description, icon_name, display_order, is_system) VALUES
    (v_jkkn_id, 'email_password', 'MyJKKN Email + Password', 'Sign in with your MyJKKN account', 'mail', 10, true),
    (v_jkkn_id, 'google_sso', 'Sign in with Google', 'Use your Google account linked to MyJKKN', 'google', 20, true),
    (v_jkkn_id, 'microsoft_sso', 'Sign in with Microsoft', 'Use your Microsoft 365 account linked to MyJKKN', 'microsoft', 30, true),
    (v_jkkn_id, 'rfid', 'RFID Card Tap', 'Tap your JKKN ID card on the reader', 'credit-card', 40, true),
    (v_jkkn_id, 'biometric', 'Biometric (Mobile)', 'Face/fingerprint via mobile device', 'fingerprint', 50, true),
    (v_jkkn_id, 'guest_token', 'Guest Token', 'One-time code from reception desk', 'key', 100, true)
  ON CONFLICT (institution_id, code) DO NOTHING;

  -- Bandwidth tiers (4 system rows)
  INSERT INTO network_bandwidth_tiers (institution_id, code, display_name, attendance_min_pct, attendance_max_pct, download_mbps, upload_mbps, display_order, is_system) VALUES
    (v_jkkn_id, 'tier_a', 'Excellent (95%+)',  95.00, 100.00, 50, 25, 10, true),
    (v_jkkn_id, 'tier_b', 'Good (85-95%)',     85.00,  94.99, 20, 10, 20, true),
    (v_jkkn_id, 'tier_c', 'Fair (75-85%)',     75.00,  84.99, 10,  5, 30, true),
    (v_jkkn_id, 'tier_d', 'At Risk (<75%)',     0.00,  74.99,  5,  2, 40, true)
  ON CONFLICT (institution_id, code) DO NOTHING;

  -- Block reasons (5 system rows)
  INSERT INTO network_block_reasons (institution_id, code, display_name, description, severity, is_user_visible, is_system) VALUES
    (v_jkkn_id, 'fee_overdue',         'Fee Payment Overdue',     'WiFi access suspended until fees are cleared. Contact accounts office.', 'critical', true, true),
    (v_jkkn_id, 'lockout_threshold',   'Too Many Failed Attempts','Account temporarily locked. Try again after 30 minutes.',                'warning',  true, true),
    (v_jkkn_id, 'session_expired',     'Session Expired',         'Your session has timed out. Please sign in again.',                       'info',     true, true),
    (v_jkkn_id, 'terminated_user',     'Account Inactive',        'Your account is no longer active. Contact administration.',               'critical', true, true),
    (v_jkkn_id, 'security_incident',   'Security Block',          'Network access blocked. Contact IT helpdesk.',                            'critical', true, true)
  ON CONFLICT (institution_id, code) DO NOTHING;

  -- RADIUS server registry (1 row to start: the JICATE-shared VPS)
  -- IPv4 + tls_cert_fingerprint will be filled in once VPS is provisioned.
  INSERT INTO network_radius_servers (institution_id, display_name, hostname, auth_port, acct_port, coa_port, protocol, myjkkn_auth_endpoint, is_active, is_primary, notes) VALUES
    (NULL, 'JICATE Shared RADIUS (placeholder)', 'radius.myjkkn.ai', 2083, 2083, 3799, 'radsec', 'https://myjkkn.ai/api/network/radius-auth', true, true,
     'Awaiting VPS provisioning (Hetzner CCX13). Update ipv4_address and tls_cert_fingerprint once provisioned. See Smoke-Test-RADIUS-2026-05-09 for substrate proof.')
  ON CONFLICT (hostname, auth_port) DO NOTHING;

  -- Module config (13 tunables)
  INSERT INTO network_module_config (institution_id, config_key, display_name, description, config_value, value_type, default_value, category) VALUES
    (v_jkkn_id, 'lockout.max_attempts',          'Lockout: Max Failed Attempts',     'Failed logins before lockout',                              '{"value": 5}'::jsonb,  'integer',          '{"value": 5}'::jsonb,  'auth'),
    (v_jkkn_id, 'lockout.duration_minutes',      'Lockout: Duration (minutes)',      'How long the user stays locked out',                        '{"value": 30}'::jsonb, 'duration_minutes', '{"value": 30}'::jsonb, 'auth'),
    (v_jkkn_id, 'session.length.by_role',        'Session Length by Role (hours)',   'How often each role must re-authenticate',                  '{"by_role": {"learner": 8, "senior_learner": 24, "administrator": 4, "director": 4, "warden": 168, "security": 168}}'::jsonb, 'json', '{"by_role": {"learner": 8, "senior_learner": 24, "administrator": 4, "director": 4, "warden": 168, "security": 168}}'::jsonb, 'session'),
    (v_jkkn_id, 'devices.max_per_user',          'Max Devices per User by Role',     'Concurrent registered MACs per user',                       '{"by_role": {"learner": 3, "senior_learner": 10, "administrator": 15, "director": 15, "warden": 5, "security": 5}}'::jsonb, 'json', '{"by_role": {"learner": 3, "senior_learner": 10, "administrator": 15, "director": 15, "warden": 5, "security": 5}}'::jsonb, 'auth'),
    (v_jkkn_id, 'guest.token_expiry_hours',      'Guest Token Expiry (hours)',       'How long a reception-issued guest token remains valid',     '{"value": 24}'::jsonb, 'duration_hours',   '{"value": 24}'::jsonb, 'auth'),
    (v_jkkn_id, 'failover.auto_open_enabled',    'Failover: Auto-open WiFi',         'When MyJKKN unreachable, open WiFi (decision #17)',         '{"value": true}'::jsonb, 'boolean',        '{"value": true}'::jsonb, 'failover'),
    (v_jkkn_id, 'consent.dpdpa_required',        'DPDPA Consent on First Login',     'Show consent modal on first authentication',                '{"value": true}'::jsonb, 'boolean',        '{"value": true}'::jsonb, 'privacy'),
    (v_jkkn_id, 'portal.languages_enabled',      'Portal Languages',                 'Languages exposed on captive portal toggle',                '{"value": ["en","ta"]}'::jsonb, 'json',    '{"value": ["en","ta"]}'::jsonb, 'privacy'),
    (v_jkkn_id, 'session.idle_timeout_minutes',  'Session Idle Timeout (minutes)',   'Auto-end session after this many idle minutes',             '{"value": 30}'::jsonb, 'duration_minutes', '{"value": 30}'::jsonb, 'session'),
    (v_jkkn_id, 'alerts.teleport_window_seconds','Anomaly: Teleport Window (sec)',   'Same MAC on different AP within window flags teleport',     '{"value": 60}'::jsonb, 'integer',          '{"value": 60}'::jsonb, 'alerts'),
    (v_jkkn_id, 'alerts.failed_login_spike',     'Anomaly: Failed Login Spike',      'Failed logins per minute that triggers Director alert',     '{"value": 20}'::jsonb, 'integer',          '{"value": 20}'::jsonb, 'alerts'),
    (v_jkkn_id, 'retention.archive_after_days',  'Session Archive After (days)',     'Sessions older than this archived to cold partitions',      '{"value": 365}'::jsonb,'integer',          '{"value": 365}'::jsonb,'session'),
    (v_jkkn_id, 'radius.coa_on_fee_change',      'CoA on Fee Status Change',         'Send Change-of-Authorization packet to kick active sessions when fee state changes (RFC 5176)', '{"value": true}'::jsonb, 'boolean', '{"value": true}'::jsonb, 'failover')
  ON CONFLICT (institution_id, config_key) DO NOTHING;
END $$;

-- ============================================================================
-- TABLE COMMENTS (self-documentation for downstream PRs)
-- ============================================================================

COMMENT ON TABLE network_auth_methods       IS 'Per-institution catalog of authentication methods displayed on captive portal';
COMMENT ON TABLE network_bandwidth_tiers    IS 'Attendance-driven bandwidth tiers applied at session start';
COMMENT ON TABLE network_block_reasons      IS 'Catalog of reasons a user can be blocked; surfaces user-friendly messaging on portal';
COMMENT ON TABLE network_routers            IS 'Registry of MikroTik routers per institution. radius_shared_secret_ref references vault entry; routers RADIUS-auth via the linked network_radius_servers row.';
COMMENT ON TABLE network_radius_servers     IS 'Registry of FreeRADIUS endpoints (typically JICATE-shared VPSes) that terminate RADIUS/RADSEC from customer routers and proxy auth decisions to MyJKKN HTTP API.';
COMMENT ON TABLE network_pending_requests   IS 'Short-lived (10 min TTL) context for the OAuth subflow only (Google/Microsoft sign-in round-trip through MyJKKN web auth). Primary RADIUS auth path bypasses this table.';
COMMENT ON TABLE network_sessions           IS 'Active and historical WiFi sessions, partitioned monthly by created_at. Forever retention; cold partitions archived offline.';
COMMENT ON TABLE network_devices            IS 'User-device registration; enforces max-devices-per-role policy from network_module_config.';
COMMENT ON TABLE network_lockouts           IS 'Failed-attempt lockout state. Defaults: 5 attempts in 30 min → 30 min lockout (configurable).';
COMMENT ON TABLE network_audit_log          IS 'Append-only audit trail. Director + super_admin read access only. Partitioned monthly.';
COMMENT ON TABLE network_module_config      IS 'Per-institution tunables for the Network module. All policy decisions live here, not in code.';

COMMENT ON FUNCTION fn_network_create_monthly_partitions IS 'Create rolling 3-month-ahead partitions. Schedule via pg_cron monthly.';
COMMENT ON FUNCTION fn_network_cleanup_pending_requests  IS 'Delete expired pending captive-portal rows. Schedule every 5 minutes via pg_cron.';
COMMENT ON FUNCTION fn_network_log_audit                 IS 'Single insert path for network_audit_log. Use from all service-layer code.';
COMMENT ON FUNCTION fn_network_record_failed_attempt     IS 'Increment failed-login counter and lock when threshold reached. Returns true if now locked.';
COMMENT ON FUNCTION fn_network_is_user_locked            IS 'Returns locked_until timestamp if user/MAC is currently locked, else NULL.';
COMMENT ON FUNCTION fn_network_register_device           IS 'Register or update device for user. Enforces per-role max-devices cap. Returns NULL if cap exceeded.';
COMMENT ON FUNCTION fn_network_detect_teleport           IS 'Trigger function — flags impossible-movement anomalies when same MAC seen on distant APs within window.';
