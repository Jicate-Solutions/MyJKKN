# Induction Session Polls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-session, multi-question opinion poll to the induction module — host builds it, enrolled freshers answer, host watches live anonymized tallies.

**Architecture:** Four normalized tables (`induction_session_poll` → `_question` → `_option` → `_vote`) behind `SECURITY DEFINER` RPCs, mirroring the existing Live Pulse lifecycle/gating. A new `induction-poll-service.ts` fronts the RPCs; a host dialog (build + open/close + live results) hangs off each session row; a learner banner on `/learners/my-induction` collects answers.

**Tech Stack:** Next.js 16 / React 19, Supabase (Postgres + RLS + DEFINER RPCs), TanStack Query (not required here — direct service calls + polling like Pulse), Shadcn UI, `sonner` toasts.

**Spec:** `docs/superpowers/specs/2026-06-30-induction-session-polls-design.md`

## Global Constraints

- **No test runner exists.** Do NOT write pytest/jest/vitest tests. Per CLAUDE.md, verify each task by: (a) `mcp__ide__getDiagnostics` on every touched `.ts/.tsx` file (no full `tsc`); (b) for SQL, `mcp__supabase__execute_sql` structural checks; (c) manual browser exercise where noted. Never claim "tests pass."
- **Migrations:** apply via `mcp__supabase__apply_migration`, AND commit the real SQL body to `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Mirror DDL into `supabase/setup/` (`01_tables.sql`, `02_functions.sql`, `03_policies.sql`). Use a real timestamp prefix (today is 2026-06-30 → e.g. `20260630210000`). Never leave a `SELECT 1;` placeholder.
- **All new RPCs:** `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`; end each with `REVOKE EXECUTE ... FROM anon, PUBLIC;` then `GRANT EXECUTE ... TO authenticated;`. Finish the migration with `NOTIFY pgrst, 'reload schema';`.
- **Supabase mutations:** always destructure and check `{ error }` (RLS denials come back in `error`, not as thrown). Service throws on `error`.
- **Privacy:** the totals RPC must NEVER return `learner_id`. k≥3 floor: suppress option counts until ≥3 distinct learners have answered the poll.
- **Gating (reuse existing):** host authority = `public._fn_induction_can_manage_session_pulse(session_id)`; learner = `get_my_learner_id()` enrolled in event + `session.batch_id IS NULL OR = mine`.
- **Branch:** `feat/induction-session-polls` (already created; spec already committed there).
- **`institutionId || ''` / empty-string-UUID:** never send `''` to a uuid param; use `null`.

---

### Task 1: Migration — 4 tables, indexes, RLS, trigger

**Files:**
- Create: `supabase/migrations/20260630210000_induction_session_polls_tables.sql`
- Modify (mirror): `supabase/setup/01_tables.sql`, `supabase/setup/03_policies.sql`

**Interfaces:**
- Produces: tables `induction_session_poll` (UNIQUE `session_id`; `status` draft|open|closed; `auto_close_at`), `induction_session_poll_question` (`kind` single|multi), `induction_session_poll_option`, `induction_session_poll_vote` (UNIQUE `question_id,option_id,learner_id`). Consumed by every later task.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260630210000_induction_session_polls_tables.sql
-- Per-session induction opinion polls. Lifecycle/gating mirror induction_session_pulse;
-- normalized poll→question→option→vote mirrors meeting_polls. Anonymized (learner_id
-- on votes only, never exposed; k>=3 floor on totals). All access via DEFINER RPCs.

CREATE TABLE IF NOT EXISTS public.induction_session_poll (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL UNIQUE REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events(id)        ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id)  ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  issued_at       timestamptz,
  auto_close_at   timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isp_event ON public.induction_session_poll(event_id);

CREATE TABLE IF NOT EXISTS public.induction_session_poll_question (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES public.induction_session_poll(id) ON DELETE CASCADE,
  prompt      text NOT NULL,
  kind        text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','multi')),
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ispq_poll ON public.induction_session_poll_question(poll_id, position);

CREATE TABLE IF NOT EXISTS public.induction_session_poll_option (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  label       text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ispo_question ON public.induction_session_poll_option(question_id, position);

CREATE TABLE IF NOT EXISTS public.induction_session_poll_vote (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid NOT NULL REFERENCES public.induction_session_poll(id)          ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  option_id   uuid NOT NULL REFERENCES public.induction_session_poll_option(id)   ON DELETE CASCADE,
  learner_id  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, option_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_ispv_question     ON public.induction_session_poll_vote(question_id);
CREATE INDEX IF NOT EXISTS idx_ispv_poll_learner ON public.induction_session_poll_vote(poll_id, learner_id);

-- touch updated_at (reuse the induction helper used by induction_session_pulse)
DROP TRIGGER IF EXISTS trg_isp_poll_touch ON public.induction_session_poll;
CREATE TRIGGER trg_isp_poll_touch BEFORE UPDATE ON public.induction_session_poll
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

-- RLS: super_admin-only direct access; everything else via DEFINER RPCs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'induction_session_poll','induction_session_poll_question',
    'induction_session_poll_option','induction_session_poll_vote'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_super_admin ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_super_admin ON public.%I FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())',
      t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Verify `induction_touch_updated_at` exists** (the pulse migration created it; confirm before relying on it)

Run via `mcp__supabase__execute_sql`:
```sql
SELECT proname FROM pg_proc WHERE proname = 'induction_touch_updated_at';
```
Expected: one row. If absent, add to the migration:
```sql
CREATE OR REPLACE FUNCTION public.induction_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
```

- [ ] **Step 3: Apply the migration** via `mcp__supabase__apply_migration` (name `induction_session_polls_tables`, the SQL above).

- [ ] **Step 4: Verify tables + constraints exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'induction_session_poll%' ORDER BY 1;
```
Expected: 4 rows.

