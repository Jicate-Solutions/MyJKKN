-- =============================================================================
-- Backfill staff.biometric_id / staff.biometric_institution_id from the
-- "BIOMETRIC NUMBER AND STAFF ID ALLOCATION" workbook (received 2026-08-09).
--
-- 465 staff receive a code. A source row was accepted only when BOTH the
-- employee id AND the person's name agreed with the staff row, or -- where the
-- sheet's employee id was wrong or absent -- when the name resolved to exactly
-- ONE staff row inside the sheet's own institution.
--
-- Why name agreement is mandatory rather than belt-and-braces: each college
-- keeps its own local NOT### counter, but staff.staff_id is UNIQUE across all
-- 13 institutions. NOT217 appears in four sheets as four different people;
-- sheet DCH001 is Dr. S.Elanchezhiyan while DB DCH001 is DR. SASIKUMAR P. K;
-- and the sheet has CAS120/CAS121 transposed. Matching on the id alone would
-- have handed 100 codes to the wrong person.
--
-- Keys are the VERBATIM staff_id, never whitespace-stripped. 'NOT 219'
-- (Miss. SALINI P) and 'NOT219' (Miss. SNEKA P) are different people, and four
-- more such pairs exist. 20 rows have no staff_id at all and are keyed by uuid.
--
-- biometric_institution_id is the MACHINE that issued the code, not the staff
-- member's college -- lib/hr/biometric/validate-upload.ts:64 resolves a punch
-- only against staff whose biometric_institution_id equals the uploading
-- machine. One workbook sheet == one machine, which is why rows on the Main
-- Office machine belong to six different institutions.
--
-- trg_sync_staff_to_profiles is disabled across the UPDATE. That trigger mirrors
-- ~10 staff columns into profiles on EVERY update, and profiles has drifted for
-- 12 of these rows -- JICATE111 (DEEPAK R) has profiles.is_active = false
-- against staff.is_active = true, so letting it fire would silently re-enable a
-- disabled login. A biometric backfill must not do that.
-- =============================================================================

-- 1. Pre-image of every staff row, so the backfill is reversible.
CREATE TABLE IF NOT EXISTS public.bak_staff_biometric_20260809 AS
SELECT id, staff_id, first_name, last_name, institution_id,
       biometric_id, biometric_institution_id, now() AS snapshot_at
FROM public.staff;
ALTER TABLE public.bak_staff_biometric_20260809 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bak_staff_biometric_20260809 FROM anon, authenticated;

-- 2. What the sheet said, kept as the audit record behind every code.
CREATE TABLE IF NOT EXISTS public.stg_staff_biometric_20260809 (
  key_kind   text NOT NULL CHECK (key_kind IN ('staff_id','uuid')),
  key_val    text NOT NULL,
  machine_id uuid NOT NULL,
  code       text NOT NULL,
  staff_uuid uuid
);
ALTER TABLE public.stg_staff_biometric_20260809 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stg_staff_biometric_20260809 FROM anon, authenticated;
TRUNCATE public.stg_staff_biometric_20260809;

-- JKKN College of Allied Health Sciences : 22 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), '9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'AHS098~7501;AHS110~7505;AHS107~7508;AHS113~7510;AHS114~7512;AHS115~7513;AHS117~7515;AHS118~7516;AHS119~7517;1234~7518;AHS122~7520;AHS123~7521;AHS126~7524;AHS127~7525;AHS128~7526;AHS129~7527;AHS131~7529;AHS132~7530;AHS133~7531;AHS134~7532;AHS135~7533;AHS136~7534'
  , ';')) AS t;

-- JKKN College of Arts and Science (Self) : 84 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), 'b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'CAS001~701;CAS002~702;CAS003~703;CAS010~713;CAS011~714;CAS012~715;CAS017~717;CAS018~718;CAS019~721;CAS026~727;CAS027~729;CAS031~735;CAS032~737;CAS037~738;CAS039~740;CAS045~741;CAS040~742;CAS041~743;CAS042~744;CAS044~746;CAS047~749;CAS050~753;CAS051~754;CAS052~755;CAS066~756;CAS053~757;CAS058~759;CAS059~760;CAS060~761;CAS020~774;CAS056~785;CAS014~789;CAS036~790;CAS015~796;CAS072~804;CAS073~805;CAS077~810;CAS078~812;CAS082~815;CAS083~816;CAS084~817;CAS085~818;CAS087~820;CAS088~821;CAS090~823;CAS091~824;CAS094~827;CAS095~828;NOT01~829;CAS096~830;CAS097~832;CAS098~833;CAS099~834;NOT108~835;CAS100~836;CAS101~838;CAS104~839;CAS103~840;CAS105~841;CAS106~842;CAS107~843;CAS108~845;CAS109~846;CAS113~851;CAS114~852;NOT111~853;CAS115~854;CAS116~855;CAS117~856;CAS118~857;CAS119~858;CAS121~859;CAS120~860;CAS122~861;CAS123~862;CAS130~863;CAS125~864;CAS126~865;CAS127~866;CAS128~867;CAS129~868;NOT112~870;CAS150~871;CAS132~872'
  , ';')) AS t;

