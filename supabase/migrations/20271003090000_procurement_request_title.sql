-- A short label the requester gives a request ("Microbiology lab", "LT practicals").
-- Two requests from the same person, department and day with the same reason were
-- indistinguishable on the Requests list; this is what tells them apart.
ALTER TABLE public.procurement_purchase_requests
  ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.procurement_purchase_requests.title IS
  'Requester-given label shown on the Requests list, e.g. which lab or class the request is for.';
