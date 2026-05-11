-- ============================================================================
-- Migration: 20260510_create_bos_boards.sql
-- Description: Create bos_boards table (local reference copy of COE board data)
--
-- Why local? The COE REST API does not expose a /boards endpoint, so board
-- metadata (name, code) must be stored in MyJKKN Supabase. The board_id in
-- bos_compositions / bos_meetings is a bare UUID (no FK) that matches the
-- id column here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bos_boards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id   UUID NOT NULL,
  board_code        VARCHAR(50)  NOT NULL,
  board_name        VARCHAR(255) NOT NULL,
  board_type        VARCHAR(100),
  department        VARCHAR(255),
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institutions_id, board_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_boards_institutions ON bos_boards(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_boards_is_active    ON bos_boards(is_active);

ALTER TABLE bos_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_boards_select" ON bos_boards FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR role_has_institution_access(institutions_id)
);

CREATE POLICY "bos_boards_insert" ON bos_boards FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
);

CREATE POLICY "bos_boards_update" ON bos_boards FOR UPDATE USING (
  is_super_admin() OR is_admin()
);

CREATE POLICY "bos_boards_delete" ON bos_boards FOR DELETE USING (
  is_super_admin() OR is_admin()
);

CREATE TRIGGER update_bos_boards_updated_at
  BEFORE UPDATE ON bos_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Seed: boards already referenced by bos_compositions ──────────────────────
-- These UUIDs match existing bos_compositions.board_id values.
-- Preserving exact UUIDs avoids orphaning existing composition records.

INSERT INTO bos_boards (id, institutions_id, board_code, board_name, board_type) VALUES
  -- Institution: b0b8a724-7c65-4f07-8047-2a38e8100ad5
  ('1d970c62-cac0-4ba5-b243-7b55e7abdd87', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'PG-ENG',  'Board of Studies - PG English',                    'Arts & Science'),
  ('44547689-b0ba-4131-af2e-5adf1c67cec5', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'CS',      'Board of Studies - Computer Science',               'Arts & Science'),
  ('4a4ad4b9-e816-40bf-9729-dfde6eb4bac6', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'MATH',    'Board of Studies - Mathematics',                    'Arts & Science'),
  ('d470e185-b92f-4d16-9383-631913aac4af', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'TFD',     'Board of Studies - Textile and Fashion Designing',  'Arts & Science'),
  ('e368eaf3-8c74-48e6-aeb4-44e465f49524', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'CS-UG',   'Board of Studies - Computer Science (UG)',           'Arts & Science'),
  ('e6aa45ca-d2d7-467a-b20d-f57fa8f714d3', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'PHY',     'Board of Studies - Physics',                        'Arts & Science'),
  -- Institution: a33138b6-4eea-4675-941f-1071bf88b127
  ('64976b2b-351b-4e45-9a1b-ee3f3c384ad1', 'a33138b6-4eea-4675-941f-1071bf88b127', 'BBA',     'Board of Studies - BBA',                            'Arts & Science'),
  ('892a3578-5598-412f-827c-4f01e4f16b01', 'a33138b6-4eea-4675-941f-1071bf88b127', 'UG-ZOO',  'Board of Studies - Zoology (UG)',                   'Arts & Science'),
  ('dcabe2a0-eb16-41aa-876d-2ae5988c4b14', 'a33138b6-4eea-4675-941f-1071bf88b127', 'PG-ZOO',  'Board of Studies - Zoology (PG)',                   'Arts & Science')
ON CONFLICT (id) DO NOTHING;