-- JKKN College of Arts and Science (Self) : 2 keyed by uuid
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'uuid', split_part(t,'~',1), 'b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  '9ba8b05e-5dec-4efa-b011-541f7fc9c3f7~768;b1163072-ace3-49dd-8dec-839a1e7a6f9f~769'
  , ';')) AS t;

-- JKKN College of Engineering and Technology : 81 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'CET141~592;NOT006~4002;CET027~4008;CET029~4010;CET018~4011;CET004~4018;CET037~4034;CET038~4035;CET053~4061;CET103~4064;CET106~4067;CET107~4068;CET122~4071;CET064~4075;CET117~4078;CET118~4079;CET121~4082;CET123~4084;CET126~4087;CET129~4090;CET130~4091;CET148~4092;CET134~4098;CET135~4099;CET136~4100;NOT008~4106;CET024~4120;CET012~4122;CET003~4127;CET015~4128;CET021~4135;CET040~4141;CET039~4143;CET046~4144;CET043~4145;CET052~4158;CET138~4161;CET139~4162;CET144~4166;CET146~4169;CET147~4171;CET219~4172;CET220~4173;CET221~4174;CET222~4175;CET223~4176;NOT224~4177;CET225~4178;CET226~4179;CET228~4181;NOT219~4182;CET229~4184;CET230~4185;CET231~4186;CET232~4187;NOT221~4188;CET233~4189;CET234~4190;CET235~4191;CET238~4192;CET236~4195;CET237~4196;CET124~4198;CET240~4199;CET241~4200;CET242~4201;CET243~4202;CET244~4204;CET245~4206;CET246~4208;NOT247~4209;CET248~4210;NOT225~4211;CET249~4212;CET250~4213;CET251~4216;CET253~4218;CET254~4219;CET420~4220;CET256~4221;CET257~4222'
  , ';')) AS t;

-- JKKN College of Engineering and Technology : 1 keyed by uuid
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'uuid', split_part(t,'~',1), '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  '53f8644f-b1ee-465b-9901-4f032d4313f9~4207'
  , ';')) AS t;

-- JKKN College of Nursing and Research : 32 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), '70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'CNR002~503;CNR003~504;CNR008~506;CNR015~507;CNR014~508;CNR013~513;CNR011~515;CNR006~518;CNR012~522;CNRO27~523;CNR024~527;CNR025~528;CNR208~530;CNR032~551;CNR033~552;CNR023~561;CNR029~563;CNR205~568;CNR206~570;CNR207~571;CNR210~574;CNR001~6101;CNR213~6102;CNR214~6103;CNR216~6105;CNR217~6106;CNR215~6200;CNR218~8000;CNR219~8001;CNR8003~8003;CNR222~8004;CNR223~8005'
  , ';')) AS t;

-- JKKN College of Pharmacy : 71 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'COP003~1005;COP004~1006;COP008~1009;COP013~1014;COP016~1020;COP018~1025;COP071~1041;NOT072~1042;NOT077~1045;1057~1057;COP024~1060;COP026~1067;COP009~1077;NOT083~1078;NOT090~1081;COP046~1083;COP034~1094;COP035~1096;COP042~1099;COP040~1101;COP045~1105;NOT151~1117;COP047~1118;COP048~1119;COP049~1121;COP050~1123;COP054~1128;COP055~1129;COP056~1130;COP057~1131;COP058~1134;COP060~1137;COP061~1138;COP063~1142;NOT208~1145;COP073~1147;COP074~1148;COP075~1149;COP076~1150;NOT212~1151;COP077~1152;COP078~1153;COP079~1154;COP080~1155;COP081~1156;COP082~1157;COP083~1162;COP085~1164;NOT216~1165;NOT217~1166;NOT218~1167;NOT 219~1168;NOT 220~1169;COP086~1171;COP087~1172;COPO88~1173;COP090~1175;COP091~1177;COP092~1178;COP093~1180;NOT 224~1181;NOT226~1183;NOT 227~1184;COP229~1187;COP230~1188;COP231~1189;COP233~1191;COP234~1192;NOT~1194;COP235~1196;10403~10403'
  , ';')) AS t;