- [ ] **Step 5: Mirror DDL** into `supabase/setup/01_tables.sql` (the 4 `CREATE TABLE`s) and `supabase/setup/03_policies.sql` (the 4 super_admin policies).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/20260630210000_induction_session_polls_tables.sql supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(induction): poll tables (poll/question/option/vote) + RLS"
```

---

### Task 2: Migration — host RPCs (upsert / open / close / get / totals)

**Files:**
- Create: `supabase/migrations/20260630210100_induction_session_polls_host_rpcs.sql`
- Modify (mirror): `supabase/setup/02_functions.sql`

**Interfaces:**
- Consumes: Task 1 tables; existing `public._fn_induction_can_manage_session_pulse(uuid)`, `induction_programs`, `induction_enrollment`.
- Produces (consumed by the service in Task 5):
  - `fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb) → uuid`
  - `fn_induction_open_session_poll(p_session_id uuid) → induction_session_poll`
  - `fn_induction_close_session_poll(p_poll_id uuid) → induction_session_poll`
  - `fn_induction_get_session_poll(p_session_id uuid) → jsonb`
  - `fn_induction_session_poll_totals(p_poll_id uuid) → jsonb`

- [ ] **Step 1: Write the host-RPC SQL** (full bodies — do not abbreviate)

```sql
-- 20260630210100_induction_session_polls_host_rpcs.sql

-- Build/edit the poll structure (diff-upsert). Deletes are blocked once votes exist.
CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event uuid; v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authenticated'; END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst
  FROM public.event_sessions es JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not an induction session'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (session_id, event_id, institution_id, created_by)
  VALUES (p_session_id, v_event, v_inst, auth.uid())
  ON CONFLICT (session_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) LOOP
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = coalesce(q->>'kind','single'),
          position = coalesce((q->>'position')::int, 0)
      WHERE id = v_qid AND poll_id = v_poll_id;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position)
      VALUES (v_poll_id, q->>'prompt', coalesce(q->>'kind','single'), coalesce((q->>'position')::int,0))
      RETURNING id INTO v_qid;
    END IF;
    v_keep_q := array_append(v_keep_q, v_qid);

    v_keep_o := '{}';
    FOR o IN SELECT value FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) LOOP
      IF nullif(o->>'id','') IS NOT NULL THEN
        v_oid := (o->>'id')::uuid;
        UPDATE public.induction_session_poll_option
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM public.induction_session_poll_option opt
      JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
      WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))
    ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option
    WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.induction_session_poll_question qq
    JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
    WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))
  ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question
  WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) TO authenticated;

-- Open (idempotent, advisory-locked, requires >=1 question).
CREATE OR REPLACE FUNCTION public.fn_induction_open_session_poll(p_session_id uuid)
RETURNS public.induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: not authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('induction_poll|' || p_session_id::text));
  SELECT * INTO v_row FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: no poll for this session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = v_row.id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: add at least one question first'; END IF;
  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes', updated_at=now()
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_close_session_poll(p_poll_id uuid)
RETURNS public.induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: not authenticated'; END IF;
  SELECT session_id INTO v_session FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_close_session_poll: not authorized'; END IF;
  UPDATE public.induction_session_poll SET status='closed', updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) TO authenticated;

