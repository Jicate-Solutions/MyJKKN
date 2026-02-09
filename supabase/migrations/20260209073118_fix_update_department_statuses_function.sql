-- Fix backwards NULL check in update_department_statuses() function
-- This restores proper auto-dormancy logic
CREATE OR REPLACE FUNCTION public.update_department_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_dept RECORD;
    v_new_status TEXT;
    v_months_since_revenue NUMERIC;
BEGIN
    FOR v_dept IN
        SELECT sd.id, sd.status, sd.last_revenue_at, sd.department_id
        FROM public.sh_solution_departments sd
        WHERE sd.status NOT IN ('pending_approval')
    LOOP
        -- Calculate months since last revenue
        IF v_dept.last_revenue_at IS NOT NULL THEN
            v_months_since_revenue := EXTRACT(EPOCH FROM (now() - v_dept.last_revenue_at)) / (30 * 24 * 3600);
        ELSE
            -- Never had revenue, use activated_at as baseline
            SELECT EXTRACT(EPOCH FROM (now() - sd.activated_at)) / (30 * 24 * 3600)
            INTO v_months_since_revenue
            FROM public.sh_solution_departments sd
            WHERE sd.id = v_dept.id;
        END IF;

        -- Determine new status
        IF v_months_since_revenue >= 3 THEN
            v_new_status := 'dormant';
        ELSIF v_months_since_revenue >= 1 THEN
            v_new_status := 'at_risk';
        ELSE
            v_new_status := 'active';
        END IF;

        -- Update if status changed
        IF v_new_status != v_dept.status THEN
            UPDATE public.sh_solution_departments
            SET status = v_new_status,
                dormant_at = CASE WHEN v_new_status = 'dormant' THEN now() ELSE dormant_at END,
                updated_at = now()
            WHERE id = v_dept.id;

            -- Record status history
            INSERT INTO public.sh_department_status_history
                (solution_department_id, previous_status, new_status, reason)
            VALUES
                (v_dept.id, v_dept.status, v_new_status,
                 CASE
                    WHEN v_new_status = 'dormant' THEN 'Auto-dormant: ' || ROUND(v_months_since_revenue, 1) || ' months without revenue'
                    WHEN v_new_status = 'at_risk' THEN 'At risk: ' || ROUND(v_months_since_revenue, 1) || ' months without revenue'
                    WHEN v_new_status = 'active' THEN 'Reactivated: Revenue received'
                 END);
        END IF;
    END LOOP;
END;
$$;
