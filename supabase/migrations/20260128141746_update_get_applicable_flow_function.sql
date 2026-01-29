-- Update get_applicable_approval_flow function to support full 5-level hierarchy
-- Institution -> Degree -> Department -> Program -> Semester

CREATE OR REPLACE FUNCTION get_applicable_approval_flow(
    p_institution_id UUID,
    p_degree_id UUID,
    p_department_id UUID,
    p_program_id UUID,
    p_semester_id UUID,
    p_category TEXT,
    p_sub_category TEXT
) RETURNS leave_onduty_approval_flows AS $$
DECLARE
    v_flow leave_onduty_approval_flows;
BEGIN
    -- Try to find most specific flow first, then fallback to less specific
    -- Priority: All levels (highest) to institution + category (lowest)

    -- Level 1: All filters (Institution + Degree + Department + Program + Semester + Category + Sub-category)
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND degree_id = p_degree_id
        AND department_id = p_department_id
        AND program_id = p_program_id
        AND semester_id = p_semester_id
        AND (category = p_category OR category = 'all')
        AND (sub_category = p_sub_category OR sub_category IS NULL)
        AND is_active = true
    ORDER BY
        CASE WHEN sub_category = p_sub_category THEN 1 ELSE 2 END,
        CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 2: Institution + Degree + Department + Program + Semester + Category
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND degree_id = p_degree_id
        AND department_id = p_department_id
        AND program_id = p_program_id
        AND semester_id = p_semester_id
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 3: Institution + Degree + Department + Program + Category
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND degree_id = p_degree_id
        AND department_id = p_department_id
        AND program_id = p_program_id
        AND semester_id IS NULL
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 4: Institution + Degree + Department + Category
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND degree_id = p_degree_id
        AND department_id = p_department_id
        AND program_id IS NULL
        AND semester_id IS NULL
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 5: Institution + Department + Category
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND degree_id IS NULL
        AND department_id = p_department_id
        AND program_id IS NULL
        AND semester_id IS NULL
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    IF FOUND THEN RETURN v_flow; END IF;

    -- Level 6: Institution + Category (fallback)
    SELECT * INTO v_flow
    FROM leave_onduty_approval_flows
    WHERE institution_id = p_institution_id
        AND degree_id IS NULL
        AND department_id IS NULL
        AND program_id IS NULL
        AND semester_id IS NULL
        AND (category = p_category OR category = 'all')
        AND sub_category IS NULL
        AND is_active = true
    ORDER BY CASE WHEN category = p_category THEN 1 ELSE 2 END
    LIMIT 1;

    RETURN v_flow;
END;
$$ LANGUAGE plpgsql STABLE;