-- Host fetch: full structure + status + has_votes (for the builder and results header).
CREATE OR REPLACE FUNCTION public.fn_induction_get_session_poll(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_get_session_poll: not authorized'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'session_id', v_p.session_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes, 'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

-- Live anonymized totals (k>=3 floor). Lazy auto-close.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_suppress boolean; v_k constant int := 3; v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_p.session_id) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_totals: not authorized'; END IF;

  IF v_p.status = 'open' AND v_p.auto_close_at IS NOT NULL AND v_p.auto_close_at < now() THEN
    UPDATE public.induction_session_poll SET status='closed', updated_at=now() WHERE id = v_p.id;
    v_p.status := 'closed';
  END IF;

  SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;
  SELECT count(*)::int INTO v_enrolled FROM public.induction_enrollment ie
  WHERE ie.event_id = v_p.event_id AND (v_batch IS NULL OR ie.batch_id = v_batch);

  SELECT count(DISTINCT learner_id)::int INTO v_responses
  FROM public.induction_session_poll_vote WHERE poll_id = v_p.id;
  v_suppress := (v_responses < v_k);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
           'response_count', (SELECT count(DISTINCT learner_id) FROM public.induction_session_poll_vote v WHERE v.question_id = q.id),
           'options', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'label', o.label,
               'count', CASE WHEN v_suppress THEN NULL ELSE (SELECT count(*) FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) END
             ) ORDER BY o.position),'[]'::jsonb)
             FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  RETURN jsonb_build_object('status', v_p.status, 'auto_close_at', v_p.auto_close_at,
    'enrolled_count', v_enrolled, 'response_count', v_responses, 'suppressed', v_suppress,
    'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration` (name `induction_session_polls_host_rpcs`).

- [ ] **Step 3: Verify the 5 functions exist**
```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'fn_induction_%session_poll%' ORDER BY 1;
```
Expected: includes upsert/open/close/get/totals. (Functions requiring `auth.uid()` can't be exercised via `execute_sql` — that's expected; behavior is verified in the browser at Task 6.)

- [ ] **Step 4: Mirror** the 5 functions into `supabase/setup/02_functions.sql`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260630210100_induction_session_polls_host_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(induction): host poll RPCs (upsert/open/close/get/totals)"
```

---

### Task 3: Migration — learner RPCs (discovery / fetch-to-answer / submit)

**Files:**
- Create: `supabase/migrations/20260630210200_induction_session_polls_learner_rpcs.sql`
- Modify (mirror): `supabase/setup/02_functions.sql`

**Interfaces:**
- Consumes: Task 1 tables; existing `get_my_learner_id()`, `induction_enrollment`.
- Produces (consumed by Task 5/7):
  - `fn_induction_session_poll_for_learner() → TABLE(poll_id, session_id, event_id, event_name, title, day_number, auto_close_at, already_answered)`
  - `fn_induction_get_poll_for_answering(p_poll_id uuid) → jsonb`
  - `fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb) → void`

- [ ] **Step 1: Write the learner-RPC SQL**

```sql
-- 20260630210200_induction_session_polls_learner_rpcs.sql

-- A learner's currently-open polls (enrolled + their batch), with already_answered.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_for_learner()
RETURNS TABLE (poll_id uuid, session_id uuid, event_id uuid, event_name text, title text,
               day_number integer, auto_close_at timestamptz, already_answered boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.session_id, p.event_id, ev.name, es.title, es.day_number, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.learner_id = v_learner)
  FROM public.induction_session_poll p
  JOIN public.event_sessions es ON es.id = p.session_id
  JOIN public.events ev         ON ev.id = p.event_id
  JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = v_learner
  WHERE p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
  ORDER BY p.issued_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_for_learner() TO authenticated;

-- helper: may THIS learner answer THIS poll? (enrolled + batch + open)
CREATE OR REPLACE FUNCTION public._fn_induction_learner_can_answer_poll(p_poll_id uuid, p_learner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.induction_session_poll p
    JOIN public.event_sessions es ON es.id = p.session_id
    JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = p_learner
    WHERE p.id = p_poll_id AND p.status='open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
      AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
  ) INTO v_ok;
  RETURN coalesce(v_ok,false);
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) TO authenticated;

