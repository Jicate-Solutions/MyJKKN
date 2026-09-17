-- Applies 20260805090000_procurement_pdf_max_lane.sql, which had never been run
-- ("Bucket not found" on every AI PDF read). Applied live 2026-09-16.
--
-- Sections 1-3 are that file's bucket, storage policies and job-type config.
-- Its section 2 (lane CHECK) was already live with more sub-lanes, so it is
-- skipped here. Its section 4 (a full CREATE OR REPLACE of
-- fn_ai_job_type_upsert) was NOT used: the live body has since gained
-- champion–challenger routing, and replacing it with the July copy would have
-- deleted that. Instead the one vocabulary line is patched in place on the live
-- body, and widened to every max-* sub-lane (max-pde, max-cards, ... were being
-- silently coerced back to 'max' on an admin save too).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('procurement-quotation-pdfs','procurement-quotation-pdfs', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='procurement_quotation_pdfs_insert') then
    create policy "procurement_quotation_pdfs_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'procurement-quotation-pdfs' and (public.is_super_admin() or public.is_admin() or public.user_has_permission('procurement.quotation_manage')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='procurement_quotation_pdfs_read') then
    create policy "procurement_quotation_pdfs_read" on storage.objects for select to authenticated
      using (bucket_id = 'procurement-quotation-pdfs' and (public.is_super_admin() or public.is_admin() or public.user_has_permission('procurement.quotation_manage')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='procurement_quotation_pdfs_delete') then
    create policy "procurement_quotation_pdfs_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'procurement-quotation-pdfs' and (public.is_super_admin() or public.is_admin() or public.user_has_permission('procurement.quotation_manage')));
  end if;
end $$;

-- Dedicated lane: fn_ai_claim has no job_type predicate, so an interactive job on
-- lane 'max' could be claimed by the PDF runner and vice versa (see the 20260805 file).
update public.ai_job_types set lane='max-pdf', interactive=true, allow_rule='permission:procurement.quotation_manage', expected_seconds=45, updated_at=now()
 where job_type='procurement.quotation_extract';
update public.ai_job_types set lane='max-pdf', interactive=true, allow_rule='permission:procurement.grn_create', expected_seconds=45, updated_at=now()
 where job_type='procurement.invoice_extract';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.fn_ai_job_type_upsert(jsonb)'::regprocedure);
  v_new := replace(v_def,
    $x$  IF v_lane NOT IN ('max', 'api', 'either') THEN$x$,
    $x$  -- Max sub-lanes (max-pdf, max-pde, max-cards, ...) are dedicated runner pools;
  -- coercing them to 'max' on an admin save would move a job into the shared pool.
  -- An unknown max-* value is rejected loudly by ai_job_types_lane_chk instead.
  IF v_lane NOT IN ('max', 'api', 'either') AND v_lane NOT LIKE 'max-%' THEN$x$);
  -- Already patched (re-run) or the body moved: skip rather than fail.
  if v_new <> v_def then
    execute v_new;
  end if;
end $$;
revoke execute on function public.fn_ai_job_type_upsert(jsonb) from anon, public;

notify pgrst, 'reload schema';

-- Paid fallback (2026-09-16): when no Max-lane runner claims a quotation read
-- within 10s, /api/procurement/quotations/extract-pdf/direct reads it with the
-- Claude API. Its own feature key keeps the ₹0 lane's model config untouched and
-- its spend separately visible in /admin/ai-models. Haiku 4.5 = cheapest current
-- model that reads PDFs.
insert into public.ai_model_config (feature_key, display_name, description, category, provider, model_id, is_active, change_reason)
values ('procurement.quotation_extract_api', 'Procurement Quotation PDF Extraction (paid fallback)',
 'Direct Claude API read of a vendor quotation PDF, used only when no office Max-lane runner picks the job up within 10s. Paid per use.',
 'procurement', 'anthropic', 'claude-haiku-4-5', true,
 'Cheapest current model that reads PDFs; requested by procurement user 2026-09-16')
on conflict (feature_key) do nothing;

-- No max-pdf runner is installed on the office AI machine yet, so the lane stays
-- dark (as 20260805090000 intended). While it is off, the extract-pdf route reads
-- the PDF directly in the request instead of queueing for nobody. Turn this back
-- on once the runner is running to make reads ₹0 again.
update public.ai_job_types set enabled = false, updated_at = now()
 where job_type = 'procurement.quotation_extract';
