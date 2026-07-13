-- JKKN Mission Pillar Map — configurable via the Reference/Masters hub (edit without code).
create table if not exists public.mission_map (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('vision','value','pillar')),
  code text, title text not null, statement text, anchor_quote text,
  status text check (status is null or status in ('covered','partial','gap')),
  loops text, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
alter table public.mission_map enable row level security;
drop policy if exists mission_map_select on public.mission_map;
create policy mission_map_select on public.mission_map for select to public using (true);
drop policy if exists mission_map_write on public.mission_map;
create policy mission_map_write on public.mission_map for all to public
  using (is_super_admin() or is_admin()) with check (is_super_admin() or is_admin());
drop trigger if exists trg_mission_map_updated_at on public.mission_map;
create trigger trg_mission_map_updated_at before update on public.mission_map
  for each row execute function public.fn_touch_updated_at();

insert into public.mission_map (kind, code, title, statement, anchor_quote, status, loops, sort_order)
select * from (values
  ('vision','ROOF','Leading · Global · Innovative Solutions','To be a Leading Global Innovative Solutions provider for the ever-changing needs of society.','To be a Leading Global Innovative Solutions provider for the ever changing needs of the society. [V&M]',NULL,NULL,0),
  ('value','V1','Innovation','Embracing new ideas and creative solutions.','Core value [V&M]',NULL,NULL,10),
  ('value','V2','Commitment to Excellence','Striving for the highest standards.','Core value [V&M]',NULL,NULL,20),
  ('value','V3','Think Big','Aiming for transformative impact.','Core value [V&M]',NULL,NULL,30),
  ('value','V4','Integrity','Acting with honesty and transparency.','Core value [V&M]',NULL,NULL,40),
  ('value','V5','Teamwork','Collaborating to achieve common goals.','Core value [V&M]',NULL,NULL,50),
  ('pillar','P1','Access for All','The door is open to everyone — including women, first-generation and underprivileged learners (scholarship-backed).','Enabling a Platform for all… [V&M] + Providing literacy and empowering women, aiming to upgrade the socio-economic status of the community [Trust]','partial','feeder',100),
  ('pillar','P2','Holistic Learner Development','Develop the whole person — settle new learners in, mentor them, look after wellbeing, not just teach.','…holistic learner development… [Trust]','covered','induction-playbook, induction-session, referral-desk, mentor-checkins, mess',110),
  ('pillar','P3','Excellence in Teaching & Quality','Teaching and institutional quality measurably improve, cycle over cycle.','Commitment to Excellence [V&M] + providing quality education [Trust] + Excellence in Education [Home]','covered','scf, feedback-spine, institutional-audit, iqac-meeting, arps',120),
  ('pillar','P4','Dynamic Leadership','Learners graduate as leaders who act, not passive recipients.','…facilitating them to become Dynamic Leaders… [V&M]','covered','pde-quest, mentor-checkins',130),
  ('pillar','P5','Exponential Opportunity','Learners capture outsized opportunities — placements, internships, entrepreneurship, competitions — not incremental ones.','…to seize exponential opportunities… [V&M]','gap',NULL,140),
  ('pillar','P6','Bioconvergence','The distinctive method — convergence across bio, technology, health and other disciplines — is how JKKN delivers opportunity.','…through bioconvergence… [V&M]','gap',NULL,150),
  ('pillar','P7','Research & Global Innovative Solutions','Produce solutions (research, innovation, products) that reach beyond the campus to society and the world.','…fostering innovation, research… [Trust] + Leading Global Innovative Solutions provider [V&M]','gap',NULL,160)
) as v(kind,code,title,statement,anchor_quote,status,loops,sort_order)
where not exists (select 1 from public.mission_map);

insert into public.reference_catalogs
  (catalog_key, display_name, description, group_name, source_table, editor_mode, label_column,
   view_permission, manage_permission, is_active, sort_order, columns_config)
values ('mission_pillar_map','JKKN Mission Pillar Map',
  'The JKKN mission temple — Vision (roof), the 5 Values (foundation), and the 7 mission Pillars. Edit here to change the map without any code change.',
  'Strategy & Governance','mission_map','generic','title',
  'reference.catalogs.view','reference.catalogs.manage',true,100,'[{"key": "kind", "type": "select", "label": "Layer", "required": true, "show_in_list": true, "options": [{"label": "Vision (roof)", "value": "vision"}, {"label": "Value (foundation)", "value": "value"}, {"label": "Pillar", "value": "pillar"}]}, {"key": "code", "type": "text", "label": "Code", "show_in_list": true}, {"key": "title", "type": "text", "label": "Title", "required": true, "show_in_list": true}, {"key": "statement", "type": "textarea", "label": "Statement / Promise"}, {"key": "anchor_quote", "type": "textarea", "label": "Anchor (cited mission line)"}, {"key": "status", "type": "select", "label": "Coverage (pillars)", "options": [{"label": "Covered", "value": "covered"}, {"label": "Partial", "value": "partial"}, {"label": "Gap", "value": "gap"}]}, {"key": "loops", "type": "text", "label": "Loops covering it (comma-separated)"}, {"key": "sort_order", "type": "number", "label": "Sort order", "show_in_list": true}, {"key": "is_active", "type": "boolean", "label": "Active", "show_in_list": true}]'::jsonb)
on conflict (catalog_key) do update set columns_config=excluded.columns_config,
  display_name=excluded.display_name, description=excluded.description, updated_at=now();
