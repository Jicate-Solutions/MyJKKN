-- accommodation_type_id is no longer a matching dimension and is dropped from
-- the fee-structure create form, so new structures won't set it. Keep the
-- column (per decision) but make it nullable so inserts succeed without it.

ALTER TABLE admission_fee_structures
  ALTER COLUMN accommodation_type_id DROP NOT NULL;
