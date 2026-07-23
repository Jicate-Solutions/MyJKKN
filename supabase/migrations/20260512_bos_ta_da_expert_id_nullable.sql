-- Allow internal BOS members (chairman, HoD, etc.) to have DA-only claims
-- without a linked external expert.
ALTER TABLE bos_ta_da_claims
  ALTER COLUMN expert_id DROP NOT NULL;
