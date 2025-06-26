-- Migration: Add Timetable Leave Management
-- Date: 2025-01-03
-- Description: Add tables and functionality for managing leaves in timetables with support for day_order and week_order behavior

-- Create enum for leave types
CREATE TYPE leave_type AS ENUM ('holiday', 'sick_leave', 'emergency', 'planned');

-- Create timetable_leaves table
CREATE TABLE public.timetable_leaves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timetable_id UUID NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    leave_type leave_type NOT NULL,
    reason TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create timetable_day_order_shifts table (for tracking shifts in day_order institutions)
CREATE TABLE public.timetable_day_order_shifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timetable_id UUID NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
    original_date DATE NOT NULL,
    shifted_date DATE NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for performance
CREATE INDEX idx_timetable_leaves_timetable_id ON public.timetable_leaves(timetable_id);
CREATE INDEX idx_timetable_leaves_leave_date ON public.timetable_leaves(leave_date);
CREATE INDEX idx_timetable_leaves_active ON public.timetable_leaves(is_active) WHERE is_active = true;
CREATE INDEX idx_timetable_leaves_composite ON public.timetable_leaves(timetable_id, leave_date, is_active);

CREATE INDEX idx_day_order_shifts_timetable_id ON public.timetable_day_order_shifts(timetable_id);
CREATE INDEX idx_day_order_shifts_dates ON public.timetable_day_order_shifts(original_date, shifted_date);

-- Add unique constraint to prevent duplicate leaves for the same date
CREATE UNIQUE INDEX idx_timetable_leaves_unique_active ON public.timetable_leaves(timetable_id, leave_date) 
WHERE is_active = true;

-- Add comments for documentation
COMMENT ON TABLE public.timetable_leaves IS 'Stores leave records for timetables with different behavior based on institution timetable_type';
COMMENT ON COLUMN public.timetable_leaves.leave_date IS 'The date when leave is marked (YYYY-MM-DD format)';
COMMENT ON COLUMN public.timetable_leaves.leave_type IS 'Type of leave: holiday, sick_leave, emergency, or planned';
COMMENT ON COLUMN public.timetable_leaves.is_active IS 'Whether this leave record is currently active';

COMMENT ON TABLE public.timetable_day_order_shifts IS 'Tracks automatic period shifts for day_order institutions when leaves are marked';
COMMENT ON COLUMN public.timetable_day_order_shifts.original_date IS 'The original date that was marked as leave';
COMMENT ON COLUMN public.timetable_day_order_shifts.shifted_date IS 'The date to which periods were automatically shifted';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timetable_leaves_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_timetable_leaves_updated_at
    BEFORE UPDATE ON public.timetable_leaves
    FOR EACH ROW
    EXECUTE FUNCTION update_timetable_leaves_updated_at();

-- Enable RLS
ALTER TABLE public.timetable_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_day_order_shifts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for timetable_leaves
CREATE POLICY "Users can view timetable leaves from their institution" ON public.timetable_leaves
    FOR SELECT USING (
        timetable_id IN (
            SELECT t.id FROM public.timetables t 
            INNER JOIN public.profiles p ON p.institution_id = t.institution_id 
            WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "Users can insert timetable leaves for their institution" ON public.timetable_leaves
    FOR INSERT WITH CHECK (
        timetable_id IN (
            SELECT t.id FROM public.timetables t 
            INNER JOIN public.profiles p ON p.institution_id = t.institution_id 
            WHERE p.id = auth.uid()
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "Users can update timetable leaves they created" ON public.timetable_leaves
    FOR UPDATE USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete timetable leaves they created" ON public.timetable_leaves
    FOR DELETE USING (created_by = auth.uid());

-- Create RLS policies for timetable_day_order_shifts
CREATE POLICY "Users can view day order shifts from their institution" ON public.timetable_day_order_shifts
    FOR SELECT USING (
        timetable_id IN (
            SELECT t.id FROM public.timetables t 
            INNER JOIN public.profiles p ON p.institution_id = t.institution_id 
            WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "System can manage day order shifts" ON public.timetable_day_order_shifts
    FOR ALL USING (true)
    WITH CHECK (true);

-- Create function to check institution timetable type
CREATE OR REPLACE FUNCTION get_institution_timetable_type(timetable_id_param UUID)
RETURNS TEXT AS $$
DECLARE
    timetable_type_result TEXT;
BEGIN
    SELECT i.timetable_type 
    INTO timetable_type_result
    FROM public.timetables t
    INNER JOIN public.institutions i ON i.id = t.institution_id
    WHERE t.id = timetable_id_param;
    
    RETURN timetable_type_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to handle day order shifts automatically
CREATE OR REPLACE FUNCTION handle_day_order_leave_shift()
RETURNS TRIGGER AS $$
DECLARE
    institution_timetable_type TEXT;
    next_available_date DATE;
BEGIN
    -- Only process for active leaves being inserted
    IF NEW.is_active = false THEN
        RETURN NEW;
    END IF;
    
    -- Get institution timetable type
    institution_timetable_type := get_institution_timetable_type(NEW.timetable_id);
    
    -- Only process for day_order institutions
    IF institution_timetable_type = 'day_order' THEN
        -- Find next available date (not a weekend, not already marked as leave)
        next_available_date := NEW.leave_date + INTERVAL '1 day';
        
        -- Skip weekends and existing leaves
        WHILE EXTRACT(DOW FROM next_available_date) IN (0, 6) -- Sunday = 0, Saturday = 6
           OR EXISTS (
               SELECT 1 FROM public.timetable_leaves 
               WHERE timetable_id = NEW.timetable_id 
                 AND leave_date = next_available_date 
                 AND is_active = true
           ) LOOP
            next_available_date := next_available_date + INTERVAL '1 day';
        END LOOP;
        
        -- Record the shift
        INSERT INTO public.timetable_day_order_shifts (
            timetable_id, 
            original_date, 
            shifted_date, 
            reason
        ) VALUES (
            NEW.timetable_id,
            NEW.leave_date,
            next_available_date,
            CONCAT('Auto-shift due to ', NEW.leave_type, ' leave')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic day order shifts
CREATE TRIGGER trigger_handle_day_order_leave_shift
    AFTER INSERT ON public.timetable_leaves
    FOR EACH ROW
    EXECUTE FUNCTION handle_day_order_leave_shift();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.timetable_leaves TO authenticated;
GRANT ALL ON public.timetable_day_order_shifts TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated; 