-- ============================================================================
-- Campus Living — Staging Parity Migration
-- ============================================================================
-- Created: 2026-04-15
-- Source: Extracted from staging Supabase (hhprjbgknupaplivtoib) campus-living schema
-- Purpose: Add 15 tables + 12 enums that exist on staging but not in the
--          original 4 campus-living migrations (20260222000015-20260302000001).
-- Prerequisites: Run AFTER the 4 original migrations.
-- Target: production Supabase (kvizhngldtiuufknvehv), which has no hostel_*
--         or mess_* tables currently.
-- ============================================================================

-- ===== 12 missing enums (idempotent DO blocks) =====
DO $$ BEGIN CREATE TYPE public.amc_status_enum AS ENUM ('active', 'expiring_soon', 'expired', 'renewed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cleaning_task_status_enum AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'rescheduled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cleaning_type_enum AS ENUM ('daily_sweep', 'daily_mop', 'toilet_cleaning', 'common_area', 'deep_cleaning', 'window_cleaning', 'water_tank', 'disinfection', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.health_case_status_enum AS ENUM ('reported', 'first_aid', 'doctor_referred', 'hospitalized', 'recovering', 'cleared', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.health_severity_enum AS ENUM ('minor', 'moderate', 'serious', 'emergency'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.laundry_order_status_enum AS ENUM ('submitted', 'collected', 'washing', 'ready', 'delivered', 'disputed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.laundry_service_type_enum AS ENUM ('in_house', 'vendor'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.onboarding_status_enum AS ENUM ('not_started', 'in_progress', 'completed', 'skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pm_frequency_enum AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pm_schedule_status_enum AS ENUM ('active', 'paused', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pulse_frequency_enum AS ENUM ('weekly', 'biweekly', 'monthly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pulse_status_enum AS ENUM ('draft', 'active', 'paused', 'completed', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 15 tables + indexes + constraints + RLS + triggers =====
CREATE TABLE public.hostel_amc_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    block_id uuid,
    title text NOT NULL,
    vendor_name text NOT NULL,
    vendor_phone text,
    vendor_email text,
    category public.maintenance_category_enum NOT NULL,
    contract_number text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    renewal_reminder_days integer DEFAULT 30,
    annual_cost numeric(15,2),
    coverage_details text,
    document_urls text[],
    status public.amc_status_enum DEFAULT 'active'::public.amc_status_enum NOT NULL,
    last_service_date date,
    next_service_date date,
    service_frequency public.pm_frequency_enum,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_cleaning_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_cleaning_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    block_id uuid,
    floor_number integer,
    cleaning_type public.cleaning_type_enum NOT NULL,
    frequency public.pm_frequency_enum NOT NULL,
    scheduled_time time without time zone DEFAULT '06:00:00'::time without time zone,
    assigned_staff text,
    assigned_staff_phone text,
    checklist jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_cleaning_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_cleaning_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    block_id uuid,
    floor_number integer,
    date date NOT NULL,
    cleaning_type public.cleaning_type_enum NOT NULL,
    assigned_staff text,
    status public.cleaning_task_status_enum DEFAULT 'scheduled'::public.cleaning_task_status_enum NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by text,
    quality_rating integer,
    inspector_notes text,
    photo_urls text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_community_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_community_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    show_lc_events boolean DEFAULT true,
    show_lc_announcements boolean DEFAULT true,
    show_lc_polls boolean DEFAULT true,
    event_scope_filter text[] DEFAULT '{campus,institution_wide}'::text[],
    max_events_shown integer DEFAULT 10,
    max_announcements_shown integer DEFAULT 5,
    max_polls_shown integer DEFAULT 3,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_emergency_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    block_id uuid,
    learner_id uuid,
    contact_name text NOT NULL,
    relationship text,
    phone text NOT NULL,
    alt_phone text,
    email text,
    address text,
    is_primary boolean DEFAULT false,
    contact_type text DEFAULT 'parent'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hostel_health_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_health_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    block_id uuid,
    case_number text NOT NULL,
    symptoms text NOT NULL,
    severity public.health_severity_enum DEFAULT 'minor'::public.health_severity_enum NOT NULL,
    temperature numeric(4,1),
    status public.health_case_status_enum DEFAULT 'reported'::public.health_case_status_enum NOT NULL,
    first_aid_given text,
    first_aid_by text,
    first_aid_at timestamp with time zone,
    doctor_name text,
    doctor_referral_at timestamp with time zone,
    hospital_name text,
    diagnosis text,
    medication text,
    parent_notified boolean DEFAULT false,
    parent_notified_at timestamp with time zone,
    parent_notified_by uuid,
    recovery_notes text,
    cleared_by uuid,
    cleared_at timestamp with time zone,
    follow_up_dates date[],
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_laundry_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_laundry_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    block_id uuid,
    service_type public.laundry_service_type_enum DEFAULT 'vendor'::public.laundry_service_type_enum NOT NULL,
    vendor_name text,
    vendor_phone text,
    vendor_contract_start date,
    vendor_contract_end date,
    collection_days integer[] DEFAULT '{1,4}'::integer[],
    delivery_days integer[] DEFAULT '{3,6}'::integer[],
    max_items_per_student integer DEFAULT 15,
    cost_per_item numeric(10,2),
    is_included_in_fees boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_laundry_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_laundry_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    block_id uuid NOT NULL,
    config_id uuid,
    order_number text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_items integer NOT NULL,
    total_returned integer DEFAULT 0,
    total_damaged integer DEFAULT 0,
    total_missing integer DEFAULT 0,
    status public.laundry_order_status_enum DEFAULT 'submitted'::public.laundry_order_status_enum NOT NULL,
    collected_at timestamp with time zone,
    ready_at timestamp with time zone,
    delivered_at timestamp with time zone,
    student_confirmed boolean DEFAULT false,
    dispute_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_onboarding_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_onboarding_checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    allocation_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    template_id uuid,
    status public.onboarding_status_enum DEFAULT 'not_started'::public.onboarding_status_enum NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_onboarding_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_onboarding_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text DEFAULT 'Default Onboarding'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_pm_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_pm_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    block_id uuid,
    title text NOT NULL,
    description text,
    category public.maintenance_category_enum NOT NULL,
    priority public.maintenance_priority_enum DEFAULT 'medium'::public.maintenance_priority_enum NOT NULL,
    frequency public.pm_frequency_enum NOT NULL,
    day_of_week integer,
    day_of_month integer,
    month_of_year integer,
    time_of_day time without time zone DEFAULT '09:00:00'::time without time zone,
    assigned_to_name text,
    assigned_to_phone text,
    vendor_name text,
    estimated_cost numeric(15,2),
    checklist jsonb,
    next_due_date date NOT NULL,
    last_completed_date date,
    total_completions integer DEFAULT 0,
    status public.pm_schedule_status_enum DEFAULT 'active'::public.pm_schedule_status_enum NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_pm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_pm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    block_id uuid,
    due_date date NOT NULL,
    title text NOT NULL,
    category public.maintenance_category_enum NOT NULL,
    priority public.maintenance_priority_enum NOT NULL,
    assigned_to_name text,
    assigned_to_phone text,
    checklist jsonb,
    status public.maintenance_status_enum DEFAULT 'open'::public.maintenance_status_enum NOT NULL,
    completed_by uuid,
    completed_at timestamp with time zone,
    completion_notes text,
    photo_urls text[],
    cost_actual numeric(15,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_pulse_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_pulse_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    frequency public.pulse_frequency_enum DEFAULT 'weekly'::public.pulse_frequency_enum NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_blocks uuid[],
    status public.pulse_status_enum DEFAULT 'draft'::public.pulse_status_enum NOT NULL,
    starts_at date,
    ends_at date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_pulse_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_pulse_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    config_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    period_start date NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    overall_mood integer,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: hostel_safety_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_safety_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    block_id uuid,
    equipment_type text NOT NULL,
    name text NOT NULL,
    location text,
    serial_number text,
    last_inspection_date date,
    next_inspection_date date,
    status text DEFAULT 'active'::text NOT NULL,
    condition text,
    notes text,
    installed_date date,
    warranty_expiry date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hostel_amc_contracts hostel_amc_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_amc_contracts
    ADD CONSTRAINT hostel_amc_contracts_pkey PRIMARY KEY (id);


--
-- Name: hostel_cleaning_schedules hostel_cleaning_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_schedules
    ADD CONSTRAINT hostel_cleaning_schedules_pkey PRIMARY KEY (id);


--
-- Name: hostel_cleaning_tasks hostel_cleaning_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_tasks
    ADD CONSTRAINT hostel_cleaning_tasks_pkey PRIMARY KEY (id);


--
-- Name: hostel_cleaning_tasks hostel_cleaning_tasks_schedule_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_tasks
    ADD CONSTRAINT hostel_cleaning_tasks_schedule_id_date_key UNIQUE (schedule_id, date);


--
-- Name: hostel_community_config hostel_community_config_institution_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_community_config
    ADD CONSTRAINT hostel_community_config_institution_id_key UNIQUE (institution_id);


--
-- Name: hostel_community_config hostel_community_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_community_config
    ADD CONSTRAINT hostel_community_config_pkey PRIMARY KEY (id);


--
-- Name: hostel_emergency_contacts hostel_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_emergency_contacts
    ADD CONSTRAINT hostel_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: hostel_health_cases hostel_health_cases_case_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_case_number_key UNIQUE (case_number);


--
-- Name: hostel_health_cases hostel_health_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_pkey PRIMARY KEY (id);


--
-- Name: hostel_laundry_configs hostel_laundry_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_configs
    ADD CONSTRAINT hostel_laundry_configs_pkey PRIMARY KEY (id);


--
-- Name: hostel_laundry_orders hostel_laundry_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_orders
    ADD CONSTRAINT hostel_laundry_orders_order_number_key UNIQUE (order_number);


--
-- Name: hostel_laundry_orders hostel_laundry_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_orders
    ADD CONSTRAINT hostel_laundry_orders_pkey PRIMARY KEY (id);


--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_allocation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_checklists
    ADD CONSTRAINT hostel_onboarding_checklists_allocation_id_key UNIQUE (allocation_id);


--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_checklists
    ADD CONSTRAINT hostel_onboarding_checklists_pkey PRIMARY KEY (id);


--
-- Name: hostel_onboarding_templates hostel_onboarding_templates_institution_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_templates
    ADD CONSTRAINT hostel_onboarding_templates_institution_id_name_key UNIQUE (institution_id, name);


--
-- Name: hostel_onboarding_templates hostel_onboarding_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_templates
    ADD CONSTRAINT hostel_onboarding_templates_pkey PRIMARY KEY (id);


--
-- Name: hostel_pm_schedules hostel_pm_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_schedules
    ADD CONSTRAINT hostel_pm_schedules_pkey PRIMARY KEY (id);


--
-- Name: hostel_pm_tasks hostel_pm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_tasks
    ADD CONSTRAINT hostel_pm_tasks_pkey PRIMARY KEY (id);


--
-- Name: hostel_pm_tasks hostel_pm_tasks_schedule_id_due_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_tasks
    ADD CONSTRAINT hostel_pm_tasks_schedule_id_due_date_key UNIQUE (schedule_id, due_date);


--
-- Name: hostel_pulse_configs hostel_pulse_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_configs
    ADD CONSTRAINT hostel_pulse_configs_pkey PRIMARY KEY (id);


--
-- Name: hostel_pulse_responses hostel_pulse_responses_config_id_learner_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_responses
    ADD CONSTRAINT hostel_pulse_responses_config_id_learner_id_period_start_key UNIQUE (config_id, learner_id, period_start);


--
-- Name: hostel_pulse_responses hostel_pulse_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_responses
    ADD CONSTRAINT hostel_pulse_responses_pkey PRIMARY KEY (id);


--
-- Name: hostel_safety_equipment hostel_safety_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_safety_equipment
    ADD CONSTRAINT hostel_safety_equipment_pkey PRIMARY KEY (id);


--
-- Name: idx_hostel_amc_contracts_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_amc_contracts_block ON public.hostel_amc_contracts USING btree (block_id);


--
-- Name: idx_hostel_amc_contracts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_amc_contracts_category ON public.hostel_amc_contracts USING btree (category);


--
-- Name: idx_hostel_amc_contracts_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_amc_contracts_end_date ON public.hostel_amc_contracts USING btree (end_date);


--
-- Name: idx_hostel_amc_contracts_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_amc_contracts_institution ON public.hostel_amc_contracts USING btree (institution_id);


--
-- Name: idx_hostel_amc_contracts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_amc_contracts_status ON public.hostel_amc_contracts USING btree (status);


--
-- Name: idx_hostel_cleaning_schedules_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_schedules_block ON public.hostel_cleaning_schedules USING btree (block_id);


--
-- Name: idx_hostel_cleaning_schedules_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_schedules_institution ON public.hostel_cleaning_schedules USING btree (institution_id);


--
-- Name: idx_hostel_cleaning_schedules_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_schedules_type ON public.hostel_cleaning_schedules USING btree (cleaning_type);


--
-- Name: idx_hostel_cleaning_tasks_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_tasks_block ON public.hostel_cleaning_tasks USING btree (block_id);


--
-- Name: idx_hostel_cleaning_tasks_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_tasks_date ON public.hostel_cleaning_tasks USING btree (date);


--
-- Name: idx_hostel_cleaning_tasks_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_tasks_institution ON public.hostel_cleaning_tasks USING btree (institution_id);


--
-- Name: idx_hostel_cleaning_tasks_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_tasks_schedule ON public.hostel_cleaning_tasks USING btree (schedule_id);


--
-- Name: idx_hostel_cleaning_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_cleaning_tasks_status ON public.hostel_cleaning_tasks USING btree (status);


--
-- Name: idx_hostel_community_config_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_community_config_institution ON public.hostel_community_config USING btree (institution_id);


--
-- Name: idx_hostel_emergency_contacts_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_emergency_contacts_block ON public.hostel_emergency_contacts USING btree (block_id);


--
-- Name: idx_hostel_emergency_contacts_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_emergency_contacts_institution ON public.hostel_emergency_contacts USING btree (institution_id);


--
-- Name: idx_hostel_emergency_contacts_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_emergency_contacts_learner ON public.hostel_emergency_contacts USING btree (learner_id);


--
-- Name: idx_hostel_health_cases_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_health_cases_block ON public.hostel_health_cases USING btree (block_id);


--
-- Name: idx_hostel_health_cases_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_health_cases_institution ON public.hostel_health_cases USING btree (institution_id);


--
-- Name: idx_hostel_health_cases_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_health_cases_learner ON public.hostel_health_cases USING btree (learner_id);


--
-- Name: idx_hostel_health_cases_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_health_cases_severity ON public.hostel_health_cases USING btree (severity);


--
-- Name: idx_hostel_health_cases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_health_cases_status ON public.hostel_health_cases USING btree (status);


--
-- Name: idx_hostel_laundry_configs_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_configs_block ON public.hostel_laundry_configs USING btree (block_id);


--
-- Name: idx_hostel_laundry_configs_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_configs_institution ON public.hostel_laundry_configs USING btree (institution_id);


--
-- Name: idx_hostel_laundry_orders_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_orders_block ON public.hostel_laundry_orders USING btree (block_id);


--
-- Name: idx_hostel_laundry_orders_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_orders_config ON public.hostel_laundry_orders USING btree (config_id);


--
-- Name: idx_hostel_laundry_orders_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_orders_institution ON public.hostel_laundry_orders USING btree (institution_id);


--
-- Name: idx_hostel_laundry_orders_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_orders_learner ON public.hostel_laundry_orders USING btree (learner_id);


--
-- Name: idx_hostel_laundry_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_laundry_orders_status ON public.hostel_laundry_orders USING btree (status);


--
-- Name: idx_hostel_onboarding_checklists_allocation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_onboarding_checklists_allocation ON public.hostel_onboarding_checklists USING btree (allocation_id);


--
-- Name: idx_hostel_onboarding_checklists_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_onboarding_checklists_institution ON public.hostel_onboarding_checklists USING btree (institution_id);


--
-- Name: idx_hostel_onboarding_checklists_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_onboarding_checklists_learner ON public.hostel_onboarding_checklists USING btree (learner_id);


--
-- Name: idx_hostel_onboarding_checklists_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_onboarding_checklists_status ON public.hostel_onboarding_checklists USING btree (status);


--
-- Name: idx_hostel_onboarding_templates_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_onboarding_templates_institution ON public.hostel_onboarding_templates USING btree (institution_id);


--
-- Name: idx_hostel_pm_schedules_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_schedules_block ON public.hostel_pm_schedules USING btree (block_id);


--
-- Name: idx_hostel_pm_schedules_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_schedules_category ON public.hostel_pm_schedules USING btree (category);


--
-- Name: idx_hostel_pm_schedules_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_schedules_institution ON public.hostel_pm_schedules USING btree (institution_id);


--
-- Name: idx_hostel_pm_schedules_next_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_schedules_next_due ON public.hostel_pm_schedules USING btree (next_due_date);


--
-- Name: idx_hostel_pm_schedules_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_schedules_status ON public.hostel_pm_schedules USING btree (status);


--
-- Name: idx_hostel_pm_tasks_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_tasks_block ON public.hostel_pm_tasks USING btree (block_id);


--
-- Name: idx_hostel_pm_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_tasks_due_date ON public.hostel_pm_tasks USING btree (due_date);


--
-- Name: idx_hostel_pm_tasks_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_tasks_institution ON public.hostel_pm_tasks USING btree (institution_id);


--
-- Name: idx_hostel_pm_tasks_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_tasks_schedule ON public.hostel_pm_tasks USING btree (schedule_id);


--
-- Name: idx_hostel_pm_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pm_tasks_status ON public.hostel_pm_tasks USING btree (status);


--
-- Name: idx_hostel_pulse_configs_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pulse_configs_institution ON public.hostel_pulse_configs USING btree (institution_id);


--
-- Name: idx_hostel_pulse_configs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pulse_configs_status ON public.hostel_pulse_configs USING btree (status);


--
-- Name: idx_hostel_pulse_responses_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pulse_responses_config ON public.hostel_pulse_responses USING btree (config_id);


--
-- Name: idx_hostel_pulse_responses_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pulse_responses_institution ON public.hostel_pulse_responses USING btree (institution_id);


--
-- Name: idx_hostel_pulse_responses_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pulse_responses_learner ON public.hostel_pulse_responses USING btree (learner_id);


--
-- Name: idx_hostel_pulse_responses_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_pulse_responses_period ON public.hostel_pulse_responses USING btree (period_start);


--
-- Name: idx_hostel_safety_equipment_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_safety_equipment_block ON public.hostel_safety_equipment USING btree (block_id);


--
-- Name: idx_hostel_safety_equipment_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_safety_equipment_institution ON public.hostel_safety_equipment USING btree (institution_id);


--
-- Name: hostel_amc_contracts trg_hostel_amc_contracts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_amc_contracts_updated_at BEFORE UPDATE ON public.hostel_amc_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_cleaning_schedules trg_hostel_cleaning_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_cleaning_schedules_updated_at BEFORE UPDATE ON public.hostel_cleaning_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_cleaning_tasks trg_hostel_cleaning_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_cleaning_tasks_updated_at BEFORE UPDATE ON public.hostel_cleaning_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_community_config trg_hostel_community_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_community_config_updated_at BEFORE UPDATE ON public.hostel_community_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_health_cases trg_hostel_health_cases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_health_cases_updated_at BEFORE UPDATE ON public.hostel_health_cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_laundry_configs trg_hostel_laundry_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_laundry_configs_updated_at BEFORE UPDATE ON public.hostel_laundry_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_laundry_orders trg_hostel_laundry_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_laundry_orders_updated_at BEFORE UPDATE ON public.hostel_laundry_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_onboarding_checklists trg_hostel_onboarding_checklists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_onboarding_checklists_updated_at BEFORE UPDATE ON public.hostel_onboarding_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_onboarding_templates trg_hostel_onboarding_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_onboarding_templates_updated_at BEFORE UPDATE ON public.hostel_onboarding_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_pm_schedules trg_hostel_pm_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_pm_schedules_updated_at BEFORE UPDATE ON public.hostel_pm_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_pm_tasks trg_hostel_pm_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_pm_tasks_updated_at BEFORE UPDATE ON public.hostel_pm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_pulse_configs trg_hostel_pulse_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hostel_pulse_configs_updated_at BEFORE UPDATE ON public.hostel_pulse_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hostel_amc_contracts hostel_amc_contracts_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_amc_contracts
    ADD CONSTRAINT hostel_amc_contracts_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_amc_contracts hostel_amc_contracts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_amc_contracts
    ADD CONSTRAINT hostel_amc_contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: hostel_amc_contracts hostel_amc_contracts_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_amc_contracts
    ADD CONSTRAINT hostel_amc_contracts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_cleaning_schedules hostel_cleaning_schedules_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_schedules
    ADD CONSTRAINT hostel_cleaning_schedules_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_cleaning_schedules hostel_cleaning_schedules_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_schedules
    ADD CONSTRAINT hostel_cleaning_schedules_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_cleaning_tasks hostel_cleaning_tasks_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_tasks
    ADD CONSTRAINT hostel_cleaning_tasks_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_cleaning_tasks hostel_cleaning_tasks_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_tasks
    ADD CONSTRAINT hostel_cleaning_tasks_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_cleaning_tasks hostel_cleaning_tasks_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_cleaning_tasks
    ADD CONSTRAINT hostel_cleaning_tasks_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.hostel_cleaning_schedules(id);


--
-- Name: hostel_community_config hostel_community_config_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_community_config
    ADD CONSTRAINT hostel_community_config_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_emergency_contacts hostel_emergency_contacts_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_emergency_contacts
    ADD CONSTRAINT hostel_emergency_contacts_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_emergency_contacts hostel_emergency_contacts_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_emergency_contacts
    ADD CONSTRAINT hostel_emergency_contacts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_health_cases hostel_health_cases_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_health_cases hostel_health_cases_cleared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES public.profiles(id);


--
-- Name: hostel_health_cases hostel_health_cases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: hostel_health_cases hostel_health_cases_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_health_cases hostel_health_cases_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.profiles(id);


--
-- Name: hostel_health_cases hostel_health_cases_parent_notified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_health_cases
    ADD CONSTRAINT hostel_health_cases_parent_notified_by_fkey FOREIGN KEY (parent_notified_by) REFERENCES public.profiles(id);


--
-- Name: hostel_laundry_configs hostel_laundry_configs_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_configs
    ADD CONSTRAINT hostel_laundry_configs_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_laundry_configs hostel_laundry_configs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_configs
    ADD CONSTRAINT hostel_laundry_configs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_laundry_orders hostel_laundry_orders_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_orders
    ADD CONSTRAINT hostel_laundry_orders_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_laundry_orders hostel_laundry_orders_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_orders
    ADD CONSTRAINT hostel_laundry_orders_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.hostel_laundry_configs(id);


--
-- Name: hostel_laundry_orders hostel_laundry_orders_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_orders
    ADD CONSTRAINT hostel_laundry_orders_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_laundry_orders hostel_laundry_orders_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_laundry_orders
    ADD CONSTRAINT hostel_laundry_orders_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.profiles(id);


--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_checklists
    ADD CONSTRAINT hostel_onboarding_checklists_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);


--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_checklists
    ADD CONSTRAINT hostel_onboarding_checklists_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_checklists
    ADD CONSTRAINT hostel_onboarding_checklists_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.profiles(id);


--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_checklists
    ADD CONSTRAINT hostel_onboarding_checklists_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.hostel_onboarding_templates(id);


--
-- Name: hostel_onboarding_templates hostel_onboarding_templates_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_onboarding_templates
    ADD CONSTRAINT hostel_onboarding_templates_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_pm_schedules hostel_pm_schedules_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_schedules
    ADD CONSTRAINT hostel_pm_schedules_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_pm_schedules hostel_pm_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_schedules
    ADD CONSTRAINT hostel_pm_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: hostel_pm_schedules hostel_pm_schedules_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_schedules
    ADD CONSTRAINT hostel_pm_schedules_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_pm_tasks hostel_pm_tasks_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_tasks
    ADD CONSTRAINT hostel_pm_tasks_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_pm_tasks hostel_pm_tasks_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_tasks
    ADD CONSTRAINT hostel_pm_tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);


--
-- Name: hostel_pm_tasks hostel_pm_tasks_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_tasks
    ADD CONSTRAINT hostel_pm_tasks_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_pm_tasks hostel_pm_tasks_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pm_tasks
    ADD CONSTRAINT hostel_pm_tasks_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.hostel_pm_schedules(id);


--
-- Name: hostel_pulse_configs hostel_pulse_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_configs
    ADD CONSTRAINT hostel_pulse_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: hostel_pulse_configs hostel_pulse_configs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_configs
    ADD CONSTRAINT hostel_pulse_configs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_pulse_responses hostel_pulse_responses_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_responses
    ADD CONSTRAINT hostel_pulse_responses_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.hostel_pulse_configs(id);


--
-- Name: hostel_pulse_responses hostel_pulse_responses_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_responses
    ADD CONSTRAINT hostel_pulse_responses_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_pulse_responses hostel_pulse_responses_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_pulse_responses
    ADD CONSTRAINT hostel_pulse_responses_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.profiles(id);


--
-- Name: hostel_safety_equipment hostel_safety_equipment_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_safety_equipment
    ADD CONSTRAINT hostel_safety_equipment_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.hostel_blocks(id);


--
-- Name: hostel_safety_equipment hostel_safety_equipment_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_safety_equipment
    ADD CONSTRAINT hostel_safety_equipment_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: hostel_amc_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_amc_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_amc_contracts hostel_amc_contracts_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_amc_contracts_institution_isolation ON public.hostel_amc_contracts USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_cleaning_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_cleaning_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_cleaning_schedules hostel_cleaning_schedules_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_cleaning_schedules_institution_isolation ON public.hostel_cleaning_schedules USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_cleaning_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_cleaning_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_cleaning_tasks hostel_cleaning_tasks_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_cleaning_tasks_institution_isolation ON public.hostel_cleaning_tasks USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_community_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_community_config ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_community_config hostel_community_config_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_community_config_institution_isolation ON public.hostel_community_config USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_emergency_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_emergency_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_emergency_contacts hostel_emergency_contacts_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_emergency_contacts_institution_isolation ON public.hostel_emergency_contacts USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_health_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_health_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_health_cases hostel_health_cases_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_health_cases_institution_isolation ON public.hostel_health_cases USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_laundry_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_laundry_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_laundry_configs hostel_laundry_configs_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_laundry_configs_institution_isolation ON public.hostel_laundry_configs USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_laundry_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_laundry_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_laundry_orders hostel_laundry_orders_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_laundry_orders_institution_isolation ON public.hostel_laundry_orders USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_onboarding_checklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_onboarding_checklists ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_onboarding_checklists hostel_onboarding_checklists_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_onboarding_checklists_institution_isolation ON public.hostel_onboarding_checklists USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_onboarding_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_onboarding_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_onboarding_templates hostel_onboarding_templates_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_onboarding_templates_institution_isolation ON public.hostel_onboarding_templates USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_pm_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_pm_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_pm_schedules hostel_pm_schedules_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_pm_schedules_institution_isolation ON public.hostel_pm_schedules USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_pm_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_pm_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_pm_tasks hostel_pm_tasks_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_pm_tasks_institution_isolation ON public.hostel_pm_tasks USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_pulse_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_pulse_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_pulse_configs hostel_pulse_configs_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_pulse_configs_institution_isolation ON public.hostel_pulse_configs USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_pulse_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_pulse_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_pulse_responses hostel_pulse_responses_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_pulse_responses_institution_isolation ON public.hostel_pulse_responses USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: hostel_safety_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_safety_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_safety_equipment hostel_safety_equipment_institution_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hostel_safety_equipment_institution_isolation ON public.hostel_safety_equipment USING (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id = public.auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
--


