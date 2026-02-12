-- Add unique constraint on (account_id, credential_type) for sm_account_credentials
-- This enables upsert behavior when storing OAuth tokens (one credential per type per account)
ALTER TABLE sm_account_credentials
  ADD CONSTRAINT sm_account_credentials_account_type_unique
  UNIQUE (account_id, credential_type);
