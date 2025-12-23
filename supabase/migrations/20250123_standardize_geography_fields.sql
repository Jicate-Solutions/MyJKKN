-- ============================================
-- MIGRATION: Standardize Geography Fields
-- ============================================
-- Created: 2025-01-23
-- Purpose: Fix inconsistent state, district, and taluk names in learners_profiles
-- Issue: Same locations stored with different formats (e.g., "TAMIL NADU" vs "TAMILNADU")
-- ============================================

-- ============================================
-- 1. STANDARDIZE STATE NAMES
-- ============================================
-- Standard format: Title Case (e.g., "Tamil Nadu")
UPDATE learners_profiles
SET permanent_address_state = CASE
  -- Tamil Nadu variations
  WHEN UPPER(TRIM(permanent_address_state)) IN ('TAMIL NADU', 'TAMILNADU', 'TN')
    THEN 'Tamil Nadu'

  -- Kerala
  WHEN UPPER(TRIM(permanent_address_state)) = 'KERALA'
    THEN 'Kerala'

  -- Telangana
  WHEN UPPER(TRIM(permanent_address_state)) = 'TELANGANA'
    THEN 'Telangana'

  -- Karnataka
  WHEN UPPER(TRIM(permanent_address_state)) = 'KARNATAKA'
    THEN 'Karnataka'

  -- Andhra Pradesh
  WHEN UPPER(TRIM(permanent_address_state)) IN ('ANDHRA PRADESH', 'AP')
    THEN 'Andhra Pradesh'

  -- Puducherry
  WHEN UPPER(TRIM(permanent_address_state)) IN ('PUDUCHERRY', 'PONDICHERRY')
    THEN 'Puducherry'

  -- Keep existing if already in proper format
  ELSE permanent_address_state
END
WHERE permanent_address_state IS NOT NULL
  AND permanent_address_state != '';

-- ============================================
-- 2. STANDARDIZE DISTRICT NAMES
-- ============================================
-- Standard format: Title Case with official Tamil Nadu government spellings
UPDATE learners_profiles
SET permanent_address_district = CASE
  -- Remove trailing dots and extra spaces first
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'ARIYALUR'
    THEN 'Ariyalur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'CHENNAI'
    THEN 'Chennai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'COIMBATORE'
    THEN 'Coimbatore'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'CUDDALORE'
    THEN 'Cuddalore'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'DHARMAPURI'
    THEN 'Dharmapuri'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'DINDIGUL'
    THEN 'Dindigul'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'ERODE'
    THEN 'Erode'

  -- Kallakurichi variations (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('KALLAKURICHI', 'KALLAKURUCHI')
    THEN 'Kallakurichi'

  -- Kanchipuram (official spelling - single 'e')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('KANCHEEPURAM', 'KANCHIPURAM')
    THEN 'Kanchipuram'

  -- Kanyakumari (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('KANNIYAKUMARI', 'KANYAKUMARI')
    THEN 'Kanyakumari'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'KARUR'
    THEN 'Karur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'KRISHNAGIRI'
    THEN 'Krishnagiri'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'MADURAI'
    THEN 'Madurai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'MAYILADUTHURAI'
    THEN 'Mayiladuthurai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'NAGAPATTINAM'
    THEN 'Nagapattinam'

  -- Namakkal (official spelling - double 'k')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('NAMAKKAL', 'NAMAKAL')
    THEN 'Namakkal'

  -- The Nilgiris (official spelling with "The")
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('NILGIRIS', 'THE NILGIRIS')
    THEN 'The Nilgiris'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'PERAMBALUR'
    THEN 'Perambalur'

  -- Pudukkottai (official spelling with double 'k')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('PUDUKKOTTAI', 'PUDUKOTTAI')
    THEN 'Pudukkottai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'RAMANATHAPURAM'
    THEN 'Ramanathapuram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'RANIPET'
    THEN 'Ranipet'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'SALEM'
    THEN 'Salem'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'SIVAGANGAI'
    THEN 'Sivagangai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'TENKASI'
    THEN 'Tenkasi'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'THANJAVUR'
    THEN 'Thanjavur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'THENI'
    THEN 'Theni'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'THOOTHUKUDI'
    THEN 'Thoothukudi'

  -- Tiruchirappalli (official spelling, not "Trichy")
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('TIRUCHIRAPPALLI', 'TRICHY')
    THEN 'Tiruchirappalli'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'TIRUNELVELI'
    THEN 'Tirunelveli'

  -- Tirupattur (official spelling with double 't' at end)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('TIRUPATTUR', 'TIRUPPATTUR', 'TIRUPATHUR')
    THEN 'Tirupattur'

  -- Tiruppur (official spelling with double 'p')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('TIRUPPUR', 'TIRUPUR')
    THEN 'Tiruppur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'TIRUVANNAMALAI'
    THEN 'Tiruvannamalai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'THIRUVARUR'
    THEN 'Thiruvarur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'VELLORE'
    THEN 'Vellore'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'VILLUPURAM'
    THEN 'Villupuram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'VIRUDHUNAGAR'
    THEN 'Virudhunagar'

  -- Kerala districts
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'KANNUR'
    THEN 'Kannur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'KOCHI'
    THEN 'Kochi'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) IN ('MALAPURAM', 'MALAPPURAM')
    THEN 'Malappuram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'PALAKKAD'
    THEN 'Palakkad'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'THIRUVANANDAPURAM'
    THEN 'Thiruvananthapuram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'THRISSUR'
    THEN 'Thrissur'

  -- Telangana
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'HYDERABAD'
    THEN 'Hyderabad'

  -- Puducherry
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))) = 'PUDUCHERRY'
    THEN 'Puducherry'

  -- Keep existing if not matched
  ELSE TRIM(REGEXP_REPLACE(permanent_address_district, '[.\s]+$', ''))
