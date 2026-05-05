-- ============================================================================
-- 20260505100004 — Seed canonical quotas + community_categories
-- ============================================================================
-- accommodation_types are institution-scoped — admin seeds those per
-- institution from Plan 2's lookup admin UI. This migration handles only the
-- two global tables.
-- ============================================================================

INSERT INTO public.quotas (code, name, sort_order) VALUES
    ('government',          'Government Quota',           10),
    ('management',          'Management Quota',           20),
    ('nri',                 'NRI Quota',                  30),
    ('community',           'Community Quota',            40),
    ('sports',              'Sports Quota',               50),
    ('physically_disabled', 'Physically Disabled Quota',  60),
    ('staff_ward',          'Staff Ward Quota',           70),
    ('lateral_entry',       'Lateral Entry Quota',        80)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.community_categories (code, name, sort_order) VALUES
    ('oc',          'OC',                       10),
    ('bc',          'BC',                       20),
    ('bcm',         'BCM (Backward Class Muslim)', 30),
    ('mbc',         'MBC',                      40),
    ('sc',          'SC',                       50),
    ('sca',         'SCA',                      60),
    ('st',          'ST',                       70),
    ('dnt',         'DNT (Denotified Tribe)',   80),
    ('not_applicable', 'Not Applicable',        99)
ON CONFLICT (code) DO NOTHING;
