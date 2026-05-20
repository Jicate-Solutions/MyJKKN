-- ============================================================================
-- Normalize community + caste values to the new canonical hierarchy.
-- ============================================================================
-- Created: 2026-05-19
-- Purpose:
--   New cascading dropdown (components/admission/community-caste-selector.tsx)
--   expects exactly 7 community codes (OC / BC / BC-M / MBC / SC / SC-A / ST)
--   and canonical caste names matching lib/constants/community-caste-list.ts.
--
--   This migration consolidates:
--     1. 11 community variants → 7 canonical codes
--     2. ~250 caste typo variants → canonical names
--     3. Garbage caste values (MBC/BC/SC/OBC/GENERAL/'******') → NULL
--
-- Per project rule (feedback_placeholder_migrations_hide_typos.md), the full
-- UPDATE statements live here and the same SQL applies via MCP.
--
-- IMPORTANT — Order matters:
--   - Community normalization runs FIRST so that subsequent caste lookups
--     align with the right community.
--   - BC-CC rows get a special handling: community → 'BC' + caste set to
--     'Converts to Christianity' (per user decision).
--   - DNC rows get community → 'MBC' (Denotified is a subset of MBC per
--     the official TN doc); caste stays as-is since it's already a
--     denotified caste name.
-- ============================================================================