END
WHERE permanent_address_district IS NOT NULL
  AND permanent_address_district != '';

-- ============================================
-- 3. STANDARDIZE TALUK NAMES
-- ============================================
-- Standard format: Title Case, remove (TK) suffix, remove trailing dots
UPDATE learners_profiles
SET permanent_address_taluk = CASE
  -- Remove (TK) suffix and trailing dots, then standardize

  -- Agasteeswaram variations
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('AGASTASURARAM', 'AGASTEESWARAM', 'AGASTHEESWARAM')
    THEN 'Agasteeswaram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'ANTHIYUR'
    THEN 'Anthiyur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'ATTUR'
    THEN 'Attur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'BHAVANI'
    THEN 'Bhavani'

  -- Chinnasalem variations (official: single word)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('CHINNA SALEM', 'CHINNASALEM')
    THEN 'Chinnasalem'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'COIMBATORE'
    THEN 'Coimbatore'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'DHARMAPURI'
    THEN 'Dharmapuri'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'DINDIGUL'
    THEN 'Dindigul'

  -- Edappadi (official spelling with 'E')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('EDAPPADI', 'IDAPPADI')
    THEN 'Edappadi'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'ERODE'
    THEN 'Erode'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'GOBICHETTIPALAYAM'
    THEN 'Gobichettipalayam'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'HARUR'
    THEN 'Harur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'HOSUR'
    THEN 'Hosur'

  -- Kallakurichi (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('KALLAKURICHI', 'KALLAKURUCHI')
    THEN 'Kallakurichi'

  -- Kalvarayan Hills variations
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('KALLVARAYAN HILLS', 'KALVARAN HILLS', 'KALVARAYAN HILLS', 'KALVARAYANMALAI')
    THEN 'Kalvarayan Hills'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'KANCHIPURAM'
    THEN 'Kanchipuram'

  -- Kanyakumari (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('KANNIYAKUMARI', 'KANYAKUMARI')
    THEN 'Kanyakumari'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'KARIMANGALAM'
    THEN 'Karimangalam'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'KARUR'
    THEN 'Karur'

  -- Komarapalayam (official spelling with 'o')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('KOMARAPALAYAM', 'KUMARAPALAYAM')
    THEN 'Komarapalayam'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'KRISHNAGIRI'
    THEN 'Krishnagiri'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'METTUPALAYAM'
    THEN 'Mettupalayam'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('METTUR', 'METTUR DAM')
    THEN 'Mettur'

  -- Modakurichi (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('MODAKURICHI', 'MODAKURUCHI')
    THEN 'Modakurichi'

  -- Nallampalli (official spelling with double 'l')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('NALLAMPALLI', 'NALLAPALLI', 'NALLAMAPALLI')
    THEN 'Nallampalli'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'NAMAKKAL'
    THEN 'Namakkal'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'OMALUR'
    THEN 'Omalur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'PALAKKAD'
    THEN 'Palakkad'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'PALLADAM'
    THEN 'Palladam'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'PAPPIREDDIPATTI'
    THEN 'Pappireddipatti'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'PERUNDURAI'
    THEN 'Perundurai'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'POLLACHI'
    THEN 'Pollachi'

  -- Ranipet (official spelling without 'tai')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('RANIPET', 'RANIPETTAI')
    THEN 'Ranipet'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'RASIPURAM'
    THEN 'Rasipuram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'SALEM'
    THEN 'Salem'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'SANKARAPURAM'
    THEN 'Sankarapuram'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'SANKARI'
    THEN 'Sankari'

  -- Sathyamangalam (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('SATHYAMANAGALAM', 'SATHYAMANGALAM')
    THEN 'Sathyamangalam'

  -- Sholinghur (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('SHOLINGHUR', 'SHOLINGUR')
    THEN 'Sholinghur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'THALAIVASAL'
    THEN 'Thalaivasal'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'THRISSUR'
    THEN 'Thrissur'

  -- Thuraiyur (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('THURAIYUR', 'TURAIYUR')
    THEN 'Thuraiyur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'TIRUCHENGODE'
    THEN 'Tiruchengode'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'TIRUNELVELI'
    THEN 'Tirunelveli'

  -- Tiruppur (official spelling with double 'p')
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('TIRUPPUR', 'TIRUPUR')
    THEN 'Tiruppur'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'UTHANGARAI'
    THEN 'Uthangarai'

  -- Valapady (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('VALAPADI', 'VALAPADY', 'VALAPPADI')
    THEN 'Valapady'

  -- Vilavancode (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('VILAVAMCODE', 'VILAVANCODE', 'VILAVANKODE')
    THEN 'Vilavancode'

  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) = 'VILLUPURAM'
    THEN 'Villupuram'

  -- Virudhachalam (official spelling)
  WHEN UPPER(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi'))) IN ('VIRUDHACHALAM', 'VIRUDHASALAM')
    THEN 'Virudhachalam'

  -- For others, just clean up (remove TK suffix and trailing dots/spaces)
  ELSE INITCAP(TRIM(REGEXP_REPLACE(permanent_address_taluk, '\s*\(TK\)\s*|[.\s]+$', '', 'gi')))
END
WHERE permanent_address_taluk IS NOT NULL
  AND permanent_address_taluk != '';

-- ============================================
-- 4. VERIFICATION QUERIES
-- ============================================
-- Run these after migration to verify standardization

-- Check state distribution after standardization
-- SELECT permanent_address_state, COUNT(*) as count
-- FROM learners_profiles
-- WHERE permanent_address_state IS NOT NULL AND permanent_address_state != ''
-- GROUP BY permanent_address_state
-- ORDER BY permanent_address_state;

-- Check district distribution after standardization
-- SELECT permanent_address_district, COUNT(*) as count
-- FROM learners_profiles
-- WHERE permanent_address_district IS NOT NULL AND permanent_address_district != ''
-- GROUP BY permanent_address_district
-- ORDER BY permanent_address_district;

-- Check taluk distribution after standardization (top 50)
-- SELECT permanent_address_taluk, COUNT(*) as count
-- FROM learners_profiles
-- WHERE permanent_address_taluk IS NOT NULL AND permanent_address_taluk != ''
-- GROUP BY permanent_address_taluk
-- ORDER BY count DESC
-- LIMIT 50;
