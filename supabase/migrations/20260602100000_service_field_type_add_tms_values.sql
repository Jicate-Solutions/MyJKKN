-- Add live-lookup field types for the Bus Pass Request form.
-- These values back the tms_route / tms_route_stop dynamic form fields.
-- NOTE: ADD VALUE is committed in its own migration; the INSERT that uses these
-- values lives in the next migration (20260602100100) because Postgres forbids
-- using a newly-added enum value in the same transaction that adds it.
ALTER TYPE service_field_type ADD VALUE IF NOT EXISTS 'tms_route';
ALTER TYPE service_field_type ADD VALUE IF NOT EXISTS 'tms_route_stop';
