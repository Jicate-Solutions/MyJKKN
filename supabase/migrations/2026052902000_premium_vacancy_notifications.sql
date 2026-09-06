-- ─── Premium vacancy detection + upgrade-pool notification (PR ζ) ──────────
-- Locked decisions (2026-05-28):
--   5. A mid-year vacate of a Premium-category bed leaves existing residents'
--      fees unchanged; the freed bed becomes an "upgrade vacancy".
--   6. On opening, notify all CLASSIC-category residents in the SAME hostel
--      cluster, gender-matched, of the upgrade opportunity.
--
-- The dynamic 20% / 60-day price drop is a SEPARATE later PR (θ). This
-- migration only stores the vacancy record + a notification log, and reserves
-- the columns θ will mutate (current_discount_pct, last_dropped_at).
--
-- Cluster resolution (FLAGGED, needs Director confirmation): hostel_blocks
-- carries no explicit cluster column and no institution_id — institution
-- scope flows through the hostel_block_institutions junction, and the only
-- gender key on a block is hostel_type. The chosen cluster_key is therefore
-- "<institution_id>:<hostel_type>" (e.g. one institution's "boys" pool). If
-- the Director wants a finer cluster (e.g. by block name), bump cluster_key
-- resolution in premium-vacancy-service.ts; the column is plain text so no
-- schema change is needed.
--
-- Conventions copied from 20260528000003_amenities_categories_table.sql:
--   - RLS: SELECT to authenticated (USING true); write gated to
--     profiles.role IN ('super_admin','admin').
--   - updated_at maintained by the shared update_updated_at_column() trigger.

-- ─── hostel_premium_vacancies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hostel_premium_vacancies (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  room_id                   uuid        NOT NULL REFERENCES hostel_rooms(id) ON DELETE CASCADE,
  bed_id                    uuid        REFERENCES hostel_beds(id) ON DELETE SET NULL,
  block_id                  uuid        REFERENCES hostel_blocks(id) ON DELETE SET NULL,
  room_category_id          uuid        REFERENCES hostel_categories(id),
  hostel_type               text,                                  -- gender pool key (boys|girls|...)
  cluster_key               text,                                  -- resolved cluster id: "<institution_id>:<hostel_type>"
  opened_at                 timestamptz NOT NULL DEFAULT now(),
  opened_by_vacate_request_id uuid      REFERENCES hostel_vacate_requests(id) ON DELETE SET NULL,
  current_discount_pct      integer     NOT NULL DEFAULT 0,        -- θ (price-drop) will bump this
  last_dropped_at           timestamptz,                           -- θ uses this for the 60-day cadence
  status                    text        NOT NULL DEFAULT 'open'
                                        CHECK (status IN ('open','filled','closed_year_end','cancelled')),
  filled_by_learner_id      uuid        REFERENCES profiles(id),
  filled_at                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hostel_premium_vacancies_open
  ON hostel_premium_vacancies (institution_id, status, cluster_key);
CREATE INDEX IF NOT EXISTS idx_hostel_premium_vacancies_vacate_req
  ON hostel_premium_vacancies (opened_by_vacate_request_id);

-- ─── hostel_premium_vacancy_notifications ──────────────────────────────────
CREATE TABLE IF NOT EXISTS hostel_premium_vacancy_notifications (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id             uuid        NOT NULL REFERENCES hostel_premium_vacancies(id) ON DELETE CASCADE,
  notified_learner_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notified_at            timestamptz NOT NULL DEFAULT now(),
  discount_pct_at_notify integer     NOT NULL DEFAULT 0,
  channel                text,                                     -- 'in_app' | 'whatsapp' | 'email'
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Idempotency guard: one notification row per (vacancy, learner). Re-running
-- notifyUpgradePool must not double-dispatch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_premium_vacancy_notif_pair
  ON hostel_premium_vacancy_notifications (vacancy_id, notified_learner_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE hostel_premium_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_premium_vacancy_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_premium_vacancies_select"
  ON hostel_premium_vacancies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_premium_vacancies_insert"
  ON hostel_premium_vacancies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_premium_vacancies_update"
  ON hostel_premium_vacancies FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_premium_vacancies_delete"
  ON hostel_premium_vacancies FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_premium_vacancy_notif_select"
  ON hostel_premium_vacancy_notifications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_premium_vacancy_notif_insert"
  ON hostel_premium_vacancy_notifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_premium_vacancy_notif_delete"
  ON hostel_premium_vacancy_notifications FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

-- ─── updated_at trigger (vacancies only; notifications are append-only) ─────
CREATE TRIGGER trg_hostel_premium_vacancies_updated_at
  BEFORE UPDATE ON hostel_premium_vacancies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
