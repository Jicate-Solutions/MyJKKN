-- Rehearsal stubs: the minimum of production MyJKKN the adoption migrations touch.
-- Shapes copied from jicate/main supabase/setup/01_tables.sql + 02_functions.sql.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.institutions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name varchar(255) NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), email text, full_name text,
  role text NOT NULL DEFAULT 'student', profile_completed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true, is_super_admin boolean, institution_id uuid, department_id uuid);
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), role_key varchar(50) NOT NULL UNIQUE, role_name varchar(50) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE, is_primary boolean DEFAULT false,
  UNIQUE(user_id, role_id));
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), title text NOT NULL, body text NOT NULL, url text, icon text,
  created_by uuid NOT NULL, targeting jsonb NOT NULL, priority text DEFAULT 'normal', metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  category text DEFAULT 'general', sent_at timestamptz DEFAULT now(), expires_at timestamptz,
  requires_acknowledgment boolean DEFAULT false, acknowledgment_deadline_hours integer DEFAULT 4,
  action_type text, action_config jsonb);
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), notification_id uuid NOT NULL, user_id uuid NOT NULL,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz);
CREATE TABLE public.loop_registry (
  loop_key text PRIMARY KEY, name text NOT NULL, stack_tier integer NOT NULL DEFAULT 3 CHECK (stack_tier BETWEEN 1 AND 5),
  loop_class text NOT NULL DEFAULT 'cadence' CHECK (loop_class IN ('self_improving','cadence','accountability','intake','infrastructure')),
  domain text, description text, gates jsonb NOT NULL DEFAULT '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb,
  routine_id text, owner_email text, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true); $$;
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND (is_super_admin = true OR role IN ('admin','super_admin','administrator'))); $$;
