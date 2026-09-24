-- "Ask AI" on Compare & award: one saved conversation per RFQ.
--
-- Shared by design: another approver opening the RFQ sees what was asked and why
-- an award was suggested, and who applied it. Reads follow the same institution
-- rule as every other procurement table. Writes happen only in
-- /api/procurement/rfqs/[id]/ai-chat (service role, after its own auth and
-- limit checks), so there is no INSERT/UPDATE policy for users.

create table if not exists public.procurement_rfq_ai_messages (
  id              uuid primary key default gen_random_uuid(),
  rfq_id          uuid not null references public.procurement_rfqs(id) on delete cascade,
  institution_id  uuid not null,
  user_id         uuid not null references public.profiles(id),
  role            text not null check (role in ('user', 'assistant')),
  content         text not null default '',
  -- Validated award plan (lib/procurement/quotation-compare-agent.ts) or null.
  suggestion      jsonb,
  applied_at      timestamptz,
  applied_by      uuid references public.profiles(id),
  model_id        text,
  input_tokens    integer,
  output_tokens   integer,
  cost_inr        numeric(12, 6),
  created_at      timestamptz not null default now()
);

create index if not exists procurement_rfq_ai_messages_rfq_idx
  on public.procurement_rfq_ai_messages (rfq_id, created_at);
-- Daily per-person limit counts the user's own questions.
create index if not exists procurement_rfq_ai_messages_user_day_idx
  on public.procurement_rfq_ai_messages (user_id, created_at)
  where role = 'user';

alter table public.procurement_rfq_ai_messages enable row level security;

drop policy if exists prfq_ai_messages_read on public.procurement_rfq_ai_messages;
create policy prfq_ai_messages_read
  on public.procurement_rfq_ai_messages
  for select to authenticated
  using (role_has_institution_access(institution_id));

revoke all on public.procurement_rfq_ai_messages from anon;
-- Read-only for signed-in users; the route writes with the service role.
revoke insert, update, delete, truncate on public.procurement_rfq_ai_messages from authenticated;
grant select on public.procurement_rfq_ai_messages to authenticated;

-- Model + spend governance under its own key (visible in /admin/ai-models).
-- Haiku 4.5 = cheapest current model; the route refuses once this month's
-- ai_model_usage.cost_inr for the key reaches monthly_spend_cap_inr.
insert into public.ai_model_config
  (feature_key, display_name, description, category, provider, model_id, monthly_spend_cap_inr, is_active, change_reason)
values
  ('procurement.quotation_compare_chat',
   'Procurement Quotation Compare Chat',
   'Interactive "Ask AI" on Compare & award: explains an RFQ''s quotations and proposes award plans that a person applies. Paid per question.',
   'procurement', 'anthropic', 'claude-haiku-4-5', 1000, true,
   'Cheapest current model; monthly cap enforced by the chat route')
on conflict (feature_key) do nothing;