-- Questions/options to render + my prior answers (so I can change while open).
CREATE OR REPLACE FUNCTION public.fn_induction_get_poll_for_answering(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_questions jsonb; v_mine jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not allowed'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  SELECT coalesce(jsonb_object_agg(question_id, opts),'{}'::jsonb) INTO v_mine FROM (
    SELECT question_id, jsonb_agg(option_id) AS opts
    FROM public.induction_session_poll_vote WHERE poll_id = p_poll_id AND learner_id = v_learner
    GROUP BY question_id
  ) m;

  RETURN jsonb_build_object('poll_id', p_poll_id, 'questions', v_questions, 'my_answers', v_mine);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

-- Submit/replace a learner's ballot. p_answers = [{question_id, option_ids:[...]}].
CREATE OR REPLACE FUNCTION public.fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; a jsonb; v_qid uuid; v_kind text; v_opts uuid[]; v_oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_submit_poll_response: not allowed'; END IF;

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) LOOP
    v_qid := (a->>'question_id')::uuid;
    SELECT kind INTO v_kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = p_poll_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: question not in poll'; END IF;

    SELECT coalesce(array_agg((e)::uuid),'{}') INTO v_opts
    FROM jsonb_array_elements_text(coalesce(a->'option_ids','[]'::jsonb)) e;

    IF v_kind = 'single' AND array_length(v_opts,1) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: single-choice needs exactly one option'; END IF;

    -- every option must belong to this question
    IF EXISTS (SELECT 1 FROM unnest(v_opts) x(oid)
               WHERE NOT EXISTS (SELECT 1 FROM public.induction_session_poll_option o WHERE o.id = x.oid AND o.question_id = v_qid)) THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: option does not belong to question'; END IF;

    DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
    FOREACH v_oid IN ARRAY v_opts LOOP
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner);
    END LOOP;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration` (name `induction_session_polls_learner_rpcs`).

- [ ] **Step 3: Verify** the 3 functions + helper exist (`SELECT proname FROM pg_proc WHERE proname LIKE 'fn_induction_%poll%' OR proname = '_fn_induction_learner_can_answer_poll';`).

- [ ] **Step 4: Mirror** into `supabase/setup/02_functions.sql`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260630210200_induction_session_polls_learner_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(induction): learner poll RPCs (discover/answer/submit)"
```

---

### Task 4: Register the 4 tables in `types/supabase.ts`

**Files:**
- Modify: `types/supabase.ts`

**Interfaces:**
- Produces: `Database['public']['Tables']` entries so `.from('induction_session_poll*')` typechecks. (Service uses RPCs, but the tables must be registered to avoid TS2769 if any `.from()` is added.)

- [ ] **Step 1: Add the 4 table definitions** under `Tables` in `types/supabase.ts`, following the shape of an existing simple table there. Each needs `Row`, `Insert`, `Update`, and `Relationships: []`. Example for the poll table (repeat the pattern for question/option/vote with their columns from Task 1):

```ts
induction_session_poll: {
  Row: { id: string; session_id: string; event_id: string; institution_id: string;
         status: string; issued_at: string | null; auto_close_at: string | null;
         created_by: string | null; created_at: string; updated_at: string };
  Insert: { id?: string; session_id: string; event_id: string; institution_id: string;
            status?: string; issued_at?: string | null; auto_close_at?: string | null;
            created_by?: string | null; created_at?: string; updated_at?: string };
  Update: { id?: string; session_id?: string; event_id?: string; institution_id?: string;
            status?: string; issued_at?: string | null; auto_close_at?: string | null;
            created_by?: string | null; created_at?: string; updated_at?: string };
  Relationships: [];
};
```

- [ ] **Step 2: Verify** with `mcp__ide__getDiagnostics` on `types/supabase.ts` — expected: no new errors.

- [ ] **Step 3: Commit**
```bash
git add types/supabase.ts
git commit -m "feat(induction): register poll tables in supabase types"
```

---

### Task 5: Service — `induction-poll-service.ts`

**Files:**
- Create: `lib/services/induction/induction-poll-service.ts`

**Interfaces:**
- Consumes: RPCs from Tasks 2–3.
- Produces (consumed by UI Tasks 6–7): class `InductionPollService` with methods + exported types `PollQuestionDraft`, `PollStructure`, `PollTotals`, `OpenPollForLearner`, `PollForAnswering`.

- [ ] **Step 1: Write the service** (mirror `induction-pulse-service.ts`)

