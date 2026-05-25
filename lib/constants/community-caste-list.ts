// lib/constants/community-caste-list.ts
//
// Tamil Nadu Government Communal Reservation list — full hierarchical taxonomy.
// Source: docs/admission/COMMUNITY SUB CASTE LIST.md (TN govt classification).
//
// Structure:
//   7 canonical communities (OC / BC / BC-M / MBC / SC / SC-A / ST) and ~370
//   castes nested under them. The student form and enquiry/learner-profile
//   form both use this list via <CommunityCasteSelector>.
//
// Why static (not a DB table):
//   The TN reservation list is a legal taxonomy that changes ~once every
//   5-10 years. Engineering update cadence matches that. Static keeps the
//   student form working offline (no public API needed) and ships ~5-8 KB
//   to the client gzipped. Migratable to DB tables later — this file
//   becomes the seed.
//
// Each caste has:
//   - name: canonical name as written in the official document
//   - aliases (optional): common typo/spelling variants present in
//     learners_profiles. Used by the normalization migration's fuzzy match.
//   - notes (optional): district-scoping or "(including ...)" clarifications.
//
// 2026-05-19: created from TN govt list + DB occupation audit. DNC folded
// into MBC per user decision (matches official doc). BC-CC removed as a
// community (migrated to caste='Converts to Christianity' under BC).

export type CommunityCode = 'OC' | 'BC' | 'BC-M' | 'MBC' | 'SC' | 'SC-A' | 'ST';

export interface Community {
  code: CommunityCode;
  label: string;
  /** Short bilingual description shown as helper text. */
  description?: string;
  /** Display order in the dropdown. */
  sortOrder: number;
  /** True if this community has no associated caste sub-list (e.g., OC). */
  noCasteList?: boolean;
}

export interface Caste {
  name: string;
  /** Lowercase variants/typos seen in DB. Used by the normalization migration. */
  aliases?: readonly string[];
  /** District-scoping note from the official document, for admin reference. */
  notes?: string;
}

export const COMMUNITIES: readonly Community[] = [
  {
    code: 'OC',
    label: 'Open Category (OC)',
    description: 'Forward Castes — no specific caste classification',
    sortOrder: 1,
    noCasteList: true,
  },
  { code: 'BC',   label: 'Backward Classes (BC)',                             sortOrder: 2 },
  { code: 'BC-M', label: 'Backward Classes - Muslims (BC-M)',                sortOrder: 3 },
  { code: 'MBC',  label: 'Most Backward Classes incl. Denotified (MBC)',     sortOrder: 4 },
  { code: 'SC',   label: 'Scheduled Castes (SC)',                             sortOrder: 5 },
  { code: 'SC-A', label: 'Scheduled Castes - Arunthathiyars (SC-A)',         sortOrder: 6 },
  { code: 'ST',   label: 'Scheduled Tribes (ST)',                             sortOrder: 7 },
] as const;

// ─── SCHEDULED TRIBES (items 1-37) ─────────────────────────────────────────
const ST_CASTES: readonly Caste[] = [
  { name: 'Adiyan' },
  { name: 'Aranadan' },
  { name: 'Eravallan' },
  { name: 'Irular' },
  { name: 'Kadar' },
  { name: 'Kammar', notes: 'Excluding Kanyakumari and Shenkottah Taluk of Tirunelveli' },
  { name: 'Kanikaran, Kanikkar', notes: 'In Kanyakumari and Shenkottah Taluk only' },
  { name: 'Kaniyan, Kanyan' },
  { name: 'Kattunayakan' },
  { name: 'Kochu Velan' },
  { name: 'Konda Kapus' },
  { name: 'Kondareddis' },
  { name: 'Koraga' },
  { name: 'Kota', notes: 'Excluding Kanyakumari and Shenkottah Taluk' },
  { name: 'Kudiya, Melakudi' },
  { name: 'Kurichchan' },
  { name: 'Kurumbas', notes: 'In Nilgiris District' },
  { name: 'Kurumans' },
  { name: 'Maha Malasar' },
  { name: 'Malai Arayan' },
  { name: 'Malai Pandaram' },
  { name: 'Malai Vedan' },
  { name: 'Malakkuravan' },
  { name: 'Malasar' },
  { name: 'Malayali', aliases: ['malayali'], notes: 'In Dharmapuri, North Arcot, Pudukkottai, Salem, South Arcot and Tiruchirapalli' },
  { name: 'Malayakandi' },
  { name: 'Mannan' },
  { name: 'Mudugar, Mudvan' },
  { name: 'Muthuvan' },
  { name: 'Pallayan' },
  { name: 'Palliyan' },
  { name: 'Palliyar' },
  { name: 'Paniyan' },
  { name: 'Sholaga' },
  { name: 'Toda', notes: 'Excluding Kanyakumari and Shenkottah Taluk' },
  { name: 'Uraly' },
  { name: 'Narikoravar (Kurivikars)', aliases: ['narikoravar', 'kurivikars'] },
] as const;

