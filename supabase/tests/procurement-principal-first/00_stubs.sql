-- Rehearsal stubs: the minimum of production MyJKKN that the procurement approval-chain
-- migrations touch. Columns are only the ones those migrations read or write; shapes of the
-- shared tables follow supabase/setup/01_tables.sql (custom_roles.role_key is varchar there).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role' $$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(255) NOT NULL);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid, department_name varchar(255) NOT NULL,
  display_name varchar(255), head_of_department_id uuid);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, full_name text,
  role text NOT NULL DEFAULT 'staff', is_active boolean NOT NULL DEFAULT true,
  is_login_disabled boolean DEFAULT false, is_super_admin boolean, institution_id uuid, department_id uuid);
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), role_key varchar(50) NOT NULL UNIQUE, role_name varchar(50) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE, UNIQUE (user_id, role_id));

CREATE TABLE public.procurement_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_number text, title text,
  institution_id uuid REFERENCES institutions(id), requested_by uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'draft', approved_by uuid, approved_at timestamptz, updated_at timestamptz,
  notes text, returned_reason text, returned_by uuid, returned_at timestamptz, return_count int,
  rejection_reason text, submitted_at timestamptz DEFAULT now());
CREATE TABLE public.procurement_purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES procurement_purchase_requests(id),
  item_name text, unit_label text, required_quantity numeric, original_quantity numeric,
  quantity_modified_by uuid, quantity_modified_at timestamptz);
CREATE TABLE public.procurement_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_request_id uuid, institution_id uuid, status text,
  award_rejection_reason text, award_submitted_at timestamptz, updated_at timestamptz);
CREATE TABLE public.procurement_rfq_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rfq_id uuid);
CREATE TABLE public.procurement_quotations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rfq_id uuid, supplier_id uuid);
CREATE TABLE public.procurement_quotation_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quotation_id uuid);
CREATE TABLE public.ims_suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
-- Only its row type is needed (procurement_award_create_pos returns SETOF it).
CREATE TABLE public.procurement_purchase_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rfq_id uuid);
-- 20271006130000 revokes it before re-creating it (it existed live from 20270401090000).
CREATE FUNCTION public.procurement_approve_award(p_rfq_id uuid) RETURNS SETOF public.procurement_purchase_orders
LANGUAGE sql AS $$ SELECT * FROM procurement_purchase_orders WHERE false $$;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, body text, url text, created_by uuid,
  targeting jsonb, priority text, category text, metadata jsonb, idempotency_key text);
CREATE UNIQUE INDEX ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.user_notifications (notification_id uuid, user_id uuid, UNIQUE (notification_id, user_id));

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), false) $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                  WHERE ur.user_id = auth.uid() AND (cr.permissions ->> p)::boolean) $$;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.fn_procurement_notify_request_submitted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NULL; END $$;
