// File: lib/onemark/pdf/samples.ts
//
// OneMark — fixture papers for the renderer's tests and the eyeball script
// (scripts/onemark/render-paper-samples.ts). Not production data: the bank is
// empty until Lane I's ingestion and a subject Senior Learner's approvals.
//
// The Physics items reproduce the notation the PRD's §4.1 table and §5.2
// notation inventory say MUST render: negative exponents, ×10⁻⁵, µ₀ε₀,
// Boolean overlines, isotope pre-scripts, √, fractions. Tamil for Q1, Q2 and
// the equipotential item is copied verbatim from PRD Physics §5.1; the rest
// is short, machine-typed Tamil that needs native review (CLAUDE.md #24) —
// it exercises shaping, it is not board copy.

import { OneMarkExamKeys } from '@/types/onemark';
import { directiveForTags } from './load-paper';
import type { PaperItem, PaperModel, PaperOption } from './types';

function opts(...texts: string[]): PaperOption[] {
  return texts.map((text, i) => ({ key: String.fromCharCode(97 + i), text }));
}

interface Seed {
  stemEn: string;
  stemTa?: string;
  en: string[];
  ta?: string[];
  answer: string;
  explanationEn?: string;
  explanationTa?: string;
  tags: string[];
  bloom: string;
  unit: number;
  unitTitle: string;
  layout?: PaperItem['optionLayout'];
}

function build(examKey: string, unitPrefix: string, seeds: Seed[]): PaperItem[] {
  return seeds.map((s, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    position: i + 1,
    stemEn: s.stemEn,
    stemTa: s.stemTa ?? null,
    optionsEn: opts(...s.en),
    optionsTa: s.ta ? opts(...s.ta) : null,
    answerKey: s.answer,
    explanationEn: s.explanationEn ?? null,
    explanationTa: s.explanationTa ?? null,
    optionLayout: s.layout ?? 'auto',
    tags: s.tags,
    bloomLevel: s.bloom,
    topicLabel: s.unit === 99 ? 'Grammar (General) — not anchored to any lesson' : `Unit ${s.unit}: ${s.unitTitle}`,
    topicKey: s.unit === 99 ? `${unitPrefix}_grammar_general` : `${unitPrefix}_u${String(s.unit).padStart(2, '0')}`,
    directive: directiveForTags(examKey, s.tags),
  }));
}

