-- Fix: 22001 "value too long for type character varying(20)" when staff create
-- resources with realistic location names (e.g. "Pharmacy Block - Ground Floor").
--
-- Root cause: location and vendor columns were created as varchar(20), which is
-- too tight for descriptive institutional location data and for international
-- phone formats. Reported by janani.jicate@jkkn.ac.in trying to add a resource
-- under "JKKN College of Pharmacy".
--
-- This raises the caps to realistic values. Zod schema mirrors the same caps so
-- the form surfaces the error inline instead of crashing the API call.
-- vendor_zip stays at 20 (sufficient for any postal code format).

ALTER TABLE public.resources
  ALTER COLUMN block_number    TYPE varchar(50),
  ALTER COLUMN building_number TYPE varchar(50),
  ALTER COLUMN room_number     TYPE varchar(50),
  ALTER COLUMN vendor_mobile   TYPE varchar(30);

COMMENT ON COLUMN public.resources.block_number    IS 'Block label/name within building. Up to 50 chars (e.g. "Pharmacy Block - Wing A").';
COMMENT ON COLUMN public.resources.building_number IS 'Building label/name. Up to 50 chars (e.g. "Old Hostel Building").';
COMMENT ON COLUMN public.resources.room_number    IS 'Room label/number. Up to 50 chars (e.g. "Lab 3 - Microbiology").';
COMMENT ON COLUMN public.resources.vendor_mobile  IS 'Vendor mobile/phone, up to 30 chars (room for international format with extension).';
