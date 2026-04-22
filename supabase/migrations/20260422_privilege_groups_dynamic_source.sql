-- =====================================================================
-- privilege_groups dynamic source pattern — applied to prod 2026-04-22
-- via mcp__supabase__apply_migration. This file captures it in repo
-- history for other environments (staging) + rollback reference.
--
-- WHY: Learners Council membership is already the authoritative record
-- in lc_members. Duplicating rows into privilege_members creates a
-- sync problem (council changes → privileges drift). Violates One JKKN,
-- One Data principle. User guidance, verbatim: "it should use the same
-- table from learner council so doesn t need to seed".
-- =====================================================================

ALTER TABLE privilege_groups
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual';

ALTER TABLE privilege_groups
  ADD COLUMN IF NOT EXISTS source_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema='public'
      AND constraint_name='privilege_groups_source_kind_chk'
  ) THEN
    ALTER TABLE privilege_groups
      ADD CONSTRAINT privilege_groups_source_kind_chk
      CHECK (source_kind IN ('manual', 'lc_members'));
  END IF;
END $$;

COMMENT ON COLUMN privilege_groups.source_kind IS
  'Where membership comes from. ''manual'' = rows in privilege_members. ''lc_members'' = read live from lc_members.';
COMMENT ON COLUMN privilege_groups.source_config IS
  'JSON filter applied to the source table (e.g. {"status":"active"}).';

CREATE OR REPLACE VIEW v_privilege_memberships_effective AS
  SELECT pm.id, pm.group_id, pm.learner_id, pm.status, pm.start_date, pm.end_date,
         pm.revoked_at, pm.revoked_by, pm.revoke_reason, pm.review_notes,
         pm.renewal_status, pm.created_by, pm.created_at, pm.updated_at,
         'manual'::text AS source_kind
  FROM privilege_members pm
  JOIN privilege_groups pg ON pg.id = pm.group_id
  WHERE pg.source_kind = 'manual'

  UNION ALL

  SELECT uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                          pg.id::text || ':' || p.learner_id::text) AS id,
         pg.id AS group_id,
         p.learner_id,
         CASE WHEN lc.status = 'active' THEN 'active' ELSE 'revoked' END AS status,
         lc.appointed_at::date AS start_date,
         lc.ended_at::date AS end_date,
         NULL::timestamptz AS revoked_at,
         NULL::uuid AS revoked_by,
         NULL::text AS revoke_reason,
         NULL::text AS review_notes,
         'active'::text AS renewal_status,
         NULL::uuid AS created_by,
         lc.created_at, lc.updated_at,
         'lc_members'::text AS source_kind
  FROM privilege_groups pg
  JOIN lc_members lc ON lc.institution_id = pg.institution_id AND lc.status = 'active'
  JOIN profiles p ON p.id = lc.user_id
  WHERE pg.source_kind = 'lc_members' AND p.learner_id IS NOT NULL;

COMMENT ON VIEW v_privilege_memberships_effective IS
  'Unified membership surface. Manual + sourced groups look identical to consumers.';

-- Six Learners Council groups (one per institution with active council members)
INSERT INTO privilege_groups (institution_id, name, description, reference_code, status,
                              source_kind, source_config, created_by)
SELECT inst_id, 'Learners Council — ' || short_name,
       'Elected and appointed members of the ' || full_name ||
       ' Learners Council. Membership is read live from lc_members.',
       'LC_' || short_code, 'active', 'lc_members',
       '{"status_filter": "active"}'::jsonb,
       'b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1'::uuid
FROM (VALUES
  ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'AHS',      'AHS',     'JKKN College of Allied Health Sciences'),
  ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'ARTS',     'Arts',    'JKKN College of Arts and Science'),
  ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'ENGG',     'Engg',    'JKKN College of Engineering and Technology'),
  ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'NURSING',  'Nursing', 'JKKN College of Nursing and Research'),
  ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'PHARMACY', 'Pharmacy','JKKN College of Pharmacy'),
  ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'DENTAL',   'Dental',  'JKKN Dental College and Hospital')
) AS councils(inst_id, short_code, short_name, full_name)
WHERE NOT EXISTS (
  SELECT 1 FROM privilege_groups WHERE reference_code = 'LC_' || councils.short_code
);