```ts
// lib/services/induction/induction-poll-service.ts
// Per-session induction opinion polls — thin client over the DEFINER RPCs in
// 20260630210100/210200. Host + learner methods together (two ends of one feature),
// mirroring induction-pulse-service.ts.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export interface PollOptionDraft { id?: string; label: string; position: number }
export interface PollQuestionDraft { id?: string; prompt: string; kind: 'single' | 'multi'; position: number; options: PollOptionDraft[] }

export interface PollStructure {
  id: string; session_id: string; status: 'draft' | 'open' | 'closed';
  auto_close_at: string | null; has_votes: boolean;
  questions: { id: string; prompt: string; kind: 'single' | 'multi'; position: number;
               options: { id: string; label: string; position: number }[] }[];
}
export interface PollTotals {
  status: 'draft' | 'open' | 'closed'; auto_close_at: string | null;
  enrolled_count: number; response_count: number; suppressed: boolean;
  questions: { id: string; prompt: string; kind: 'single' | 'multi'; response_count: number;
               options: { id: string; label: string; count: number | null }[] }[];
}
export interface OpenPollForLearner {
  poll_id: string; session_id: string; event_id: string; event_name: string | null;
  title: string | null; day_number: number | null; auto_close_at: string; already_answered: boolean;
}
export interface PollForAnswering {
  poll_id: string;
  questions: { id: string; prompt: string; kind: 'single' | 'multi'; options: { id: string; label: string }[] }[];
  my_answers: Record<string, string[]>;
}

export class InductionPollService {
  // ── Host ──
  static async upsertPoll(sessionId: string, questions: PollQuestionDraft[]): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_induction_upsert_session_poll', {
      p_session_id: sessionId, p_questions: questions,
    });
    if (error) throw error;
    return data as string;
  }
  static async getPoll(sessionId: string): Promise<PollStructure | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_get_session_poll', { p_session_id: sessionId });
    if (error) throw error;
    return (data as PollStructure) ?? null;
  }
  static async openPoll(sessionId: string) {
    const { data, error } = await getSupabase().rpc('fn_induction_open_session_poll', { p_session_id: sessionId });
    if (error) throw error;
    return data;
  }
  static async closePoll(pollId: string) {
    const { data, error } = await getSupabase().rpc('fn_induction_close_session_poll', { p_poll_id: pollId });
    if (error) throw error;
    return data;
  }
  static async getTotals(pollId: string): Promise<PollTotals | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_totals', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollTotals) ?? null;
  }
  // ── Learner ──
  static async getMyOpenPolls(): Promise<OpenPollForLearner[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_for_learner');
    if (error) throw error;
    return (data as OpenPollForLearner[]) ?? [];
  }
  static async getForAnswering(pollId: string): Promise<PollForAnswering | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_get_poll_for_answering', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollForAnswering) ?? null;
  }
  static async submit(pollId: string, answers: { question_id: string; option_ids: string[] }[]): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_submit_poll_response', { p_poll_id: pollId, p_answers: answers });
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Verify** with `mcp__ide__getDiagnostics` on the new file — expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add lib/services/induction/induction-poll-service.ts
git commit -m "feat(induction): poll service over the DEFINER RPCs"
```

---

### Task 6: Host UI — `session-poll-dialog.tsx` + wire into `sessions-section.tsx`

**Files:**
- Create: `app/(routes)/events/induction/[id]/_components/session-poll-dialog.tsx`
- Modify: `app/(routes)/events/induction/[id]/_components/sessions-section.tsx` (import the dialog; render a `<SessionPollDialog sessionId={s.id} sessionTitle={s.title} />` button in the per-session actions row beside `<AttendanceDialog … />` near line 397)

**Interfaces:**
- Consumes: `InductionPollService` (Task 5).

- [ ] **Step 1: Build the dialog component.** It has three regions inside a Shadcn `Dialog`: (a) a question builder (repeater modeled on the resource-links repeater in `sessions-section.tsx:292-311`); (b) Open live / Close buttons; (c) a live-results panel that polls `getTotals` every 8s while open (model the polling on `SessionPulseControl` — `setInterval(..., 8000)`, clear on unmount/close). On open of the dialog, call `InductionPollService.getPoll(sessionId)` to load existing structure; "Save poll" calls `upsertPoll`. Disable destructive edits (remove question/option) when `poll.has_votes` is true (tooltip: "has votes — can't delete"). Full code:

