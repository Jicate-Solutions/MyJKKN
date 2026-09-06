-- Read-only auto-detected Passenger Type field for the Bus Pass Request.
-- Committed alone; the INSERT that uses it is in the next migration (Postgres
-- forbids using a newly-added enum value in the same transaction that adds it).
ALTER TYPE service_field_type ADD VALUE IF NOT EXISTS 'passenger_type';