// ─── SCHEDULED CASTES (items 38-101) ───────────────────────────────────────
const SC_CASTES: readonly Caste[] = [
  { name: 'Adi Dravida', aliases: ['adi dravidar', 'adidravidar', 'adhidravidar', 'aadhidravidar', 'adi thiravidar', 'adi dravida'] },
  { name: 'Adi Karnataka' },
  { name: 'Ajila' },
  { name: 'Ayyanavar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Baira' },
  { name: 'Bakuda' },
  { name: 'Bandi' },
  { name: 'Bellara' },
  { name: 'Bharatar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Chalavadi' },
  { name: 'Chamar, Muchi' },
  { name: 'Chandala' },
  { name: 'Cheruman' },
  { name: 'Devendrakula Velalar', aliases: ['devendrakulathan', 'pallan', 'kadaiyan', 'kalladi', 'kudumban', 'pannadi', 'vathiriyan'], notes: 'Includes Pallan, Kadaiyan (non-coastal), Kalladi, Kudumban, Pannadi, Vathiriyan' },
  { name: 'Dom, Dombar, Paidi, Pano' },
  { name: 'Domban' },
  { name: 'Godagali' },
  { name: 'Godda' },
  { name: 'Gosargi' },
  { name: 'Holeya' },
  { name: 'Jaggali' },
  { name: 'Jambuvulu' },
  { name: 'Kadaiyan', notes: 'In coastal Tirunelveli, Thoothukudi, Ramanathapuram, Pudukottai, Thanjavur, Tiruvarur, Nagapattinam' },
  { name: 'Kakkalan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Kanakkan, Padanna', notes: 'In Nilgiris District' },
  { name: 'Karimpalan' },
  { name: 'Kavara', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Koliyan' },
  { name: 'Koosa' },
  { name: 'Kootan, Koodan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Kuravan, Sidhanar', aliases: ['kuravan', 'sidhanar'] },
  { name: 'Maila' },
  { name: 'Mala' },
  { name: 'Mannan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Mavilan' },
  { name: 'Moger' },
  { name: 'Mundala' },
  { name: 'Nalakeyava' },
  { name: 'Nayadi' },
  { name: 'Padannan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Palluvan' },
  { name: 'Pambada' },
  { name: 'Panan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Panchama' },
  { name: 'Panniandi' },
  { name: 'Paraiyan, Parayan, Sambavar', aliases: ['paraiyan', 'parayan', 'sambavar'] },
  { name: 'Paravan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Pathiyan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Pulayan, Cheramar' },
  { name: 'Puthirai Vannan' },
  { name: 'Raneyar' },
  { name: 'Samagara' },
  { name: 'Samban' },
  { name: 'Sapari' },
  { name: 'Semman' },
  { name: 'Thandan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Tiruvalluvar' },
  { name: 'Vallon' },
  { name: 'Valluvan' },
  { name: 'Vannan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Velan' },
  { name: 'Vetan', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Vettiyan' },
  { name: 'Vettuvan', notes: 'In Kanyakumari and Shenkottah Taluk' },
] as const;

// ─── SCHEDULED CASTES ARUNTHATHIYARS (items 102-108) ───────────────────────
const SC_A_CASTES: readonly Caste[] = [
  { name: 'Adi Andhra' },
  { name: 'Arunthathiyar', aliases: ['arundhadhiyar', 'arundhathiyar', 'arunthadhiyar'] },
  { name: 'Chakkiliyan' },
  { name: 'Madari' },
  { name: 'Madiga' },
  { name: 'Pagadai' },
  { name: 'Thoti' },
] as const;

// ─── MOST BACKWARD CLASSES + DENOTIFIED (items 109-222) ────────────────────
// Per user decision, Denotified Communities are folded into MBC (matching the
// official doc's grouping).
const MBC_CASTES: readonly Caste[] = [
  // 109-154: MBC proper
  { name: 'Ambalakarar' },
  { name: 'Andipandaram' },
  { name: 'Arayar', notes: 'In Kanyakumari District' },
  { name: 'Bestha, Siviar' },
  { name: 'Bhatraju', notes: 'Other than Kshatriya Raju' },
  { name: 'Boyar, Oddar', aliases: ['boyar', 'oddar'] },
  { name: 'Dasari' },
  { name: 'Dommara' },
  { name: 'Eravallar', notes: 'Except Kanyakumari/Shenkottah where ST' },
  { name: 'Isaivellalar' },
  { name: 'Jambuvanodai' },
  { name: 'Jangam' },
  { name: 'Jogi' },
  { name: 'Kongu Chettia', notes: 'In Coimbatore and Erode only' },
  { name: 'Koracha' },
  { name: 'Kulala', aliases: ['kulala', 'kuyavar', 'kumbarar'], notes: 'Including Kuyavar and Kumbarar' },
  { name: 'Kulunuvar Mannadi' },
  { name: 'Kurumba, Kurumba Gounder', aliases: ['kurumba'] },
  { name: 'Kuruhini Chetty' },
  { name: 'Latin Catholic Christian Vannar', notes: 'In Kanyakumari District' },
  { name: 'Maruthuvar, Navithar, Mangala, Velakattalavar', aliases: ['maruthuvar', 'navithar', 'mangala', 'velakattalavar'] },
  { name: 'Mond Golla' },
  { name: 'Moundadan Chetty' },
  { name: 'Mahendra, Medara' },
  { name: 'Nokkar' },
  { name: 'Panisaivan, Panisivan' },
  {
    name: 'Vanniakula Kshatriya',
    aliases: ['vanniakula kshatriya', 'vanniyar', 'vanniya', 'vannia gounder', 'gounder or kander', 'padayachi', 'padaiyachi', 'palli', 'agnikula kshatriya'],
    notes: 'Including Vanniyar, Vanniya, Vannia Gounder, Padayachi, Palli, Agnikula Kshatriya',
  },
  { name: 'Paravar', notes: 'Except Kanyakumari/Shenkottah where SC' },
  { name: 'Paravar converts to Christianity', notes: 'Including converts in Kanyakumari/Shenkottah' },
  { name: 'Meenavar, Parvatharajakulam, Pattanavar, Sembadavar', aliases: ['meenavar', 'parvatharajakulam', 'pattanavar', 'sembadavar'], notes: 'Including converts to Christianity' },
  { name: 'Mukkuvar, Mukayar', aliases: ['mukkuvar', 'mukayar'], notes: 'Including converts to Christianity' },
  { name: 'Punnan Vettuva Gounder' },
  { name: 'Pannayar', notes: 'Other than Kathikarar in Kanyakumari' },
  { name: 'Sathatha Srivaishnava', aliases: ['sathani', 'chattadi', 'chattada srivaishnava'] },
  { name: 'Sozhia Chetty' },
  { name: 'Telugupatty Chetty' },
  { name: 'Thotti Naicker', aliases: ['rajakambalam', 'gollavar', 'sillavar', 'thockalavar', 'thozhuva naicker', 'erragollar'] },
  { name: 'Thondaman' },
  { name: 'Thoraiyar', notes: 'Nilgiris' },
  { name: 'Thoraiyar', notes: 'Plains' },
  { name: 'Transgender or Eunuch', aliases: ['thirunangai', 'aravani'] },
  { name: 'Valaiyar', aliases: ['valayar', 'chettinad valayars'] },
  { name: 'Vannar', aliases: ['vannar', 'agasa', 'madivala', 'ekali', 'rajakula', 'veluthadar', 'rajaka'], notes: 'Except Kanyakumari/Shenkottah where SC' },
  { name: 'Vettaikarar' },
  { name: 'Vettuva Gounder', aliases: ['vettuva gounder'] },
  { name: 'Yogeeswarar' },
  // 155-222: Denotified Communities (folded into MBC)
  { name: 'Attur Kilnad Koravars', notes: 'Denotified — Salem, Namakkal, etc.' },
  { name: 'Attur Melnad Koravars', notes: 'Denotified — Salem, Namakkal' },
  { name: 'Appanad Kondayam Kottai Maravar', notes: 'Denotified — Sivaganga, Virudhunagar, etc.' },
  { name: 'Ambalakarar (Denotified)', notes: 'Denotified — Thanjavur, Nagapattinam, etc.' },
  { name: 'Ambalakkarar (Suriyanur)', notes: 'Denotified — Tiruchirapalli' },
  { name: 'Boyas', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Battu Turkas', notes: 'Denotified' },
  { name: 'C.K. Koravars', notes: 'Denotified — Cuddalore and Villupuram' },
  { name: 'Chakkala', notes: 'Denotified — Sivaganga, etc.' },
  { name: 'Changyampudi Koravars', notes: 'Denotified — Vellore and Thiruvannamalai' },
  { name: 'Chettinad Valayars', notes: 'Denotified — Sivaganga, etc.' },
  { name: 'Dombs', notes: 'Denotified — Pudukkottai, etc.' },
  { name: 'Dobba Koravars', notes: 'Denotified — Salem and Namakkal' },
  { name: 'Dommars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Donga Boya', notes: 'Denotified' },
  { name: 'Donga Ur. Korachas', notes: 'Denotified' },
  { name: 'Devagudi Talayaris', notes: 'Denotified' },
  { name: 'Dobbai Korachas', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Dabi Koravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Donga Dasaris', notes: 'Denotified — Kancheepuram, etc.' },
  { name: 'Gorrela Dodda Boya', notes: 'Denotified' },
  { name: 'Gudu Dasaris', notes: 'Denotified' },
  { name: 'Gandarvakottai Koravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Gandarvakottai Kallars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Inji Koravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Jogis (Denotified)', notes: 'Denotified — Kancheepuram, etc.' },
  { name: 'Jambavanodai', notes: 'Denotified' },
  { name: 'Kaladis', notes: 'Denotified — Sivaganga, etc.' },
  { name: 'Kal Oddars', notes: 'Denotified — Kancheepuram, etc.' },
  { name: 'Koravars', notes: 'Denotified — Kancheepuram, etc.' },
  { name: 'Kalinji Dabikoravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Kootappal Kalllars', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Kala Koravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Kalavathila Boyas', notes: 'Denotified' },
  { name: 'Kepmaris', notes: 'Denotified — Kancheepuram, etc.' },
  { name: 'Maravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Monda Koravars', notes: 'Denotified' },
  { name: 'Monda Golla', notes: 'Denotified — Salem and Namakkal' },
  { name: 'Mutlakampatti', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Nokkars (Denotified)', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Nellorepet Oddars', notes: 'Denotified — Vellore and Thiruvannamalai' },
  { name: 'Oddars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Pedda Boyas', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Ponnai Koravars', notes: 'Denotified — Vellore and Thiruvannamalai' },
  { name: 'Piramalai Kallars', notes: 'Denotified — Sivagangai, etc.' },
  { name: 'Peria Suriyur Kallars', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Padayachi (Denotified)', notes: 'Denotified — Vellayan Kuppam (Cuddalore) and Tennore (Tiruchirapalli)' },
  { name: 'Punnan Vettuva Gounder (Denotified)', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Servai', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Salem Melnad Koravars', notes: 'Denotified — Madurai, etc.' },
  { name: 'Salem Uppu Koravars', notes: 'Denotified — Salem & Namakkal' },
  { name: 'Sakkaraithamadai Koravars', notes: 'Denotified — Vellore and Thiruvannamalai' },
  { name: 'Saranga Palli Koravars', notes: 'Denotified' },
  { name: 'Sooramari Oddars', notes: 'Denotified — Salem and Namakkal' },
  { name: 'Sembanad Maravars', notes: 'Denotified — Sivaganga, etc.' },
  { name: 'Thalli Koravars', notes: 'Denotified — Salem and Namakkal' },
  { name: 'Telungapatti Chetis', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Thottia Naickers', notes: 'Denotified — Sivaganga, etc.' },
  { name: 'Thogamalai Koravars or Kepmaris', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Uppukoravars or Settipalli Koravars', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Urali Gounders', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Wayalpad or Nawalpeta Korachas', notes: 'Denotified' },
  { name: 'Vaduvarpatti Koravars', notes: 'Denotified — Madurai, etc.' },
  { name: 'Valayars (Denotified)', notes: 'Denotified — Madurai, etc.' },
  { name: 'Vettaikarar (Denotified)', notes: 'Denotified — Thanjavur, etc.' },
  { name: 'Vetta koravars', notes: 'Denotified — Salem and Namakkal' },
  { name: 'Varaganeri Koravars', notes: 'Denotified — Tiruchirapalli, etc.' },
  { name: 'Vettuva Gounder (Denotified)', notes: 'Denotified — Tiruchirapalli, etc.' },
] as const;

// ─── BACKWARD CLASSES (items 223-364) ──────────────────────────────────────
const BC_CASTES: readonly Caste[] = [
  { name: 'Agamudayar', aliases: ['agamudaiyar', 'agamudayar', 'thozhu vellala'], notes: 'Including Thozhu Vellala' },
  { name: 'Thuluva Vellala', aliases: ['thuluva vellala', 'thuluva vellalar'] },
  { name: 'Agaram Vellan Chettiar' },
  { name: 'Alwar, Azhavar and Alavar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Servai (BC)', notes: 'Except Tiruchirapalli, Karur, Perambalur and Pudukottai' },
  { name: 'Nulayar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Archakarai Vellala' },
  { name: 'Aryavathi', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Ayira Vaisyar' },
  { name: 'Badagar' },
  { name: 'Billava' },
  { name: 'Bondil' },
  { name: 'Boyas (BC)', notes: 'Except Tiruchirapalli, Karur, etc.' },
  { name: 'Chakkala (BC)', notes: 'Except Sivaganga, Virudhunagar, etc.' },
  { name: 'Chavalakarar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Chettu, Chetty', aliases: ['kottar chetty', 'elur chetty', 'pathira chetty', 'valayal chetty', 'pudukadai chetty'], notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Chowdry' },
  { name: 'Converts to Christianity', notes: 'From any Hindu BC/MBC/Denotified community, except specified exclusions' },
  { name: 'C.S.I (formerly S.I.U.C)', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Donga Dasaris (BC)', notes: 'Except specified districts' },
  { name: 'Devangar, Sedar', aliases: ['devangar', 'sedar'] },
  { name: 'Dombs (BC)', notes: 'Except specified districts' },
  { name: 'Dommars (BC)', notes: 'Except specified districts' },
  { name: 'Enadi' },
  { name: 'Ezhavathy', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Ezhuthachar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Ezhuva', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Gangavar' },
  { name: 'Gavara, Gavarai and Vadugar', aliases: ['gavara', 'gavarai', 'vadugar', 'vaduvar'], notes: 'Other than Kamma, Kapu, Balija, Reddi' },
  { name: 'Gounder' },
  { name: 'Gowda', aliases: ['gowda', 'gammala', 'kalali', 'anuppa gounder'] },
  { name: 'Hegde' },
  { name: 'Idiga' },
  { name: 'Illathu Pillaimar, Illuvar, Ezhuvar, Illathar' },
  { name: 'Jhetty' },
  { name: 'Jogis (BC)', notes: 'Except specified districts' },
  { name: 'Kabbera' },
  { name: 'Kaikolar, Sengunthar', aliases: ['kaikolar', 'sengunthar'] },
  { name: 'Kaladi (BC)', notes: 'Except specified districts' },
  { name: 'Kalari Kurup, Kalari Panicker', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Kalingi' },
  { name: 'Kallar', aliases: ['kallar', 'easanattu kallar'], notes: 'Including various sub-types' },
  { name: 'Kallar Kula Thondaman' },
  { name: 'Kalveli Gounder' },
  { name: 'Kambar' },
  { name: 'Kammalar, Viswakarma', aliases: ['kammalar', 'viswakarma', 'vishwakarma', 'thattar', 'porkollar', 'kannar', 'karumar', 'kollar', 'thacher', 'kal thacher', 'kamsala', 'viswa brahmin'], notes: 'Including Thattar, Porkollar, Kannar, etc.' },
  { name: 'Kani, Kanisu, Kaniyar Panicker' },
  { name: 'Kaniyala Vellalar' },
  { name: 'Kannada Saineegar, Kannadiyar', notes: 'Throughout state; Dasapalanjika in Coimbatore/Erode/Nilgiris' },
  { name: 'Kannadiya Naidu' },
  { name: 'Karpoora Chettiar' },
  { name: 'Karuneegar', aliases: ['seer karuneegar', 'sri karuneegar', 'sarattu karuneegar', 'kaikatti karuneegar', 'mathuvazhi kanakkar', 'sozhi kanakkar', 'sunnambu karuneegar'] },
  { name: 'Kasukkara Chettiar' },
  { name: 'Katesar, Pattamkatti' },
  { name: 'Kavuthiyar' },
  { name: 'Kerala Mudali' },
  { name: 'Kharvi' },
  { name: 'Khatri' },
  { name: 'Kongu Vaishnava' },
  { name: 'Kongu Vellalars', aliases: ['kongu vellalar', 'kongu vellalars', 'kongu vellalar gounder', 'vellala gounder', 'nattu gounder', 'narambukkatti gounder', 'tirumudi vellalar', 'thondu vellalar', 'pala gounder', 'poosari gounder', 'anuppa vellala gounder', 'padaithalai gounder', 'chendalai gounder', 'pavalankatti vellala gounder', 'palavellala gounder', 'sanku vellala gounder', 'rathinagiri gounder'] },
  { name: 'Koppala Velama' },
  { name: 'Koteyar' },
  { name: 'Krishnanvaka', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Kudikara Vellalar' },
  { name: 'Kudumbi', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Kuga Vellalar' },
  { name: 'Kunchidigar' },
  { name: 'Latin Catholics', notes: 'Except Latin Catholic Vannar in Kanyakumari' },
  { name: 'Latin Catholics (Shenkottah)', notes: 'In Shenkottah Taluk of Tirunelveli' },
  { name: 'Lambadi' },
  { name: 'Lingayat (Jangama)' },
  { name: 'Mahratta (Non-Brahmin)', aliases: ['mahratta', 'namdev mahratta'] },
  { name: 'Malayar' },
  { name: 'Male' },
  { name: 'Maniagar' },
  { name: 'Maravars (BC)', aliases: ['maravar', 'karumaravars'], notes: 'Except specified districts' },
  { name: 'Moondrumandai Enbathunalu Ur Sozhia Vellalar' },
  { name: 'Mooppan' },
  { name: 'Muthuraja, Muthuracha, Muttiriyar, Mutharaiyar', aliases: ['muthuraja', 'muthuracha', 'muttiriyar', 'mutharaiyar'] },
  { name: 'Nadar, Shanar, Gramani', aliases: ['nadar', 'shanar', 'gramani', 'christian nadar'] },
  { name: 'Nagaram' },
  { name: 'Naikkar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Nangudi Vellalar' },
  { name: 'Nanjil Mudali', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Odar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Odiya' },
  { name: 'Oottruvalanattu Vellalar' },
  { name: 'O.P.S. Vellalar' },
  { name: 'Ovachar' },
  { name: 'Paiyur Kotta Vellalar' },
  { name: 'Pamulu' },
  { name: 'Panar', notes: 'Except Kanyakumari/Shenkottah where SC' },
  { name: 'Pandiya Vellalar' },
  { name: 'Kathikarar', notes: 'In Kanyakumari District' },
  { name: 'Pannirandam Chettiar, Uthama Chettiar' },
  { name: 'Parkavakulam', aliases: ['surithimar', 'nathamar', 'malayamar', 'moopanar', 'nainar'] },
  { name: 'Perike', aliases: ['perike balija'] },
  { name: 'Perumkollar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Podikara Vellalar' },
  { name: 'Pooluva Gounder' },
  { name: 'Poraya' },
  { name: 'Pulavar', notes: 'In Coimbatore and Erode' },
  { name: 'Pulluvar, Pooluvar' },
  { name: 'Pusala' },
  { name: 'Reddy (Ganjam)', aliases: ['reddy'] },
  { name: 'Sadhu Chetty', aliases: ['telugu chetty', 'twenty four manai telugu chetty'] },
  { name: 'Sakkaravar, Kavathi', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Salivagana' },
  { name: 'Saliyar, Padmasaliyar, Pattusaliyar, Pattariyar, Adhaviyar', aliases: ['saliyar', 'padmasaliyar', 'pattusaliyar'] },
  { name: 'Savalakkarar' },
  { name: 'Senaithalaivar, Senaikudiyar, Illaivaniar' },
  { name: 'Serakula Vellalar' },
  { name: 'Sourashtra (Patnulkarar)' },
  { name: 'Sozhia Vellalar', aliases: ['sozhia vellalar', 'sozhiya vellalar', 'sozha vellalar', 'vetrilaikarar', 'kodikalkarar', 'keeraikarar'] },
  { name: 'Srisayar' },
  { name: 'Sundaram Chetty' },
  { name: 'Thogatta Veerakshatriya' },
  { name: 'Tholkollar', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Tholuva Naicker, Vetalakara Naicker' },
  { name: 'Thoraiyar (BC)' },
  { name: 'Thoriyar' },
  { name: 'Ukkirakula Kshatriya Naicker' },
  { name: 'Uppara, Uppillia, Sagara', aliases: ['uppara', 'uppillia', 'sagara'] },
  { name: 'Urali Gounder (BC)', notes: 'Except specified districts' },
  { name: 'Urikkara Nayakkar' },
  { name: 'Virakodi Vellala' },
  { name: 'Vallambar' },
  { name: 'Vallanattu Chettiar' },
  { name: 'Valmiki' },
  { name: 'Vaniyar, Vania Chettiar', aliases: ['vaniyar', 'vania chettiar', 'gandla', 'ganika', 'telikula', 'chekkalar'] },
  { name: 'Veduvar, Vedar', notes: 'Except Kanyakumari/Shenkottah where SC' },
  { name: 'Veerasaiva', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Velar' },
  { name: 'Vellan Chettiar' },
  { name: 'Veluthodathu Nair', notes: 'In Kanyakumari and Shenkottah Taluk' },
  { name: 'Vokkaligar', aliases: ['vokkaligar', 'vakkaligar', 'okkaligar', 'kappiliyar', 'kappiliya', 'okkaliga gowda', 'okkaliya gowda', 'okkaliya gowder'] },
  { name: 'Wynad Chetty', notes: 'Nilgiris' },
  { name: 'Yadhava', aliases: ['yadhava', 'idaiyar', 'vaduga ayar', 'vaduga idaiyar', 'golla', 'asthanthra golla'] },
  { name: 'Yavana' },
  { name: 'Yerukula' },
  { name: 'Orphans and destitute children', notes: 'Per official orphan/destitute provisions' },
  { name: 'Thiyya' },
  { name: 'Converts to Christianity (BC origin)', notes: 'From BC/MBC/Denotified, except specified marine castes' },
] as const;

// ─── BACKWARD CLASSES MUSLIMS (items 365-371) ──────────────────────────────
const BC_M_CASTES: readonly Caste[] = [
  { name: 'Ansar' },
  { name: 'Dekkani Muslims' },
  { name: 'Dudekula' },
  { name: 'Labbai', aliases: ['labbai', 'labbais', 'lebbai', 'rowthar', 'marakayar'], notes: 'Including Rowthar and Marakayar' },
  { name: 'Mapilla' },
  { name: 'Sheik' },
  { name: 'Syed' },
] as const;

export const CASTES_BY_COMMUNITY: Readonly<Record<CommunityCode, readonly Caste[]>> = {
  OC: [],
  BC: BC_CASTES,
  'BC-M': BC_M_CASTES,
  MBC: MBC_CASTES,
  SC: SC_CASTES,
  'SC-A': SC_A_CASTES,
  ST: ST_CASTES,
};

/**
 * Lookup helper: given a saved community code, return the canonical
 * Community entry (or undefined for legacy/unknown codes).
 */
export function findCommunity(code: string | null | undefined): Community | undefined {
  if (!code) return undefined;
  const trimmed = code.trim().toUpperCase();
  return COMMUNITIES.find((c) => c.code === trimmed);
}

/**
 * Lookup helper: given a saved caste name, search across all communities
 * for a matching canonical caste. Returns { community, caste } if found.
 * Match is case-insensitive on `name` or any entry in `aliases`.
 */
export function findCasteInCommunity(
  communityCode: CommunityCode,
  saved: string | null | undefined,
): Caste | undefined {
  if (!saved) return undefined;
  const lower = saved.trim().toLowerCase();
  if (!lower) return undefined;
  const list = CASTES_BY_COMMUNITY[communityCode];
  return list.find(
    (c) =>
      c.name.toLowerCase() === lower ||
      (c.aliases?.some((a) => a.toLowerCase() === lower) ?? false),
  );
}