```tsx
'use client';
// Host poll manager for ONE induction session: build questions, open/close the
// live poll, and watch anonymized live tallies (k>=3 floor). Mirrors the
// SessionPulseControl polling pattern and the resource-links repeater UX.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Plus, X, Radio, Square } from 'lucide-react';
import { InductionPollService, type PollQuestionDraft, type PollTotals } from '@/lib/services/induction/induction-poll-service';

export function SessionPollDialog({ sessionId, sessionTitle }: { sessionId: string; sessionTitle: string }) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<PollQuestionDraft[]>([]);
  const [pollId, setPollId] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'open' | 'closed'>('draft');
  const [hasVotes, setHasVotes] = useState(false);
  const [totals, setTotals] = useState<PollTotals | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  const load = useCallback(async () => {
    try {
      const p = await InductionPollService.getPoll(sessionId);
      if (p) {
        setPollId(p.id); setStatus(p.status); setHasVotes(p.has_votes);
        setQuestions(p.questions.map((q) => ({ id: q.id, prompt: q.prompt, kind: q.kind, position: q.position,
          options: q.options.map((o) => ({ id: o.id, label: o.label, position: o.position })) })));
        if (p.status === 'open') { await refresh(p.id); startPoll(p.id); }
      } else { setQuestions([]); setPollId(null); setStatus('draft'); setHasVotes(false); }
    } catch (e: any) { toast.error(e?.message ?? 'Could not load poll'); }
  }, [sessionId]);

  async function refresh(pid: string) {
    try { const t = await InductionPollService.getTotals(pid); setTotals(t);
      if (t && t.status !== 'open') { stop(); setStatus(t.status); } } catch { /* keep last */ }
  }
  function startPoll(pid: string) { stop(); timer.current = setInterval(() => refresh(pid), 8000); }

  useEffect(() => { if (open) load(); else { stop(); setTotals(null); } }, [open, load]);

  // builder mutations
  const addQuestion = () => setQuestions((qs) => [...qs, { prompt: '', kind: 'single', position: qs.length, options: [{ label: '', position: 0 }] }]);
  const setQ = (i: number, patch: Partial<PollQuestionDraft>) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, ...patch } : q));
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));
  const addOpt = (i: number) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: [...q.options, { label: '', position: q.options.length }] } : q));
  const setOpt = (i: number, k: number, label: string) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.map((o, m) => m === k ? { ...o, label } : o) } : q));
  const removeOpt = (i: number, k: number) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.filter((_, m) => m !== k) } : q));

  const savePoll = async () => {
    // normalize positions; drop empty options/questions
    const payload = questions
      .map((q, i) => ({ ...q, position: i, options: q.options.filter((o) => o.label.trim()).map((o, k) => ({ ...o, position: k })) }))
      .filter((q) => q.prompt.trim() && q.options.length >= 2);
    if (!payload.length) { toast.error('Add at least one question with two options.'); return; }
    setBusy(true);
    try { const id = await InductionPollService.upsertPoll(sessionId, payload); setPollId(id); toast.success('Poll saved.'); await load(); }
    catch (e: any) { toast.error(e?.message ?? 'Could not save poll'); } finally { setBusy(false); }
  };
  const openLive = async () => { setBusy(true); try { await InductionPollService.openPoll(sessionId); toast.success('Poll is live.'); await load(); } catch (e: any) { toast.error(e?.message ?? 'Could not open'); } finally { setBusy(false); } };
  const closeLive = async () => { if (!pollId) return; setBusy(true); try { await InductionPollService.closePoll(pollId); stop(); setStatus('closed'); toast.success('Poll closed.'); } catch (e: any) { toast.error(e?.message ?? 'Could not close'); } finally { setBusy(false); } };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Poll"><BarChart3 className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Poll — {sessionTitle}
            <Badge variant={status === 'open' ? 'default' : 'secondary'}>{status}</Badge></DialogTitle>
          <DialogDescription>Build questions, open it live, and watch anonymized results (hidden until 3 answers).</DialogDescription>
        </DialogHeader>

        {/* live results when open */}
        {status === 'open' && totals && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-3">
            <div className="text-xs text-muted-foreground">{totals.response_count}{totals.enrolled_count ? ` / ${totals.enrolled_count}` : ''} answered{totals.suppressed ? ' · results hidden until 3' : ''}</div>
            {totals.questions.map((q) => {
              const tot = q.options.reduce((a, o) => a + (o.count ?? 0), 0) || 1;
              return (
                <div key={q.id} className="space-y-1">
                  <div className="text-sm font-medium">{q.prompt}</div>
                  {q.options.map((o) => (
                    <div key={o.id} className="text-xs">
                      <div className="flex justify-between"><span>{o.label}</span><span className="tabular-nums">{o.count ?? '–'}{o.count != null ? ` (${Math.round((o.count / tot) * 100)}%)` : ''}</span></div>
                      <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${o.count != null ? Math.round((o.count / tot) * 100) : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* builder */}
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id ?? i} className="rounded-md border p-2 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Question" value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
                <Select value={q.kind} onValueChange={(v) => setQ(i, { kind: v as 'single' | 'multi' })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="single">Pick one</SelectItem><SelectItem value="multi">Pick many</SelectItem></SelectContent>
                </Select>
                <Button size="icon" variant="ghost" disabled={hasVotes} onClick={() => removeQ(i)}><X className="h-4 w-4" /></Button>
              </div>
              {q.options.map((o, k) => (
                <div key={o.id ?? k} className="flex gap-2 pl-3">
                  <Input placeholder={`Option ${k + 1}`} value={o.label} onChange={(e) => setOpt(i, k, e.target.value)} />
                  <Button size="icon" variant="ghost" disabled={hasVotes} onClick={() => removeOpt(i, k)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => addOpt(i)}><Plus className="h-3.5 w-3.5 mr-1" /> Option</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addQuestion}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={savePoll} disabled={busy}>Save poll</Button>
          {status !== 'open'
            ? <Button onClick={openLive} disabled={busy || !pollId}><Radio className="h-4 w-4 mr-1" /> Open live</Button>
            : <Button variant="secondary" onClick={closeLive} disabled={busy}><Square className="h-4 w-4 mr-1" /> Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into `sessions-section.tsx`.** Add the import near the other `_components` imports (line ~16): `import { SessionPollDialog } from './session-poll-dialog';`. In the per-session actions block (`sessions-section.tsx:396-400`), add before the edit button:
```tsx
<SessionPollDialog sessionId={s.id} sessionTitle={s.title} />
```

- [ ] **Step 3: Verify** with `mcp__ide__getDiagnostics` on both files — expected: no errors.

- [ ] **Step 4: Browser exercise** (as a coordinator/super-admin): open an induction event detail → a session row → Poll → add a "Pick one" question with 3 options + a "Pick many" question → Save → Open live. Confirm status badge flips to `open` and the live panel renders with "0 answered".

- [ ] **Step 5: Commit**
```bash
git add "app/(routes)/events/induction/[id]/_components/session-poll-dialog.tsx" "app/(routes)/events/induction/[id]/_components/sessions-section.tsx"
git commit -m "feat(induction): host poll dialog (build + open/close + live results)"
```

---

### Task 7: Learner UI — `session-poll-banner.tsx` + mount on my-induction pages

**Files:**
- Create: `app/(routes)/learners/my-induction/_components/session-poll-banner.tsx`
- Modify: `app/(routes)/learners/my-induction/page.tsx` (mount `<SessionPollBanner />` near the pulse banner); also `app/(routes)/my-induction-sessions/page.tsx` if it shows the pulse banner.

**Interfaces:**
- Consumes: `InductionPollService.getMyOpenPolls / getForAnswering / submit` (Task 5).

- [ ] **Step 1: Build the banner + answer form** (mirror `induction-pulse-banner.tsx`)

```tsx
'use client';
// Learner-facing open-poll prompt for induction sessions. Lists my open polls
// (enrolled + my batch, server-gated), opens an answer form (radio for single,
// checkboxes for multi), submits, and lets me change while open. No results
// shown to learners (host-only). Mirrors induction-pulse-banner.tsx.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { BarChart3 } from 'lucide-react';
import { InductionPollService, type OpenPollForLearner, type PollForAnswering } from '@/lib/services/induction/induction-poll-service';