const PHYSICS_SEEDS: Seed[] = [
  {
    stemEn: 'In the combination of the following gates, write the Boolean equation for output Y in terms of input A, B, C.',
    stemTa: 'கீழ்க்காணும் லாஜிக் கேட்டுகளின் சேர்க்கையில், உள்ளீடுகள் A, B, C கொண்டு வெளியீடு Y-க்கான பூலியன் சமன்பாடு எழுதுக.',
    en: ['A̅ B C̅', 'A B̅ C', 'A̅ + B̅ + C̅', 'A̅ + B + C̅'],
    ta: ['A̅ B C̅', 'A B̅ C', 'A̅ + B̅ + C̅', 'A̅ + B + C̅'],
    answer: 'c',
    explanationEn: 'NOT feeds NOR, output ANDed with C. De Morgan reduction.',
    tags: ['diagram_interpretation'],
    bloom: 'K4',
    unit: 10,
    unitTitle: 'Electronics and Communication',
  },
  {
    stemEn: 'If a material having intensity of magnetisation 500 Am⁻¹ is placed in a magnetising field of 1000 Am⁻¹, then the susceptibility of the material is :',
    stemTa: '500 Am⁻¹ காந்தமாக்கு செறிவு கொண்ட பொருளினை 1000 Am⁻¹ மதிப்புடைய காந்தமாக்கு புலத்தில் வைக்கும்போது அப்பொருளின் காந்த ஏற்புத்திறன் யாது ?',
    en: ['0.2', '0.8', '0.7', '0.5'],
    ta: ['0.2', '0.8', '0.7', '0.5'],
    answer: 'd',
    explanationEn: 'χ = I / H = 500 / 1000 = 0.5.',
    explanationTa: 'χ = I / H = 500 / 1000 = 0.5.',
    tags: ['numerical_single_step'],
    bloom: 'K3',
    unit: 3,
    unitTitle: 'Magnetism and Magnetic Effects of Electric Current',
  },
  {
    stemEn: 'A transformer has 410 turns in the primary and 1230 turns in the secondary. If the primary current is 6 A, the secondary current is :',
    stemTa: 'மின்மாற்றி (needs native review): முதன்மைச் சுருள் 410 சுற்றுகள், துணைச் சுருள் 1230 சுற்றுகள். முதன்மை மின்னோட்டம் 6 A எனில் துணை மின்னோட்டம் :',
    en: ['18 A', '2 A', '6 A', '3 A'],
    ta: ['18 A', '2 A', '6 A', '3 A'],
    answer: 'b',
    explanationEn: 'Iₛ = Iₚ × Nₚ / Nₛ = 6 × 410 / 1230 = 2 A.',
    tags: ['numerical_single_step', 'device_principle'],
    bloom: 'K3',
    unit: 4,
    unitTitle: 'Electromagnetic Induction and Alternating Current',
  },
  {
    stemEn: 'The dimension of 1/µ₀ε₀ is :',
    // Case suffix glued to the notation, as Tamil writes it — the font audit
    // must see "இன்" as body text, not as a KaTeX \text{} run.
    stemTa: '1/µ₀ε₀இன் பரிமாணம் :',
    en: ['[LT⁻¹]', '[L²T⁻²]', '[L⁻²T²]', '[LT⁻²]'],
    ta: ['[LT⁻¹]', '[L²T⁻²]', '[L⁻²T²]', '[LT⁻²]'],
    answer: 'b',
    explanationEn: '1/µ₀ε₀ = c², the square of a speed.',
    tags: ['dimensional_analysis'],
    bloom: 'K2',
    unit: 5,
    unitTitle: 'Electromagnetic Waves',
  },
  {
    stemEn: 'In a single-slit diffraction experiment the slit width is 1.0×10⁻⁵ cm and the first minimum is observed at 30°. The wavelength of light used is :',
    stemTa: 'ஒற்றைப் பிளவு விளிம்பு விளைவில் பிளவின் அகலம் 1.0×10⁻⁵ cm; முதல் குறைந்தபட்சம் 30° இல் காணப்படுகிறது. பயன்படுத்திய ஒளியின் அலைநீளம் :',
    en: ['500 Å', '600 Å', '5000 Å', '6000 Å'],
    ta: ['500 Å', '600 Å', '5000 Å', '6000 Å'],
    answer: 'a',
    explanationEn: 'a sin θ = λ ⇒ λ = 1.0×10⁻⁷ m × 0.5 = 5.0×10⁻⁸ m = 500 Å.',
    tags: ['numerical_single_step'],
    bloom: 'K3',
    unit: 7,
    unitTitle: 'Wave Optics',
  },
  {
    stemEn: 'The number of nuclei remaining after a time $t = \\tfrac{1}{2}T_{1/2}$ is :',
    stemTa: '$t = \\tfrac{1}{2}T_{1/2}$ காலத்திற்குப் பின் எஞ்சியுள்ள அணுக்கருக்களின் எண்ணிக்கை :',
    en: ['N₀/2', 'N₀/√2', 'N₀/4', '√2 N₀'],
    ta: ['N₀/2', 'N₀/√2', 'N₀/4', '√2 N₀'],
    answer: 'b',
    explanationEn: '$N = N_0 \\left(\\tfrac{1}{2}\\right)^{t/T}$ with $t/T = \\tfrac{1}{2}$ gives N₀/√2.',
    tags: ['formula_recall'],
    bloom: 'K3',
    unit: 9,
    unitTitle: 'Atomic and Nuclear Physics',
  },
  {
    stemEn: 'The mass defect of ⁷₃Li is 0.042 u. Its binding energy per nucleon is about :',
    stemTa: '⁷₃Li இன் நிறைக் குறைவு 0.042 u. ஒரு நியூக்ளியானுக்கான பிணைப்பு ஆற்றல் தோராயமாக :',
    en: ['39.1 MeV', '5.6 MeV', '0.042 MeV', '931 MeV'],
    ta: ['39.1 MeV', '5.6 MeV', '0.042 MeV', '931 MeV'],
    answer: 'b',
    explanationEn: '0.042 u × 931 MeV/u = 39.1 MeV; divided by 7 nucleons ≈ 5.6 MeV.',
    tags: ['numerical_single_step', 'unit_conversion'],
    bloom: 'K3',
    unit: 9,
    unitTitle: 'Atomic and Nuclear Physics',
  },
  {
    stemEn: 'An electric dipole placed at 30° to a uniform electric field of 2×10⁵ NC⁻¹ experiences a torque of 8 Nm. If the dipole length is 2 cm, the charge on the dipole is :',
    stemTa: '2×10⁵ NC⁻¹ சீரான மின்புலத்தில் 30° கோணத்தில் வைக்கப்பட்ட மின் இருமுனை 8 Nm திருப்புவிசையை உணர்கிறது. இருமுனையின் நீளம் 2 cm எனில் மின்னூட்டம் :',
    en: ['4 mC', '2 mC', '8 mC', '6 mC'],
    ta: ['4 mC', '2 mC', '8 mC', '6 mC'],
    answer: 'a',
    explanationEn: 'τ = pE sin θ ⇒ p = 8 / (2×10⁵ × 0.5) = 8×10⁻⁵ Cm; q = p / l = 4×10⁻³ C.',
    tags: ['numerical_single_step'],
    bloom: 'K3',
    unit: 1,
    unitTitle: 'Electrostatics',
  },
  {
    stemEn: 'Which of the following statement is/are true for equipotential surface ?',
    stemTa: 'பின்வருவனவற்றுள் சம மின்னழுத்தப் பரப்பை பொருத்து சரியான கூற்று/கூற்றுகள் எவை ?',
    en: [
      'The potential is different for different equipotential surfaces.',
      'Electric field must always be normal to equipotential surface.',
      'Work done to move a charge between any two points is zero.',
      'All of the above.',
    ],
    ta: [
      'வெவ்வேறு சம மின்னழுத்தப் பரப்பிற்கு மின்னழுத்தம் வெவ்வேறாக இருக்கும்.',
      'சம மின்னழுத்தப் பரப்புக்கு செங்குத்தாகவே மின்புலம் எப்போதும் அமையும்.',
      'இரு புள்ளிகளுக்கு இடையே மின்னூட்டம் கொண்ட மின்துகளை நகர்த்த செய்யப்படும் வேலை சுழியாகும்.',
      'மேற்கண்ட அனைத்தும்.',
    ],
    answer: 'd',
    explanationEn: 'All three statements hold for an equipotential surface.',
    tags: ['assertion_set'],
    bloom: 'K2',
    unit: 1,
    unitTitle: 'Electrostatics',
  },
  {
    stemEn: 'The Fresnel distance for light of wavelength 500 nm passing through an aperture of 0.5 mm is :',
    stemTa: '500 nm அலைநீள ஒளி 0.5 mm துளை வழியே செல்லும்போது ஃபிரெனல் தொலைவு :',
    en: ['0.5 m', '5 m', '50 cm', '5 cm'],
    ta: ['0.5 m', '5 m', '50 cm', '5 cm'],
    answer: 'a',
    explanationEn: 'z = a²/λ = (5×10⁻⁴)² / 5×10⁻⁷ = 0.5 m.',
    tags: ['numerical_single_step'],
    bloom: 'K3',
    unit: 7,
    unitTitle: 'Wave Optics',
  },
  {
    stemEn: "For Joule's heating, the graph of heat H against I² (with R and t constant) is :",
    stemTa: 'ஜூல் வெப்ப விளைவில், R மற்றும் t மாறிலிகளாக இருக்க H – I² வரைபடம் :',
    en: ['a straight line', 'a parabola', 'a hyperbola', 'a circle'],
    ta: ['நேர்க்கோடு', 'பரவளையம்', 'அதிபரவளையம்', 'வட்டம்'],
    answer: 'a',
    explanationEn: 'H = I²Rt is linear in I².',
    tags: ['graph_relationship'],
    bloom: 'K2',
    unit: 2,
    unitTitle: 'Current Electricity',
  },
  {
    stemEn: 'The application field of the nano product "ski wax" is :',
    stemTa: '"ski wax" என்ற நானோ தயாரிப்பின் பயன்பாட்டுத் துறை :',
    en: ['medicine', 'sports', 'textiles', 'agriculture'],
    ta: ['மருத்துவம்', 'விளையாட்டு', 'ஜவுளி', 'வேளாண்மை'],
    answer: 'b',
    explanationEn: 'Nano-structured ski wax reduces friction — a sports application (textbook table, Unit 11).',
    tags: ['application_field'],
    bloom: 'K1',
    unit: 11,
    unitTitle: 'Recent Developments in Physics',
  },
  {
    stemEn: 'Emission of electrons from a metal surface by the absorption of heat is called _____ emission.',
    stemTa: 'வெப்பத்தை உட்கவர்வதால் உலோகப் பரப்பிலிருந்து எலக்ட்ரான்கள் வெளியேறுவது _____ உமிழ்வு எனப்படும்.',
    en: ['photoelectric', 'field', 'thermionic', 'secondary'],
    ta: ['ஒளிமின்', 'புல', 'வெப்ப அயனி', 'இரண்டாம் நிலை'],
    answer: 'c',
    explanationEn: 'Heat-driven electron emission is thermionic emission.',
    tags: ['fill_in_blank'],
    bloom: 'K1',
    unit: 8,
    unitTitle: 'Dual Nature of Radiation and Matter',
  },
  {
    stemEn: 'In calcite, along the optic axis, the ratio of the velocity of the extraordinary ray to that of the ordinary ray $\\dfrac{v_e}{v_o}$ is :',
    stemTa: 'கால்சைட்டில் ஒளி அச்சின் வழியே அசாதாரணக் கதிர் மற்றும் சாதாரணக் கதிர் திசைவேகங்களின் விகிதம் $\\dfrac{v_e}{v_o}$ :',
    en: ['1', '√2', '1/√2', '2'],
    ta: ['1', '√2', '1/√2', '2'],
    answer: 'a',
    explanationEn: 'Along the optic axis both rays travel at the same speed.',
    tags: ['comparison_ratio'],
    bloom: 'K2',
    unit: 6,
    unitTitle: 'Ray Optics',
  },
  {
    stemEn: 'Two wires A and B of the same material and length have resistances $R_A = 3R_B$. The ratio of their radii $r_A : r_B$ is :',
    stemTa: 'ஒரே பொருளாலான, ஒரே நீளமுள்ள இரு கம்பிகள் A, B இன் மின்தடைகள் $R_A = 3R_B$. அவற்றின் ஆரங்களின் விகிதம் $r_A : r_B$ :',
    en: ['3 : 1', '1 : 3', '1 : √3', '√3 : 1'],
    ta: ['3 : 1', '1 : 3', '1 : √3', '√3 : 1'],
    answer: 'c',
    explanationEn: 'R ∝ 1/r² ⇒ r_A/r_B = √(R_B/R_A) = 1/√3.',
    tags: ['comparison_ratio'],
    bloom: 'K3',
    unit: 2,
    unitTitle: 'Current Electricity',
  },
];

