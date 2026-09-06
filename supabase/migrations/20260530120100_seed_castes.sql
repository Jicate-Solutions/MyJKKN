-- Phase 2 — Seed castes from the static TN reservation taxonomy

-- Generated from lib/constants/community-caste-list.ts. Idempotent.

-- Maps community CODE -> community_categories.id via subquery.



insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Agamudayar', array['agamudaiyar', 'agamudayar', 'thozhu vellala']::text[], 'Including Thozhu Vellala', 0
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thuluva Vellala', array['thuluva vellala', 'thuluva vellalar']::text[], null, 1
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Agaram Vellan Chettiar', '{}'::text[], null, 2
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Alwar, Azhavar and Alavar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 3
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Servai (BC)', '{}'::text[], 'Except Tiruchirapalli, Karur, Perambalur and Pudukottai', 4
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nulayar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 5
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Archakarai Vellala', '{}'::text[], null, 6
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Aryavathi', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 7
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ayira Vaisyar', '{}'::text[], null, 8
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Badagar', '{}'::text[], null, 9
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Billava', '{}'::text[], null, 10
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bondil', '{}'::text[], null, 11
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Boyas (BC)', '{}'::text[], 'Except Tiruchirapalli, Karur, etc.', 12
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chakkala (BC)', '{}'::text[], 'Except Sivaganga, Virudhunagar, etc.', 13
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chavalakarar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 14
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chettu, Chetty', array['kottar chetty', 'elur chetty', 'pathira chetty', 'valayal chetty', 'pudukadai chetty']::text[], 'In Kanyakumari and Shenkottah Taluk', 15
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chowdry', '{}'::text[], null, 16
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Converts to Christianity', '{}'::text[], 'From any Hindu BC/MBC/Denotified community, except specified exclusions', 17
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'C.S.I (formerly S.I.U.C)', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 18
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Donga Dasaris (BC)', '{}'::text[], 'Except specified districts', 19
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Devangar, Sedar', array['devangar', 'sedar']::text[], null, 20
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dombs (BC)', '{}'::text[], 'Except specified districts', 21
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dommars (BC)', '{}'::text[], 'Except specified districts', 22
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Enadi', '{}'::text[], null, 23
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ezhavathy', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 24
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ezhuthachar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 25
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ezhuva', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 26
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gangavar', '{}'::text[], null, 27
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gavara, Gavarai and Vadugar', array['gavara', 'gavarai', 'vadugar', 'vaduvar']::text[], 'Other than Kamma, Kapu, Balija, Reddi', 28
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gounder', '{}'::text[], null, 29
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gowda', array['gowda', 'gammala', 'kalali', 'anuppa gounder']::text[], null, 30
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Hegde', '{}'::text[], null, 31
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Idiga', '{}'::text[], null, 32
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Illathu Pillaimar, Illuvar, Ezhuvar, Illathar', '{}'::text[], null, 33
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jhetty', '{}'::text[], null, 34
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jogis (BC)', '{}'::text[], 'Except specified districts', 35
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kabbera', '{}'::text[], null, 36
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kaikolar, Sengunthar', array['kaikolar', 'sengunthar']::text[], null, 37
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kaladi (BC)', '{}'::text[], 'Except specified districts', 38
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kalari Kurup, Kalari Panicker', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 39
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kalingi', '{}'::text[], null, 40
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kallar', array['kallar', 'easanattu kallar']::text[], 'Including various sub-types', 41
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kallar Kula Thondaman', '{}'::text[], null, 42
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kalveli Gounder', '{}'::text[], null, 43
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kambar', '{}'::text[], null, 44
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kammalar, Viswakarma', array['kammalar', 'viswakarma', 'vishwakarma', 'thattar', 'porkollar', 'kannar', 'karumar', 'kollar', 'thacher', 'kal thacher', 'kamsala', 'viswa brahmin']::text[], 'Including Thattar, Porkollar, Kannar, etc.', 45
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kani, Kanisu, Kaniyar Panicker', '{}'::text[], null, 46
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kaniyala Vellalar', '{}'::text[], null, 47
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kannada Saineegar, Kannadiyar', '{}'::text[], 'Throughout state; Dasapalanjika in Coimbatore/Erode/Nilgiris', 48
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kannadiya Naidu', '{}'::text[], null, 49
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Karpoora Chettiar', '{}'::text[], null, 50
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Karuneegar', array['seer karuneegar', 'sri karuneegar', 'sarattu karuneegar', 'kaikatti karuneegar', 'mathuvazhi kanakkar', 'sozhi kanakkar', 'sunnambu karuneegar']::text[], null, 51
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kasukkara Chettiar', '{}'::text[], null, 52
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Katesar, Pattamkatti', '{}'::text[], null, 53
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kavuthiyar', '{}'::text[], null, 54
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kerala Mudali', '{}'::text[], null, 55
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kharvi', '{}'::text[], null, 56
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Khatri', '{}'::text[], null, 57
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kongu Vaishnava', '{}'::text[], null, 58
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kongu Vellalars', array['kongu vellalar', 'kongu vellalars', 'kongu vellalar gounder', 'vellala gounder', 'nattu gounder', 'narambukkatti gounder', 'tirumudi vellalar', 'thondu vellalar', 'pala gounder', 'poosari gounder', 'anuppa vellala gounder', 'padaithalai gounder', 'chendalai gounder', 'pavalankatti vellala gounder', 'palavellala gounder', 'sanku vellala gounder', 'rathinagiri gounder']::text[], null, 59
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koppala Velama', '{}'::text[], null, 60
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koteyar', '{}'::text[], null, 61
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Krishnanvaka', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 62
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kudikara Vellalar', '{}'::text[], null, 63
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kudumbi', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 64
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kuga Vellalar', '{}'::text[], null, 65
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kunchidigar', '{}'::text[], null, 66
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Latin Catholics', '{}'::text[], 'Except Latin Catholic Vannar in Kanyakumari', 67
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Latin Catholics (Shenkottah)', '{}'::text[], 'In Shenkottah Taluk of Tirunelveli', 68
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Lambadi', '{}'::text[], null, 69
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Lingayat (Jangama)', '{}'::text[], null, 70
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mahratta (Non-Brahmin)', array['mahratta', 'namdev mahratta']::text[], null, 71
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malayar', '{}'::text[], null, 72
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Male', '{}'::text[], null, 73
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Maniagar', '{}'::text[], null, 74
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Maravars (BC)', array['maravar', 'karumaravars']::text[], 'Except specified districts', 75
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Moondrumandai Enbathunalu Ur Sozhia Vellalar', '{}'::text[], null, 76
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mooppan', '{}'::text[], null, 77
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Muthuraja, Muthuracha, Muttiriyar, Mutharaiyar', array['muthuraja', 'muthuracha', 'muttiriyar', 'mutharaiyar']::text[], null, 78
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nadar, Shanar, Gramani', array['nadar', 'shanar', 'gramani', 'christian nadar']::text[], null, 79
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nagaram', '{}'::text[], null, 80
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Naikkar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 81
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nangudi Vellalar', '{}'::text[], null, 82
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nanjil Mudali', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 83
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Odar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 84
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Odiya', '{}'::text[], null, 85
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Oottruvalanattu Vellalar', '{}'::text[], null, 86
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'O.P.S. Vellalar', '{}'::text[], null, 87
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ovachar', '{}'::text[], null, 88
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Paiyur Kotta Vellalar', '{}'::text[], null, 89
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pamulu', '{}'::text[], null, 90
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Panar', '{}'::text[], 'Except Kanyakumari/Shenkottah where SC', 91
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pandiya Vellalar', '{}'::text[], null, 92
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kathikarar', '{}'::text[], 'In Kanyakumari District', 93
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pannirandam Chettiar, Uthama Chettiar', '{}'::text[], null, 94
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Parkavakulam', array['surithimar', 'nathamar', 'malayamar', 'moopanar', 'nainar']::text[], null, 95
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Perike', array['perike balija']::text[], null, 96
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Perumkollar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 97
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Podikara Vellalar', '{}'::text[], null, 98
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pooluva Gounder', '{}'::text[], null, 99
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Poraya', '{}'::text[], null, 100
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pulavar', '{}'::text[], 'In Coimbatore and Erode', 101
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pulluvar, Pooluvar', '{}'::text[], null, 102
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pusala', '{}'::text[], null, 103
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Reddy (Ganjam)', array['reddy']::text[], null, 104
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sadhu Chetty', array['telugu chetty', 'twenty four manai telugu chetty']::text[], null, 105
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sakkaravar, Kavathi', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 106
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Salivagana', '{}'::text[], null, 107
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Saliyar, Padmasaliyar, Pattusaliyar, Pattariyar, Adhaviyar', array['saliyar', 'padmasaliyar', 'pattusaliyar']::text[], null, 108
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Savalakkarar', '{}'::text[], null, 109
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Senaithalaivar, Senaikudiyar, Illaivaniar', '{}'::text[], null, 110
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Serakula Vellalar', '{}'::text[], null, 111
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sourashtra (Patnulkarar)', '{}'::text[], null, 112
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sozhia Vellalar', array['sozhia vellalar', 'sozhiya vellalar', 'sozha vellalar', 'vetrilaikarar', 'kodikalkarar', 'keeraikarar']::text[], null, 113
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Srisayar', '{}'::text[], null, 114
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sundaram Chetty', '{}'::text[], null, 115
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thogatta Veerakshatriya', '{}'::text[], null, 116
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Tholkollar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 117
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Tholuva Naicker, Vetalakara Naicker', '{}'::text[], null, 118
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thoraiyar (BC)', '{}'::text[], null, 119
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thoriyar', '{}'::text[], null, 120
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ukkirakula Kshatriya Naicker', '{}'::text[], null, 121
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Uppara, Uppillia, Sagara', array['uppara', 'uppillia', 'sagara']::text[], null, 122
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Urali Gounder (BC)', '{}'::text[], 'Except specified districts', 123
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Urikkara Nayakkar', '{}'::text[], null, 124
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Virakodi Vellala', '{}'::text[], null, 125
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vallambar', '{}'::text[], null, 126
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vallanattu Chettiar', '{}'::text[], null, 127
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Valmiki', '{}'::text[], null, 128
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vaniyar, Vania Chettiar', array['vaniyar', 'vania chettiar', 'gandla', 'ganika', 'telikula', 'chekkalar']::text[], null, 129
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Veduvar, Vedar', '{}'::text[], 'Except Kanyakumari/Shenkottah where SC', 130
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Veerasaiva', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 131
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Velar', '{}'::text[], null, 132
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vellan Chettiar', '{}'::text[], null, 133
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Veluthodathu Nair', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 134
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vokkaligar', array['vokkaligar', 'vakkaligar', 'okkaligar', 'kappiliyar', 'kappiliya', 'okkaliga gowda', 'okkaliya gowda', 'okkaliya gowder']::text[], null, 135
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Wynad Chetty', '{}'::text[], 'Nilgiris', 136
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Yadhava', array['yadhava', 'idaiyar', 'vaduga ayar', 'vaduga idaiyar', 'golla', 'asthanthra golla']::text[], null, 137
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Yavana', '{}'::text[], null, 138
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Yerukula', '{}'::text[], null, 139
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Orphans and destitute children', '{}'::text[], 'Per official orphan/destitute provisions', 140
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thiyya', '{}'::text[], null, 141
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Converts to Christianity (BC origin)', '{}'::text[], 'From BC/MBC/Denotified, except specified marine castes', 142
from public.community_categories where code = 'BC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ansar', '{}'::text[], null, 0
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dekkani Muslims', '{}'::text[], null, 1
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dudekula', '{}'::text[], null, 2
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Labbai', array['labbai', 'labbais', 'lebbai', 'rowthar', 'marakayar']::text[], 'Including Rowthar and Marakayar', 3
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mapilla', '{}'::text[], null, 4
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sheik', '{}'::text[], null, 5
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Syed', '{}'::text[], null, 6
from public.community_categories where code = 'BC-M'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ambalakarar', '{}'::text[], null, 0
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Andipandaram', '{}'::text[], null, 1
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Arayar', '{}'::text[], 'In Kanyakumari District', 2
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bestha, Siviar', '{}'::text[], null, 3
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bhatraju', '{}'::text[], 'Other than Kshatriya Raju', 4
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Boyar, Oddar', array['boyar', 'oddar']::text[], null, 5
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dasari', '{}'::text[], null, 6
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dommara', '{}'::text[], null, 7
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Eravallar', '{}'::text[], 'Except Kanyakumari/Shenkottah where ST', 8
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Isaivellalar', '{}'::text[], null, 9
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jambuvanodai', '{}'::text[], null, 10
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jangam', '{}'::text[], null, 11
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jogi', '{}'::text[], null, 12
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kongu Chettia', '{}'::text[], 'In Coimbatore and Erode only', 13
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koracha', '{}'::text[], null, 14
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kulala', array['kulala', 'kuyavar', 'kumbarar']::text[], 'Including Kuyavar and Kumbarar', 15
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kulunuvar Mannadi', '{}'::text[], null, 16
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kurumba, Kurumba Gounder', array['kurumba']::text[], null, 17
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kuruhini Chetty', '{}'::text[], null, 18
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Latin Catholic Christian Vannar', '{}'::text[], 'In Kanyakumari District', 19
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Maruthuvar, Navithar, Mangala, Velakattalavar', array['maruthuvar', 'navithar', 'mangala', 'velakattalavar']::text[], null, 20
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mond Golla', '{}'::text[], null, 21
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Moundadan Chetty', '{}'::text[], null, 22
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mahendra, Medara', '{}'::text[], null, 23
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nokkar', '{}'::text[], null, 24
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Panisaivan, Panisivan', '{}'::text[], null, 25
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vanniakula Kshatriya', array['vanniakula kshatriya', 'vanniyar', 'vanniya', 'vannia gounder', 'gounder or kander', 'padayachi', 'padaiyachi', 'palli', 'agnikula kshatriya']::text[], 'Including Vanniyar, Vanniya, Vannia Gounder, Padayachi, Palli, Agnikula Kshatriya', 26
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Paravar', '{}'::text[], 'Except Kanyakumari/Shenkottah where SC', 27
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Paravar converts to Christianity', '{}'::text[], 'Including converts in Kanyakumari/Shenkottah', 28
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Meenavar, Parvatharajakulam, Pattanavar, Sembadavar', array['meenavar', 'parvatharajakulam', 'pattanavar', 'sembadavar']::text[], 'Including converts to Christianity', 29
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mukkuvar, Mukayar', array['mukkuvar', 'mukayar']::text[], 'Including converts to Christianity', 30
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Punnan Vettuva Gounder', '{}'::text[], null, 31
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pannayar', '{}'::text[], 'Other than Kathikarar in Kanyakumari', 32
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sathatha Srivaishnava', array['sathani', 'chattadi', 'chattada srivaishnava']::text[], null, 33
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sozhia Chetty', '{}'::text[], null, 34
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Telugupatty Chetty', '{}'::text[], null, 35
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thotti Naicker', array['rajakambalam', 'gollavar', 'sillavar', 'thockalavar', 'thozhuva naicker', 'erragollar']::text[], null, 36
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thondaman', '{}'::text[], null, 37
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thoraiyar', '{}'::text[], 'Nilgiris', 38
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thoraiyar', '{}'::text[], 'Plains', 39
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Transgender or Eunuch', array['thirunangai', 'aravani']::text[], null, 40
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Valaiyar', array['valayar', 'chettinad valayars']::text[], null, 41
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vannar', array['vannar', 'agasa', 'madivala', 'ekali', 'rajakula', 'veluthadar', 'rajaka']::text[], 'Except Kanyakumari/Shenkottah where SC', 42
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vettaikarar', '{}'::text[], null, 43
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vettuva Gounder', array['vettuva gounder']::text[], null, 44
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Yogeeswarar', '{}'::text[], null, 45
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Attur Kilnad Koravars', '{}'::text[], 'Denotified — Salem, Namakkal, etc.', 46
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Attur Melnad Koravars', '{}'::text[], 'Denotified — Salem, Namakkal', 47
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Appanad Kondayam Kottai Maravar', '{}'::text[], 'Denotified — Sivaganga, Virudhunagar, etc.', 48
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ambalakarar (Denotified)', '{}'::text[], 'Denotified — Thanjavur, Nagapattinam, etc.', 49
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ambalakkarar (Suriyanur)', '{}'::text[], 'Denotified — Tiruchirapalli', 50
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Boyas', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 51
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Battu Turkas', '{}'::text[], 'Denotified', 52
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'C.K. Koravars', '{}'::text[], 'Denotified — Cuddalore and Villupuram', 53
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chakkala', '{}'::text[], 'Denotified — Sivaganga, etc.', 54
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Changyampudi Koravars', '{}'::text[], 'Denotified — Vellore and Thiruvannamalai', 55
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chettinad Valayars', '{}'::text[], 'Denotified — Sivaganga, etc.', 56
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dombs', '{}'::text[], 'Denotified — Pudukkottai, etc.', 57
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dobba Koravars', '{}'::text[], 'Denotified — Salem and Namakkal', 58
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dommars', '{}'::text[], 'Denotified — Thanjavur, etc.', 59
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Donga Boya', '{}'::text[], 'Denotified', 60
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Donga Ur. Korachas', '{}'::text[], 'Denotified', 61
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Devagudi Talayaris', '{}'::text[], 'Denotified', 62
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dobbai Korachas', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 63
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dabi Koravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 64
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Donga Dasaris', '{}'::text[], 'Denotified — Kancheepuram, etc.', 65
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gorrela Dodda Boya', '{}'::text[], 'Denotified', 66
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gudu Dasaris', '{}'::text[], 'Denotified', 67
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gandarvakottai Koravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 68
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gandarvakottai Kallars', '{}'::text[], 'Denotified — Thanjavur, etc.', 69
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Inji Koravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 70
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jogis (Denotified)', '{}'::text[], 'Denotified — Kancheepuram, etc.', 71
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jambavanodai', '{}'::text[], 'Denotified', 72
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kaladis', '{}'::text[], 'Denotified — Sivaganga, etc.', 73
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kal Oddars', '{}'::text[], 'Denotified — Kancheepuram, etc.', 74
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koravars', '{}'::text[], 'Denotified — Kancheepuram, etc.', 75
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kalinji Dabikoravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 76
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kootappal Kalllars', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 77
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kala Koravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 78
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kalavathila Boyas', '{}'::text[], 'Denotified', 79
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kepmaris', '{}'::text[], 'Denotified — Kancheepuram, etc.', 80
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Maravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 81
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Monda Koravars', '{}'::text[], 'Denotified', 82
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Monda Golla', '{}'::text[], 'Denotified — Salem and Namakkal', 83
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mutlakampatti', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 84
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nokkars (Denotified)', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 85
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nellorepet Oddars', '{}'::text[], 'Denotified — Vellore and Thiruvannamalai', 86
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Oddars', '{}'::text[], 'Denotified — Thanjavur, etc.', 87
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pedda Boyas', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 88
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ponnai Koravars', '{}'::text[], 'Denotified — Vellore and Thiruvannamalai', 89
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Piramalai Kallars', '{}'::text[], 'Denotified — Sivagangai, etc.', 90
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Peria Suriyur Kallars', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 91
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Padayachi (Denotified)', '{}'::text[], 'Denotified — Vellayan Kuppam (Cuddalore) and Tennore (Tiruchirapalli)', 92
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Punnan Vettuva Gounder (Denotified)', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 93
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Servai', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 94
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Salem Melnad Koravars', '{}'::text[], 'Denotified — Madurai, etc.', 95
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Salem Uppu Koravars', '{}'::text[], 'Denotified — Salem & Namakkal', 96
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sakkaraithamadai Koravars', '{}'::text[], 'Denotified — Vellore and Thiruvannamalai', 97
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Saranga Palli Koravars', '{}'::text[], 'Denotified', 98
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sooramari Oddars', '{}'::text[], 'Denotified — Salem and Namakkal', 99
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sembanad Maravars', '{}'::text[], 'Denotified — Sivaganga, etc.', 100
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thalli Koravars', '{}'::text[], 'Denotified — Salem and Namakkal', 101
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Telungapatti Chetis', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 102
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thottia Naickers', '{}'::text[], 'Denotified — Sivaganga, etc.', 103
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thogamalai Koravars or Kepmaris', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 104
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Uppukoravars or Settipalli Koravars', '{}'::text[], 'Denotified — Thanjavur, etc.', 105
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Urali Gounders', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 106
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Wayalpad or Nawalpeta Korachas', '{}'::text[], 'Denotified', 107
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vaduvarpatti Koravars', '{}'::text[], 'Denotified — Madurai, etc.', 108
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Valayars (Denotified)', '{}'::text[], 'Denotified — Madurai, etc.', 109
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vettaikarar (Denotified)', '{}'::text[], 'Denotified — Thanjavur, etc.', 110
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vetta koravars', '{}'::text[], 'Denotified — Salem and Namakkal', 111
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Varaganeri Koravars', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 112
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vettuva Gounder (Denotified)', '{}'::text[], 'Denotified — Tiruchirapalli, etc.', 113
from public.community_categories where code = 'MBC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Adi Dravida', array['adi dravidar', 'adidravidar', 'adhidravidar', 'aadhidravidar', 'adi thiravidar', 'adi dravida']::text[], null, 0
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Adi Karnataka', '{}'::text[], null, 1
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ajila', '{}'::text[], null, 2
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Ayyanavar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 3
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Baira', '{}'::text[], null, 4
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bakuda', '{}'::text[], null, 5
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bandi', '{}'::text[], null, 6
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bellara', '{}'::text[], null, 7
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Bharatar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 8
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chalavadi', '{}'::text[], null, 9
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chamar, Muchi', '{}'::text[], null, 10
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chandala', '{}'::text[], null, 11
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Cheruman', '{}'::text[], null, 12
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Devendrakula Velalar', array['devendrakulathan', 'pallan', 'kadaiyan', 'kalladi', 'kudumban', 'pannadi', 'vathiriyan']::text[], 'Includes Pallan, Kadaiyan (non-coastal), Kalladi, Kudumban, Pannadi, Vathiriyan', 13
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Dom, Dombar, Paidi, Pano', '{}'::text[], null, 14
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Domban', '{}'::text[], null, 15
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Godagali', '{}'::text[], null, 16
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Godda', '{}'::text[], null, 17
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Gosargi', '{}'::text[], null, 18
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Holeya', '{}'::text[], null, 19
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jaggali', '{}'::text[], null, 20
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Jambuvulu', '{}'::text[], null, 21
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kadaiyan', '{}'::text[], 'In coastal Tirunelveli, Thoothukudi, Ramanathapuram, Pudukottai, Thanjavur, Tiruvarur, Nagapattinam', 22
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kakkalan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 23
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kanakkan, Padanna', '{}'::text[], 'In Nilgiris District', 24
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Karimpalan', '{}'::text[], null, 25
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kavara', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 26
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koliyan', '{}'::text[], null, 27
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koosa', '{}'::text[], null, 28
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kootan, Koodan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 29
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kuravan, Sidhanar', array['kuravan', 'sidhanar']::text[], null, 30
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Maila', '{}'::text[], null, 31
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mala', '{}'::text[], null, 32
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mannan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 33
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mavilan', '{}'::text[], null, 34
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Moger', '{}'::text[], null, 35
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mundala', '{}'::text[], null, 36
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nalakeyava', '{}'::text[], null, 37
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Nayadi', '{}'::text[], null, 38
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Padannan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 39
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Palluvan', '{}'::text[], null, 40
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pambada', '{}'::text[], null, 41
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Panan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 42
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Panchama', '{}'::text[], null, 43
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Panniandi', '{}'::text[], null, 44
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Paraiyan, Parayan, Sambavar', array['paraiyan', 'parayan', 'sambavar']::text[], null, 45
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Paravan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 46
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pathiyan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 47
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pulayan, Cheramar', '{}'::text[], null, 48
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Puthirai Vannan', '{}'::text[], null, 49
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Raneyar', '{}'::text[], null, 50
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Samagara', '{}'::text[], null, 51
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Samban', '{}'::text[], null, 52
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sapari', '{}'::text[], null, 53
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Semman', '{}'::text[], null, 54
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thandan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 55
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Tiruvalluvar', '{}'::text[], null, 56
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vallon', '{}'::text[], null, 57
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Valluvan', '{}'::text[], null, 58
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vannan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 59
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Velan', '{}'::text[], null, 60
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vetan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 61
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vettiyan', '{}'::text[], null, 62
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Vettuvan', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk', 63
from public.community_categories where code = 'SC'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Adi Andhra', '{}'::text[], null, 0
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Arunthathiyar', array['arundhadhiyar', 'arundhathiyar', 'arunthadhiyar']::text[], null, 1
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Chakkiliyan', '{}'::text[], null, 2
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Madari', '{}'::text[], null, 3
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Madiga', '{}'::text[], null, 4
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pagadai', '{}'::text[], null, 5
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Thoti', '{}'::text[], null, 6
from public.community_categories where code = 'SC-A'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Adiyan', '{}'::text[], null, 0
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Aranadan', '{}'::text[], null, 1
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Eravallan', '{}'::text[], null, 2
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Irular', '{}'::text[], null, 3
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kadar', '{}'::text[], null, 4
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kammar', '{}'::text[], 'Excluding Kanyakumari and Shenkottah Taluk of Tirunelveli', 5
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kanikaran, Kanikkar', '{}'::text[], 'In Kanyakumari and Shenkottah Taluk only', 6
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kaniyan, Kanyan', '{}'::text[], null, 7
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kattunayakan', '{}'::text[], null, 8
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kochu Velan', '{}'::text[], null, 9
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Konda Kapus', '{}'::text[], null, 10
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kondareddis', '{}'::text[], null, 11
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Koraga', '{}'::text[], null, 12
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kota', '{}'::text[], 'Excluding Kanyakumari and Shenkottah Taluk', 13
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kudiya, Melakudi', '{}'::text[], null, 14
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kurichchan', '{}'::text[], null, 15
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kurumbas', '{}'::text[], 'In Nilgiris District', 16
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Kurumans', '{}'::text[], null, 17
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Maha Malasar', '{}'::text[], null, 18
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malai Arayan', '{}'::text[], null, 19
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malai Pandaram', '{}'::text[], null, 20
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malai Vedan', '{}'::text[], null, 21
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malakkuravan', '{}'::text[], null, 22
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malasar', '{}'::text[], null, 23
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malayali', array['malayali']::text[], 'In Dharmapuri, North Arcot, Pudukkottai, Salem, South Arcot and Tiruchirapalli', 24
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Malayakandi', '{}'::text[], null, 25
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mannan', '{}'::text[], null, 26
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Mudugar, Mudvan', '{}'::text[], null, 27
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Muthuvan', '{}'::text[], null, 28
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Pallayan', '{}'::text[], null, 29
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Palliyan', '{}'::text[], null, 30
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Palliyar', '{}'::text[], null, 31
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Paniyan', '{}'::text[], null, 32
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Sholaga', '{}'::text[], null, 33
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Toda', '{}'::text[], 'Excluding Kanyakumari and Shenkottah Taluk', 34
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Uraly', '{}'::text[], null, 35
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;

insert into public.castes (community_category_id, name, aliases, notes, sort_order)
select id, 'Narikoravar (Kurivikars)', array['narikoravar', 'kurivikars']::text[], null, 36
from public.community_categories where code = 'ST'
on conflict (community_category_id, name) do nothing;