export function SessionPollBanner() {
  const [polls, setPolls] = useState<OpenPollForLearner[]>([]);
  const [active, setActive] = useState<PollForAnswering | null>(null);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPolls(await InductionPollService.getMyOpenPolls()); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = async (pollId: string) => {
    try { const f = await InductionPollService.getForAnswering(pollId); setActive(f); setPicks(f?.my_answers ?? {}); }
    catch (e: any) { toast.error(e?.message ?? 'Could not load poll'); }
  };
  const toggle = (qid: string, oid: string, multi: boolean) => setPicks((p) => {
    const cur = p[qid] ?? [];
    if (multi) return { ...p, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    return { ...p, [qid]: [oid] };
  });
  const submit = async () => {
    if (!active) return;
    const answers = active.questions.map((q) => ({ question_id: q.id, option_ids: picks[q.id] ?? [] }))
      .filter((a) => a.option_ids.length);
    setBusy(true);
    try { await InductionPollService.submit(active.poll_id, answers); toast.success('Submitted — you can change your answers while the poll is open.'); setActive(null); await load(); }
    catch (e: any) { toast.error(e?.message ?? 'Could not submit'); } finally { setBusy(false); }
  };

  if (!polls.length && !active) return null;

  if (active) {
    return (
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4" /> Session poll</div>
        {active.questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <div className="text-sm">{q.prompt}</div>
            {q.kind === 'single' ? (
              <RadioGroup value={(picks[q.id] ?? [])[0] ?? ''} onValueChange={(v) => toggle(q.id, v, false)}>
                {q.options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <RadioGroupItem value={o.id} id={`${q.id}-${o.id}`} /><Label htmlFor={`${q.id}-${o.id}`}>{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <Checkbox id={`${q.id}-${o.id}`} checked={(picks[q.id] ?? []).includes(o.id)} onCheckedChange={() => toggle(q.id, o.id, true)} />
                  <Label htmlFor={`${q.id}-${o.id}`}>{o.label}</Label>
                </div>
              ))
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={busy}>Submit</Button>
          <Button size="sm" variant="ghost" onClick={() => setActive(null)} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {polls.map((p) => (
        <button key={p.poll_id} onClick={() => openForm(p.poll_id)}
          className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-accent">
          <span className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4" /> {p.title ?? 'Session poll'} — tap to answer</span>
          <span className="text-xs text-muted-foreground">{p.already_answered ? 'change answer' : 'new'}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify** `Checkbox` and `RadioGroup` exist at `@/components/ui/checkbox` and `@/components/ui/radio-group` (Glob `components/ui/{checkbox,radio-group}.tsx`). If a name differs, adjust the import. Run `mcp__ide__getDiagnostics` on the new file.

- [ ] **Step 3: Mount** `<SessionPollBanner />` in `app/(routes)/learners/my-induction/page.tsx` near where the pulse banner is rendered (Grep for `InductionPulseBanner` / `induction-pulse-banner` to find the spot). If `/my-induction-sessions/page.tsx` renders the pulse banner, mount it there too. Run `getDiagnostics` on the modified page(s).

- [ ] **Step 4: Browser exercise** (end-to-end): with the poll opened in Task 6, log in as an enrolled fresher of that batch → `/learners/my-induction` → the poll banner appears → answer both questions → Submit → toast confirms. Back as host (Task 6 dialog), confirm `response_count` increments on the next 8s refresh (counts stay suppressed until 3 distinct learners answer). Re-open as the learner and confirm prior picks are pre-selected; change one and confirm it updates.

- [ ] **Step 5: Commit**
```bash
git add "app/(routes)/learners/my-induction/_components/session-poll-banner.tsx" "app/(routes)/learners/my-induction/page.tsx"
git commit -m "feat(induction): learner session-poll answer banner"
```

---

## Self-Review (done by plan author)

- **Spec coverage:** §4 model → Task 1; §6 host RPCs → Task 2; §6 learner RPCs → Task 3; types → Task 4; service → Task 5; §7 host UI → Task 6; §7 learner UI → Task 7. k≥3 floor → totals RPC (Task 2). Edit-lock-on-votes → upsert RPC (Task 2) + `hasVotes`-disabled controls (Task 6). All covered.
- **Type consistency:** `PollQuestionDraft`/`PollStructure`/`PollTotals`/`OpenPollForLearner`/`PollForAnswering` defined in Task 5 and consumed unchanged in Tasks 6–7. RPC names identical across SQL (Tasks 2–3) and service (Task 5).
- **Open verification points the implementer must confirm at runtime:** (a) `induction_touch_updated_at` exists (Task 1 Step 2); (b) the learner identity used by `induction_enrollment.learner_id` / `get_my_learner_id()` matches the `learner_id` written to votes — they must be the same domain (Task 3 relies on it); (c) Shadcn `Checkbox`/`RadioGroup` import paths (Task 7 Step 2).
```
