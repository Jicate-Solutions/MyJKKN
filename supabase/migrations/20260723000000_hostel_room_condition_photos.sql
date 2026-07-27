-- Room condition-check photos: multiple images per hostel room, documenting
-- room condition. Files are stored in Google Drive (lib/google/drive-upload.ts),
-- NOT Supabase Storage — this table only holds the Drive reference + metadata.
--
-- Modeled on hostel_vacate_documents (20260422_hostel_vacate_workflow.sql):
-- a junction table keyed on a parent id, admin-managed, needs independent
-- per-row delete — unlike that table, there is no paired Storage bucket.

CREATE TABLE IF NOT EXISTS hostel_room_condition_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES hostel_rooms(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hrcp_mime_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT hrcp_size_limit CHECK (file_size_bytes <= 8388608)  -- 8 MB, post-compression
);

CREATE INDEX IF NOT EXISTS idx_hrcp_room ON hostel_room_condition_photos(room_id, uploaded_at DESC);

ALTER TABLE hostel_room_condition_photos ENABLE ROW LEVEL SECURITY;

-- Same shape as hostel_rooms_select/update_permission
-- (20260703100000_hostel_rooms_v2_pr2_destructive.sql) — reuses the existing
-- campus_living.rooms.view / .edit permission keys, no new keys added.
DROP POLICY IF EXISTS hrcp_select_permission ON hostel_room_condition_photos;
CREATE POLICY hrcp_select_permission ON hostel_room_condition_photos
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_rooms r
      WHERE r.id = hostel_room_condition_photos.room_id
        AND user_has_permission('campus_living.rooms.view'::text)
        AND (fn_user_can_access_room(r.id) OR role_has_block_access(r.block_id))
    )
  );

DROP POLICY IF EXISTS hrcp_insert_permission ON hostel_room_condition_photos;
CREATE POLICY hrcp_insert_permission ON hostel_room_condition_photos
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_rooms r
      WHERE r.id = hostel_room_condition_photos.room_id
        AND user_has_permission('campus_living.rooms.edit'::text)
        AND (fn_user_can_access_room(r.id) OR role_has_block_access(r.block_id))
    )
  );

DROP POLICY IF EXISTS hrcp_delete_permission ON hostel_room_condition_photos;
CREATE POLICY hrcp_delete_permission ON hostel_room_condition_photos
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_rooms r
      WHERE r.id = hostel_room_condition_photos.room_id
        AND user_has_permission('campus_living.rooms.edit'::text)
        AND (fn_user_can_access_room(r.id) OR role_has_block_access(r.block_id))
    )
  );

-- No UPDATE policy — photos are upload-once, delete-only.