DO $$
BEGIN
  -- ── 1. SPECIAL CASE: BC-CC rows ───────────────────────────────────────────
  -- These 2 rows are "BC Christian Converts" stored as a community code.
  -- Per official doc item 364, this is a single BC caste, not a community.
  UPDATE public.learners_profiles
  SET community = 'BC',
      caste = 'Converts to Christianity'
  WHERE community = 'BC-CC';

  -- ── 2. COMMUNITY NORMALIZATION ────────────────────────────────────────────
  -- 11 variants → 7 canonical codes. Trim + uppercase first for robustness.
  UPDATE public.learners_profiles
  SET community = CASE
    WHEN upper(trim(community)) IN ('SC(A)', 'SC (A)', 'SCA', 'SC-A') THEN 'SC-A'
    WHEN upper(trim(community)) IN ('BCM', 'BC-M', 'BC M') THEN 'BC-M'
    WHEN upper(trim(community)) IN ('DNC', 'DENOTIFIED') THEN 'MBC'
    WHEN upper(trim(community)) IN ('OC', 'BC', 'MBC', 'SC', 'ST') THEN upper(trim(community))
    ELSE community  -- unknown values stay as-is; form picker will show empty
  END
  WHERE community IS NOT NULL AND trim(community) <> '';

  -- ── 3. CASTE NORMALIZATION ───────────────────────────────────────────────
  -- Map typo clusters to canonical names. Each branch handles ONE canonical
  -- cluster. Order from highest-frequency cluster to lowest so the most
  -- common matches fire first (in the rare case of overlap).
  UPDATE public.learners_profiles
  SET caste = CASE
    -- SC: Adi Dravida cluster (~285 rows across 6 spelling variants)
    WHEN upper(trim(caste)) ~ '^(ADI[\s\-]*DRAVID[AR]?|ADIDRAVIDAR|ADHIDRAVIDAR|AADHIDRAVIDAR|ADI[\s\-]*THIRAVIDAR)$' THEN 'Adi Dravida'

    -- SC-A: Arunthathiyar cluster (~303 rows across 3 spellings)
    WHEN upper(trim(caste)) ~ '^(ARUN[TD]H?A[TD]H?IYAR)$' THEN 'Arunthathiyar'

    -- MBC: Vanniakula Kshatriya cluster (~1,333 rows: VANNIYAR / VANNIAKULA / PADAYACHI variants)
    WHEN upper(trim(caste)) ~ '^(VANNIYAR|VANNIYAKULA[\s]*KSHATRIYA|VANNIAKULA[\s]*KSHATRIYA|VANNIA[\s]*GOUNDER|PADAYACHI|PADAIYACHI|PALLI|AGNIKULA[\s]*KSHATRIYA)$' THEN 'Vanniakula Kshatriya'

    -- BC: Kongu Vellalars cluster
    WHEN upper(trim(caste)) ~ '^(KONGU[\s]*VELLALAR[S]?|KONGU[\s]*VELLALAR[\s]*GOUNDER|VELLALA[\s]*GOUNDER)$' THEN 'Kongu Vellalars'

    -- BC: Kaikolar / Sengunthar cluster
    WHEN upper(trim(caste)) ~ '^(KAIKOLAR|SENGUNTHAR)$' THEN 'Kaikolar, Sengunthar'

    -- BC: Kammalar / Viswakarma cluster
    WHEN upper(trim(caste)) ~ '^(KAMMALAR|VISWAKARMA|VISHWAKARMA|VISWA[\s]*BRAHMIN)$' THEN 'Kammalar, Viswakarma'

    -- BC: Nadar cluster (NADAR + CHRISTIAN NADAR)
    WHEN upper(trim(caste)) ~ '^(NADAR|SHANAR|GRAMANI|CHRISTIAN[\s]*NADAR)$' THEN 'Nadar, Shanar, Gramani'

    -- BC: Devangar
    WHEN upper(trim(caste)) ~ '^(DEVANGAR|SEDAR)$' THEN 'Devangar, Sedar'

    -- MBC: Boyar / Oddar
    WHEN upper(trim(caste)) ~ '^(BOYAR|ODDAR)$' THEN 'Boyar, Oddar'

    -- BC-M: Labbai cluster
    WHEN upper(trim(caste)) ~ '^(LABBAI[S]?|LEBBAI|ROWTHAR|MARAKAYAR)$' THEN 'Labbai'

    -- MBC: Vettuva Gounder
    WHEN upper(trim(caste)) ~ '^(VETTUVA[\s]*GOUNDER)$' THEN 'Vettuva Gounder'

    -- MBC: Vannar (clothes-washing community)
    WHEN upper(trim(caste)) ~ '^(VANNAR|AGASA|MADIVALA|EKALI|RAJAKULA|VELUTHADAR|RAJAKA)$' THEN 'Vannar'

    -- BC: Gavara / Vadugar
    WHEN upper(trim(caste)) ~ '^(GAVARA|GAVARAI|VADUGAR|VADUVAR)$' THEN 'Gavara, Gavarai and Vadugar'

    -- MBC: Jangam
    WHEN upper(trim(caste)) ~ '^(JANGAM)$' THEN 'Jangam'

    -- MBC: Meenavar cluster (marine/fisher communities)
    WHEN upper(trim(caste)) ~ '^(MEENAVAR|PARVATHARAJAKULAM|PATTANAVAR|SEMBADAVAR)$' THEN 'Meenavar, Parvatharajakulam, Pattanavar, Sembadavar'

    -- BC: Maruthuvar / Navithar
    WHEN upper(trim(caste)) ~ '^(MARUTHUVAR|NAVITHAR|MANGALA|VELAKATTALAVAR)$' THEN 'Maruthuvar, Navithar, Mangala, Velakattalavar'

    -- MBC: Kulala
    WHEN upper(trim(caste)) ~ '^(KULALA|KUYAVAR|KUMBARAR)$' THEN 'Kulala'

    -- BC: Uppara / Uppillia / Sagara
    WHEN upper(trim(caste)) ~ '^(UPPARA|UPPILLIA|SAGARA)$' THEN 'Uppara, Uppillia, Sagara'

    -- BC: Agamudayar / Thozhu Vellala
    WHEN upper(trim(caste)) ~ '^(AGAMUDAIYAR|AGAMUDAYAR|THOZHU[\s]*VELLALA|THULUVA[\s]*VELLALA)$' THEN 'Agamudayar'

    -- SC: Paraiyan / Parayan
    WHEN upper(trim(caste)) ~ '^(PARAIYAN|PARAYAN|SAMBAVAR)$' THEN 'Paraiyan, Parayan, Sambavar'

    -- ST: Malayali
    WHEN upper(trim(caste)) ~ '^(MALAYALI)$' THEN 'Malayali'

    -- ST: Kurumba
    WHEN upper(trim(caste)) ~ '^(KURUMBA|KURUMBAS)$' THEN 'Kurumbas'

    -- SC: Devendrakula Velalar / Pallan
    WHEN upper(trim(caste)) ~ '^(DEVENDRAKULA[\s]*VELALAR|DEVENDRAKULATHAN|PALLAN|KADAIYAN|KALLADI|KUDUMBAN|PANNADI|VATHIRIYAN)$' THEN 'Devendrakula Velalar'

    -- SC: Kuravan / Sidhanar
    WHEN upper(trim(caste)) ~ '^(KURAVAN|SIDHANAR)$' THEN 'Kuravan, Sidhanar'

    -- SC: Chakkiliyan
    WHEN upper(trim(caste)) ~ '^(CHAKKILIYAN)$' THEN 'Chakkiliyan'

    -- BC: Kallar
    WHEN upper(trim(caste)) ~ '^(KALLAR|EASANATTU[\s]*KALLAR)$' THEN 'Kallar'

    -- BC: Maravar (non-denotified)
    WHEN upper(trim(caste)) ~ '^(MARAVAR|KARUMARAVARS)$' THEN 'Maravars (BC)'

    -- BC: Yadhava / Idaiyar
    WHEN upper(trim(caste)) ~ '^(YADHAVA|IDAIYAR|GOLLA|VADUGA[\s]*AYAR|VADUGA[\s]*IDAIYAR)$' THEN 'Yadhava'

    -- BC: Reddy
    WHEN upper(trim(caste)) ~ '^(REDDY)$' THEN 'Reddy (Ganjam)'

    -- MBC: Sozhia Vellalar
    WHEN upper(trim(caste)) ~ '^(SOZHIYA[\s]*VELLALAR|SOZHIA[\s]*VELLALAR|SOZHA[\s]*VELLALAR)$' THEN 'Sozhia Vellalar'

    -- BC: Vaniyar / Vania Chettiar
    WHEN upper(trim(caste)) ~ '^(VANIYAR|VANIA[\s]*CHETTIAR|GANDLA|GANIKA|TELIKULA|CHEKKALAR)$' THEN 'Vaniyar, Vania Chettiar'

    -- MBC: Ambalakarar (non-denotified)
    WHEN upper(trim(caste)) ~ '^(AMBALAKARAR)$' THEN 'Ambalakarar'

    -- MBC: Mukkuvar
    WHEN upper(trim(caste)) ~ '^(MUKKUVAR|MUKAYAR)$' THEN 'Mukkuvar, Mukayar'

    -- MBC: Valaiyar
    WHEN upper(trim(caste)) ~ '^(VALAIYAR|VALAYAR|CHETTINAD[\s]*VALAYARS)$' THEN 'Valaiyar'

    -- MBC: Muthuraja / Muthuracha
    WHEN upper(trim(caste)) ~ '^(MUTHURAJA|MUTHURACHA|MUTTIRIYAR|MUTHARAIYAR)$' THEN 'Muthuraja, Muthuracha, Muttiriyar, Mutharaiyar'

    -- GARBAGE: community-code values stored in caste column (already covered
    -- by community col; nullify in caste)
    WHEN upper(trim(caste)) ~ '^(MBC|BC|SC|ST|OC|BCM|SCA|DNC|OBC|GENERAL|NIL|NIL+|NULL|NONE|NA|N/A|UNKNOWN)$' THEN NULL
    WHEN trim(caste) ~ '^\*+$' THEN NULL  -- '******' garbage
    WHEN upper(trim(caste)) ~ '^-+$' THEN NULL  -- dashes

    -- Default: leave as-is; the form will render via OTHER mode with raw text
    ELSE caste
  END
  WHERE caste IS NOT NULL AND trim(caste) <> '';
END $$;