-- JKKN College of Pharmacy : 3 keyed by uuid
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'uuid', split_part(t,'~',1), '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  '092770a9-69f5-4285-a358-021dd92cf4aa~1120;ef319097-7bec-4d08-ad2c-c138823a610d~1182;5beb6849-d15c-40de-86a0-78ab312883d9~1185'
  , ';')) AS t;

-- JKKN Dental College and Hospital : 117 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'DCH009~2002;DCH035~2007;DCH002~2010;DCH003~2011;DCH006~2015;DCH082~2018;DCH012~2019;NOT022~2020;DCH021~2026;DCH001~2028;DCH023~2029;DCH024~2030;DCH031~2036;DCH036~2038;DCH042~2040;DCH044~2043;DCH046~2044;DCH047~2045;DCH049~2047;DCH050~2048;DCH051~2049;DCH057~2050;DCH054~2051;DCH055~2052;DCH056~2053;DCH065~2058;DCH069~2064;NOT016~2066;NOT018~2068;NOT017~2070;NOT019~2072;NOT020~2073;NOT027~2082;NOT2092~2092;NOT034~2093;NOT035~2094;NOT048~2112;NOT051~2143;NOT053~2146;NOT054~2151;NOT055~2152;NOT056~2156;DCH067~2171;DCH038~2178;DCH017~2180;DCH032~2181;DCH020~2188;DCH030~2201;DCH013~2209;DCH018~2211;DCH045~2216;NOT066~2220;DCH034~2224;NOT152~2227;NOT154~2235;DCH091~2250;DCH086~2258;DCH088~2261;DCH094~2263;NOT179~2271;DCH096~2275;DCH097~2278;DCH098~2279;DCH100~2287;DCH101~2288;NOT199~2291;DCH103~2293;DCH104~2294;NOT204~2295;NOT205~2296;NOT207~2299;DCH105~2300;NOT213~2303;NOT214~2304;DCH106~2307;DCH107~2308;DCH108~2310;DCH109~2312;DCH110~2313;DCH111~2314;DCH112~2315;DCH113~2316;DCH114~2317;NOT220~2318;DCH115~2319;DCH116~2323;DCH118~2326;DCH119~2327;DCH120~2328;DCH121~2329;DCH122~2331;DCH123~2332;DCH124~2333;DCH125~2335;DCH126~2336;DCH127~2343;DCH128~2345;DCH129~2346;DCH130~2347;NOT235~2381;NOT239~2386;DCH 132~2388;NOT240~2389;DCH133~2390;DCH134~2391;NOT241~2392;NOT243~2394;DCH136~2397;DCH137~2398;NOT242~2400;NOT244~2401;NOT 247~2405;DCH139~2406;DCH140~2407;DCH076~2536;NOT061~8066;NOT067~8858'
  , ';')) AS t;

-- JKKN Dental College and Hospital : 10 keyed by uuid
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'uuid', split_part(t,'~',1), 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  '976ac9f7-ccba-40d0-958c-222df77fbf5c~2117;d34624ea-c422-4ef0-94b7-671ff92c025e~2118;d95388d2-a6f5-42fd-82bc-af84c8ce3381~2124;b422aaa4-22f0-4305-8d63-e30af4fec78b~2128;7c2f675e-73ce-4755-932c-eee560f8ecbe~2129;cc4d72cf-886f-4616-b999-959f0756d8c2~2305;97180c8a-9991-48d9-91f1-1d1f6b6d559e~2337;e0657783-620e-43cc-90f2-cc6c9d8238d2~2344;8de78a87-d341-4241-a5fa-76c1e21f114f~2383;4b819148-8d4f-4a0f-9275-39167668c574~2403'
  , ';')) AS t;

