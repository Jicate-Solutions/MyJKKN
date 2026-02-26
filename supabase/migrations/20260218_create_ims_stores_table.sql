-- Migration: Create ims_stores table
-- Date: 2026-02-18
-- Purpose: IMS Store Registration — each JKKN institution operates as an independent IMS store
-- Super admins can switch between stores; regular users are auto-scoped to their institution's store.

CREATE TABLE IF NOT EXISTS public.ims_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    address TEXT,
    manager_id UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ims_stores_institution ON public.ims_stores(institution_id);
CREATE INDEX IF NOT EXISTS idx_ims_stores_active ON public.ims_stores(is_active);

ALTER TABLE public.ims_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ims_stores"
    ON public.ims_stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ims_stores"
    ON public.ims_stores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ims_stores"
    ON public.ims_stores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete ims_stores"
    ON public.ims_stores FOR DELETE TO authenticated USING (true);
