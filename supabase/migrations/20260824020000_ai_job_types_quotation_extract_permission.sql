-- Open "Read Prices from PDF (AI)" to procurement staff.
--
-- procurement.quotation_extract was registered with allow_rule = 'seat_owner',
-- which restricts it to the ids listed in
-- ai_model_config.config_json->'max_lane_user_ids' for 'ai_query.natural_language'
-- — a single person. Every other procurement user who pressed the button was
-- refused, and because the API route in front of it was ALSO gating on the
-- Parent Portal staff helper, what they actually saw was a bare "Forbidden".
--
-- fn_ai_enqueue already understands the 'permission:<key>' form:
--     allow_rule LIKE 'permission:%'
--       -> user_has_permission(substring(allow_rule from 12))
-- 'permission:' is 11 characters, so the key extracted here is exactly
-- 'procurement.quotation_manage'.
--
-- user_has_permission(text) resolves roles from user_roles -> custom_roles with
-- OR logic (not just profiles.role), which matters: procurement users typically
-- hold their procurement roles through user_roles while profiles.role still says
-- something unrelated such as 'student'.
--
-- procurement.quotation_manage is held by procurement_officer,
-- procurement_manager and store_admin — i.e. exactly the people who capture
-- vendor quotations.
--
-- The lane, daily cap and max_inflight are unchanged; this only widens WHO may
-- enqueue, not how much work the lane accepts.

UPDATE ai_job_types
   SET allow_rule = 'permission:procurement.quotation_manage'
 WHERE job_type = 'procurement.quotation_extract';
