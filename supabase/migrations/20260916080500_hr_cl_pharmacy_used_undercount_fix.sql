-- ============================================================================
-- Fix: `used` undercount in fn_hr_cl_correct_2026_jun_aug_pharmacy's final step.
-- Created: 2026-09-16. Follow-up to 20260916080000 (applied same session).
--
-- The function's "used, absolutely" step summed ONLY hr_leave_month_entries,
-- silently dropping anyone with a real, un-overridden approved application in
-- a month that already matched its Excel target (so it never got an override
-- row). Found via a manual spot-check against Viruthasarani A (NOTCOP027):
-- June 2 + July 3 + August 1 (real, untouched 19 Aug application) should be 6,
-- the function left her at 5. Applied directly against the 57 people this
-- batch touched with the correct general formula (month entries + approved
-- applications in months NOT covered by an entry -- the same formula
-- hr_leave_month_entry_set's own v_explained already uses). Verified against
-- the whole affected set before committing this file.
-- ============================================================================-- Corrective fix: recompute `used` with the full formula (month entries +
-- approved applications in months NOT covered by an entry), not just entries.
-- The earlier pass under-counted anyone with a real, un-overridden approved
-- application in a month that already matched its target (so it never got an
-- override row and was silently dropped from the entries-only sum).
WITH pairs(employee_id, leave_type_id) AS (
  VALUES
  ('334da7d4-af07-4578-af2d-df627a448686', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('0faee871-f051-4093-a920-9b608f1860e1', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('d7db496a-d2ce-4e3b-be33-268791998cb3', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('5a4e3be9-f84b-488b-a654-2a3c2aee3e40', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('f6ef8fca-26c2-48ed-a4e3-58f9fe2cc258', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('69ccbf92-d8ed-4960-a40b-d14e70bfb3ec', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('b34ae518-61b1-4239-a61d-6173c61d3309', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('cb30e0e6-9ddc-4c55-8e22-500f1cfaf802', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('a7fd91fb-38e2-4134-8a6b-f12f992810e3', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('3518cd28-5735-4f66-8938-7e483be01141', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('cb9d1b01-114d-482b-b8ae-131f89559dfc', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('a12ffe83-5f64-41bb-a2da-d5087c438119', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('e3fc73a2-891b-421a-81da-fd17a3870730', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('08f54b8c-534e-46b2-a463-5c32138db688', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('cfdc9074-287d-47c6-8f3f-a3b06fed1b9f', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('88f15fa8-4e37-403b-b2e7-17498b9eb0d5', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('923a335c-1d15-4760-b5ff-f3e4bc1c35bf', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('59f36ba3-58e9-4c7b-9582-15723afc6954', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('af8b9832-22ad-4daa-8965-a449675aee6c', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('a9fd49c3-a3cd-4297-a002-8f7babfed688', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('26248722-d063-44bf-915f-41d94f3ed8bc', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('a6c1b108-76ea-4e27-9201-0822f32a4082', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('b36e6f3a-9430-43f3-a972-6a3de6ae6eba', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('5beb6849-d15c-40de-86a0-78ab312883d9', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('c0963262-f68d-4a59-b187-7aa9fd7ab219', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('3996c767-0337-4fe7-aa87-b282338f4a8d', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('678f5d19-2030-4e35-b38c-4af8b545772e', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('8d600692-d074-4267-9ae2-3342570fe6bf', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('e31dcfa1-5507-44f4-bce4-5913e9cd9c42', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('092770a9-69f5-4285-a358-021dd92cf4aa', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('7a39dd08-59f6-499a-ba63-b8a8be194f3d', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('675f588e-842d-4523-b4ac-97d16302e68c', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('c39bb564-7980-490e-82d9-3f6359aab0d0', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('7b0293f2-b303-4d54-a969-0ccd5548336a', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('f887c854-5a45-43fb-9dec-ed02b5ef31f4', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('81fbc781-8761-4982-8f95-1223030e40ea', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('ea198f0c-f4eb-4d12-9159-0aa3e6397032', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('2a31306f-1e6c-48a1-bb8b-435672f07d88', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('64a17876-c771-4be1-bd71-06db03969b7b', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('2553ac3d-6ebe-47fb-8682-17db113167e7', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('a89c22f7-3b0f-4c58-a66b-9dfead79f94b', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('d91faf28-7005-4614-a7d1-4700bdf1017a', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('b63a526c-bf64-4452-8bf4-7b96506abb18', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('546e6e92-3fe3-4b23-a486-bf2a5cf9e598', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('d1736327-0ea0-4132-9c61-a12b312d2158', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('06d13389-5af0-450b-ae7c-0522b15e50d2', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('3f8058b6-1440-4d55-a865-f02d7d3833d4', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('4649b736-eb14-4a7f-b41b-ab01784aa60c', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('5885238b-c7ec-49ac-9093-78765446ebad', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('e3cc2f91-f436-4d5a-b0c5-c751b7a7d007', '17e62724-e2f0-41bd-8dda-43a3a8d0c299'),
  ('6b931fae-5cc9-48da-82a3-5d5c71a27169', '17e62724-e2f0-41bd-8dda-43a3a8d0c299'),
  ('940a9f0a-16b3-4c11-a831-1970cc86c2f8', '1a5778c3-c974-455e-94e7-e7d40ecc0c68'),
  ('b6da03fa-1846-4618-a9c3-bb09588d4d58', '1a5778c3-c974-455e-94e7-e7d40ecc0c68'),
  ('9ddc6f73-2597-4c54-a734-746b67625c73', '1a5778c3-c974-455e-94e7-e7d40ecc0c68'),
  ('7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464', '1a5778c3-c974-455e-94e7-e7d40ecc0c68'),
  ('4403995d-8250-49b6-ac15-18c54709d8c7', '412b64fd-75ec-4d5a-abef-20a7bcda1331'),
  ('36d76fc7-1b77-43f6-a85e-6850a0b02d80', '412b64fd-75ec-4d5a-abef-20a7bcda1331')
)
UPDATE public.hr_leave_balances b
   SET used = COALESCE((
         SELECT SUM(e.days) FROM public.hr_leave_month_entries e
          WHERE e.employee_id = b.employee_id AND e.leave_type_id = b.leave_type_id
            AND e.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'), 0)
       + COALESCE((
         SELECT SUM(a.total_days) FROM public.hr_leave_applications a
          WHERE a.employee_id = b.employee_id AND a.leave_type_id = b.leave_type_id
            AND a.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
            AND a.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM public.hr_leave_month_entries e2
                              WHERE e2.employee_id = a.employee_id AND e2.leave_type_id = a.leave_type_id
                                AND e2.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
                                AND e2.month_start = date_trunc('month', a.start_date)::date)), 0),
       updated_at = now()
  FROM pairs p
 WHERE b.employee_id = p.employee_id::uuid AND b.leave_type_id = p.leave_type_id::uuid
   AND b.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
RETURNING b.employee_id, b.leave_type_id, b.used;