const ENGLISH_SEEDS: Seed[] = [
  { stemEn: 'They were childish enough, and in many ways quite <u>artless</u>.', en: ['innocent', 'humble', 'playful', 'generous'], answer: 'a', explanationEn: '"Artless" means free from deceit or guile; natural and simple.', tags: ['synonyms'], bloom: 'K1', unit: 1, unitTitle: 'Two Gentlemen of Verona' },
  { stemEn: 'My <u>gloomy</u> thoughts probably stem from an accident I had a few years ago.', en: ['sensible', 'mixed', 'sorrowful', 'profound'], answer: 'c', explanationEn: '"Gloomy" refers to feeling distressed or melancholy.', tags: ['synonyms'], bloom: 'K1', unit: 3, unitTitle: 'In Celebration of Being Alive' },
  { stemEn: '....... he was sitting in <u>splendour</u> on his chair.', en: ['excitement', 'magnificence', 'satisfaction', 'hesitation'], answer: 'b', explanationEn: '"Splendour" means magnificent and splendid appearance.', tags: ['synonyms'], bloom: 'K1', unit: 5, unitTitle: 'The Chair' },
  { stemEn: 'One does not feel wiser, braver or more <u>optimistic</u>.', en: ['opportunistic', 'systematic', 'realistic', 'pessimistic'], answer: 'd', explanationEn: '"Optimistic" means hopeful; its exact antonym is pessimistic.', tags: ['antonyms'], bloom: 'K1', unit: 6, unitTitle: 'On the Rule of the Road' },
  { stemEn: 'The two men were <u>hostile</u> to each other from the first meeting.', en: ['friendly', 'angry', 'silent', 'distant'], answer: 'a', explanationEn: '"Hostile" means unfriendly; the antonym is friendly.', tags: ['antonyms'], bloom: 'K1', unit: 2, unitTitle: 'A Nice Cup of Tea' },
  { stemEn: 'The climb was <u>perilous</u> beyond the last camp.', en: ['dangerous', 'safe', 'steep', 'long'], answer: 'b', explanationEn: '"Perilous" means dangerous; the antonym is safe.', tags: ['antonyms'], bloom: 'K1', unit: 4, unitTitle: 'The Summit' },
  { stemEn: 'Choose the correct phrasal verb to complete the sentence: The meeting was _________ because of the rain.', en: ['called off', 'called on', 'called out', 'called in'], answer: 'a', explanationEn: '"Call off" means to cancel.', tags: ['phrasal_verbs'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the correct meaning of the idiom in the given sentence: I told him he would have to <u>make good</u>.', en: ['to wait for a situation', 'to make people relaxed', 'to compensate for a wrongdoing', 'to think carefully about something before doing it'], answer: 'c', explanationEn: 'Idiom "to make good" means to compensate for a fault or loss.', tags: ['idioms'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the American English word for "lift".', en: ['elevator', 'escalator', 'stairs', 'ladder'], answer: 'a', explanationEn: 'British "lift" is American "elevator".', tags: ['american_british_english'], bloom: 'K1', unit: 99, unitTitle: '' },
  { stemEn: 'Form a compound word: rain + _________', en: ['bow', 'ship', 'cake', 'card'], answer: 'a', explanationEn: 'Rainbow is the compound word.', tags: ['compound_words'], bloom: 'K1', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the correctly spelt word.', en: ['occurence', 'occurrence', 'ocurrence', 'occurrance'], answer: 'b', explanationEn: 'Double c, double r: occurrence.', tags: ['spelling'], bloom: 'K1', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the correct prefix to form the opposite of "legal".', en: ['un', 'in', 'il', 'im'], answer: 'c', explanationEn: '"Illegal" — the prefix il- is used before l.', tags: ['prefixes_suffixes'], bloom: 'K1', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the expansion of the abbreviation "ISRO".', en: ['Indian Space Research Organisation', 'International Space Research Organisation', 'Indian Science Research Organisation', 'Indian Space Rocket Organisation'], answer: 'a', explanationEn: 'ISRO = Indian Space Research Organisation.', tags: ['abbreviations'], bloom: 'K1', unit: 99, unitTitle: '' },
  { stemEn: 'Fill in the blank with a suitable preposition: The book is _________ the table.', en: ['in', 'on', 'at', 'of'], answer: 'b', explanationEn: '"On" marks contact with a surface.', tags: ['prepositions'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the suitable linker: He was tired, _________ he kept walking.', en: ['because', 'yet', 'so', 'unless'], answer: 'b', explanationEn: 'A contrast needs "yet".', tags: ['linkers'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the polite expression: _________ open the window ?', en: ['Could you please', 'Open', 'You must', 'I order you to'], answer: 'a', explanationEn: '"Could you please" is the polite request form.', tags: ['polite_expressions'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the blended word formed from "breakfast" and "lunch".', en: ['brunch', 'blunch', 'breakch', 'lunchfast'], answer: 'a', explanationEn: 'Brunch blends breakfast and lunch.', tags: ['blended_words'], bloom: 'K1', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the appropriate question tag and complete the sentence: Vivek played some great shots today, _________ ?', en: ["doesn't he", "hadn't he", "didn't he", "won't he"], answer: 'c', explanationEn: 'Positive statement in simple past takes a negative tag in the same tense with the matching pronoun.', tags: ['question_tags'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the correct prepositional phrase: He acted _________ his brother at the meeting.', en: ['in reference to', 'with reference to', 'on behalf of', 'in lieu of'], answer: 'c', explanationEn: '"On behalf of" = as the representative of.', tags: ['prepositional_phrases'], bloom: 'K2', unit: 99, unitTitle: '' },
  { stemEn: 'Choose the clipped form of "advertisement".', en: ['advert', 'adver', 'tisement', 'advertise'], answer: 'a', explanationEn: 'Advert (or ad) is the clipped form.', tags: ['clipped_words'], bloom: 'K1', unit: 99, unitTitle: '' },
];

export const SAMPLE_PHYSICS_PAPER: PaperModel = {
  assessmentId: '9d6a7b0e-3c11-4f2a-9b0d-1c2e3f4a5b6c',
  title: 'Physics Part-I mock — Units 1–11',
  subject: 'physics',
  examKey: OneMarkExamKeys.PHYSICS,
  examDisplayName: 'TN State Board — HSC Physics (Class 12)',
  bilingual: true,
  seriesCount: 2,
  facilitatorName: 'Sample Senior Learner',
  studioName: 'Nattraja HSS · 2026-27',
  generatedAt: '2026-09-04T09:00:00.000Z',
  items: build(OneMarkExamKeys.PHYSICS, 'onemark_phy', PHYSICS_SEEDS),
};

export const SAMPLE_ENGLISH_PAPER: PaperModel = {
  assessmentId: '4e2b1c9a-7d55-4a3e-8f10-0a9b8c7d6e5f',
  title: 'English Part-I mock — board shape',
  subject: 'english',
  examKey: OneMarkExamKeys.ENGLISH,
  examDisplayName: 'TN State Board — HSC English (Class 12)',
  bilingual: false,
  seriesCount: 1,
  facilitatorName: 'Sample Senior Learner',
  studioName: 'Nattraja HSS · 2026-27',
  generatedAt: '2026-09-04T09:00:00.000Z',
  items: build(OneMarkExamKeys.ENGLISH, 'onemark_eng', ENGLISH_SEEDS),
};

/** The same model with every answer and explanation removed — what a
 *  question-paper render receives (load-paper.ts strips them unless the key
 *  was requested). */
export function withoutAnswers(model: PaperModel): PaperModel {
  return {
    ...model,
    items: model.items.map((i) => ({ ...i, answerKey: null, explanationEn: null, explanationTa: null })),
  };
}
