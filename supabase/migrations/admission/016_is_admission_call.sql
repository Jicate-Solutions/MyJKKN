-- 016_is_admission_call.sql
-- Add is_admission_call flag to filter dashboard to admission-only calls.
-- Non-admission calls (dental office, pharmacy office, engineering office, nursing office, etc.)
-- are still captured but excluded from the admission dashboard by default.

ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS is_admission_call BOOLEAN DEFAULT NULL;

-- IVR ExoPhones are admission entry points
UPDATE admission_call_logs
SET is_admission_call = true
WHERE to_number IN ('04446313503', '04448134434', '04446313545', '04446313596', '04446310202')
AND is_admission_call IS NULL;

-- Admission counselor direct numbers
UPDATE admission_call_logs
SET is_admission_call = true
WHERE to_number IN ('09942405777', '09842547666', '09092327666', '09865933332', '09788261666', '09092334666', '08754864052')
AND is_admission_call IS NULL;

-- Known non-admission numbers
UPDATE admission_call_logs
SET is_admission_call = false
WHERE to_number IN ('09171668571', '09629771832', '09965939333', '09943583666', '09788648307', '09865910003')
AND is_admission_call IS NULL;

-- Default remaining to false
UPDATE admission_call_logs SET is_admission_call = false WHERE is_admission_call IS NULL;

-- Reload PostgREST schema
SELECT pg_notify('pgrst', 'reload schema');