-- JKKN Main Office : 38 keyed by staff_id
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'staff_id', split_part(t,'~',1), 'b962527f-97ce-4238-89ce-7b532d7c2bc6'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  'NOT100~2;NOT125~8;NOT124~9;NOT122~13;NOT176~26;NOT102~151;NOT103~278;NOT129~282;NOT194~587;NOT223~605;JICATE104~608;JICATE109~609;JICATE103~611;NOT230~613;NOT232~615;NOT236~618;NOT237~619;NOT238~620;JICATE108~627;NOT245~629;NOT246~630;NOT2188~632;JICATE111~634;JICATE112~636;JICATE115~637;NOT253~639;JICATE113~640;NOT254~641;JICATE114~642;NOT255~643;NOT256~644;NOT257~645;DCH073~646;NOT259~647;NOT260~648;NOT261~649;NOT264~652;NOT265~653'
  , ';')) AS t;

-- JKKN Main Office : 4 keyed by uuid
INSERT INTO public.stg_staff_biometric_20260809 (key_kind, key_val, machine_id, code)
SELECT 'uuid', split_part(t,'~',1), 'b962527f-97ce-4238-89ce-7b532d7c2bc6'::uuid, split_part(t,'~',2)
FROM unnest(string_to_array(
  '91370998-7d43-4806-b63e-6c8e39dbc1f2~601;df1ef62b-f171-43da-9aaa-8981ef5a3712~606;806dc21d-8908-474b-bb3a-e5764cb20b4e~631;f92f11d1-1cf2-4890-bd9d-92d2451e79fc~650'
  , ';')) AS t;

-- 3. Resolve each key to a staff row. Two statements, and the uuid side casts
--    st.id to text rather than key_val to uuid: Postgres does not short-circuit
--    OR, so one combined predicate evaluates 'AHS098'::uuid and raises 22P02.
UPDATE public.stg_staff_biometric_20260809 s
SET staff_uuid = st.id
FROM public.staff st
WHERE s.key_kind = 'staff_id' AND st.staff_id = s.key_val;

UPDATE public.stg_staff_biometric_20260809 s
SET staff_uuid = st.id
FROM public.staff st
WHERE s.key_kind = 'uuid' AND st.id::text = s.key_val;

-- 4. Guards, then apply. One block, so a failed guard rolls the trigger state
--    back too (DDL is transactional in Postgres).
DO $mig$
DECLARE
  v_total int; v_unresolved int; v_dup_code int; v_dup_staff int;
  v_updated int; v_final int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE staff_uuid IS NULL)
    INTO v_total, v_unresolved FROM public.stg_staff_biometric_20260809;

  IF v_total <> 465 THEN
    RAISE EXCEPTION 'staging holds % rows, expected 465', v_total;
  END IF;
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION '% staging rows did not resolve to a staff row', v_unresolved;
  END IF;

  -- Same machine + same normalised code on two people would trip staff_biometric_uq.
  SELECT count(*) INTO v_dup_code FROM (
    SELECT machine_id, public.fn_norm_biometric_code(code)
    FROM public.stg_staff_biometric_20260809
    GROUP BY 1,2 HAVING count(DISTINCT staff_uuid) > 1) d;
  IF v_dup_code > 0 THEN
    RAISE EXCEPTION '% (machine, code) pairs map to more than one person', v_dup_code;
  END IF;

  SELECT count(*) INTO v_dup_staff FROM (
    SELECT staff_uuid FROM public.stg_staff_biometric_20260809
    GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dup_staff > 0 THEN
    RAISE EXCEPTION '% staff rows are assigned more than one code', v_dup_staff;
  END IF;

  EXECUTE 'ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles';

  UPDATE public.staff st
  SET biometric_id             = s.code,
      biometric_institution_id = s.machine_id,
      updated_at               = now()
  FROM public.stg_staff_biometric_20260809 s
  WHERE st.id = s.staff_uuid
    AND (st.biometric_id             IS DISTINCT FROM s.code
      OR st.biometric_institution_id IS DISTINCT FROM s.machine_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  EXECUTE 'ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles';

  SELECT count(*) INTO v_final
  FROM public.stg_staff_biometric_20260809 s
  JOIN public.staff st ON st.id = s.staff_uuid
  WHERE st.biometric_id = s.code AND st.biometric_institution_id = s.machine_id;
  IF v_final <> 465 THEN
    RAISE EXCEPTION 'only % of 465 rows verified after update', v_final;
  END IF;

  RAISE NOTICE 'biometric backfill: % rows changed, 465 verified', v_updated;
END
$mig$;
