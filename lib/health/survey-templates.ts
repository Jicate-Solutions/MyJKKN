// lib/health/survey-templates.ts
// Starter question sets an admin can load into a new wellness survey.
// Workplace C.A.L.M — Culture, Atmosphere, Leadership & Mental health —
// transcribed from the English + Tamil survey pages (JKKN Dental College).

import type { SurveyLanguage, SurveyQuestion } from '@/types/health-surveys';

export interface SurveyTemplate {
  key: string;
  label: string;
  title: string;
  description: string;
  languages: SurveyLanguage[];
  questions: SurveyQuestion[];
}

const CALM_QUESTIONS: SurveyQuestion[] = [
  {
    id: 's1',
    title: {
      en: 'Scenario 1: The Critical Handover',
      ta: 'சூழ்நிலை 1: முக்கியமான பணிப் பகிர்வு',
    },
    text: {
      en: 'A critical task or case assigned to your team is transferred to you mid-way with missing documentation and unclear instructions from the previous responsible colleague. How do you proceed?',
      ta: 'உங்கள் குழுவிடம் ஒப்படைக்கப்பட்ட ஒரு முக்கியமான பணி, அரைகுறை விவரங்கள் மற்றும் தெளிவில்லாத வழிகாட்டுதல்களுடன் உங்களிடம் மாற்றப்படுகிறது. நீங்கள் என்ன செய்வீர்கள்?',
    },
    constructive: 'A',
    options: [
      {
        id: 'A',
        text: {
          en: 'Address the immediate issue, record the missing details, and quietly contact the previous colleague to clarify the missing information directly.',
          ta: 'உடனடி பணியை முடித்து, விடுபட்ட விவரங்களை குறித்துக்கொண்டு, முந்தைய சக ஊழியரை நேரடியாகத் தொடர்புகொண்டு தெளிவுபடுத்துவேன்.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Complete the immediate task, note the documentation gaps in the official register, and notify leadership to clarify standard handoff protocols.',
          ta: 'உடனடி பணியை முடித்து, விடுபட்ட விவரங்களை பதிவேட்டில் குறித்து, சரியான நடைமுறையை உருவாக்க மேலதிகாரிகளுக்குத் தெரிவிப்பேன்.',
        },
        justification: {
          en: 'Escalating directly to leadership or formal registers for minor handoff gaps can create institutional rigidity and unnecessary friction.',
          ta: 'சிறிய குறைபாடுகளுக்கு நேரடியாக மேல் அதிகாரிகளிடம் புகார் அளிப்பது வேலைச் சூழலில் அமைதியின்மையையும் சிக்கலையும் உருவாக்கும்.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Focus entirely on completing the task without documenting the missing background to avoid creating friction with the previous colleague.',
          ta: 'சக ஊழியருடன் தேவையற்ற மனக்கசப்பைத் தவிர்க்க, விடுபட்ட விவரங்களை பதிவு செய்யாமல் பணியை மட்டும் முடிப்பதில் கவனம் செலுத்துவேன்.',
        },
        justification: {
          en: 'Ignoring documentation gaps leaves systemic errors unresolved and risks workplace accountability.',
          ta: 'ஆவணக் குறைபாடுகளைக் கவனிக்காமல் விடுவது எதிர்காலத்தில் பெரிய தவறுகளுக்கு வழிவகுக்கும்.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Direct your junior team members to pause and verify the history before proceeding, as working without complete documentation creates professional liability.',
          ta: 'அரைகுறை விவரங்களுடன் வேலை செய்வது தவறு என்பதால், எனது கீழ் பணிபுரிபவர்களை வேலையை நிறுத்திவிட்டு முழு விவரங்களையும் சரிபார்க்கச் சொல்வேன்.',
        },
        justification: {
          en: 'Passively putting work on hold or shifting liability to juniors can disrupt workflow and avoid proactive problem-solving.',
          ta: 'வேலையை நிறுத்திவிட்டு இளநிலை ஊழியர்கள் மீது சுமையை ஏற்றுவது ஆக்கப்பூர்வமான தீர்வாகாது.',
        },
      },
    ],
    guidance: {
      en: 'Proactive communication and resolving missing details directly at the source helps build trust while maintaining operational resilience.',
      ta: 'நேரடித் தொடர்பும், பிரச்சனை எழுந்த இடத்திலேயே தீர்வுகாண்பதும் பணியிட நம்பிக்கையையும் திறனையும் உயர்த்தும்.',
    },
  },
  {
    id: 's2',
    title: {
      en: 'Scenario 2: Resource Allocation Dynamics',
      ta: 'சூழ்நிலை 2: வளங்கள் பகிர்வு முறை',
    },
    text: {
      en: 'A newly acquired, high-demand piece of equipment or technology is assigned to a single team rather than being placed in a shared pool, causing workflow delays for other units. How do you proceed?',
      ta: 'புதிதாக வாங்கப்பட்ட ஒரு முக்கியமான கருவி, அனைத்துத் துறைகளுக்கும் பொதுவாகப் பகிரப்படாமல் ஒரே ஒரு குழுவிற்கு மட்டும் வழங்கப்படுகிறது. இதனால் மற்ற பிரிவுகளின் வேலை தாமதமாகிறது. நீங்கள் என்ன செய்வீர்கள்?',
    },
    constructive: 'A',
    options: [
      {
        id: 'A',
        text: {
          en: 'Draft a proposal requesting a shared usage schedule so all units have equitable access during peak hours.',
          ta: 'வேலை நேரங்களில் அனைவரும் சமமாக பயன்படுத்தும் வகையில் ஒரு சுழற்சி முறை அட்டவணையை உருவாக்க கோரிக்கை வைப்பேன்.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Request access to the resource for your urgent tasks directly from the holding team on an ad-hoc basis.',
          ta: 'அவசர வேலைகளுக்காக மட்டும் அக்கருவியைப் பயன்படுத்த அந்த குறிப்பிட்ட குழுவிடம் நேரடியாக அனுமதி கேட்பேன்.',
        },
        justification: {
          en: 'Relying on ad-hoc requests leads to inconsistent access and creates ongoing operational friction.',
          ta: 'அவ்வப்போது அனுமதி கேட்பது நிலையான பயன்பாட்டிற்கு உதவாது, மேலும் காலதாமதத்தை ஏற்படுத்தும்.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Continue using standard traditional methods for your tasks while waiting to see if leadership adjusts the allocation policy.',
          ta: 'நிர்வாகம் இந்த விதியை மாற்றும் வரை எனது பழைய முறைகளையே தொடர்ந்து பயன்படுத்துவேன்.',
        },
        justification: {
          en: "Passively waiting for policy changes leaves your team's workflow delayed and under-resourced.",
          ta: 'நிர்வாகம் மாறும் வரை அமைதியாக இருப்பது வேலைத் திறனைக் குறைக்கும்.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Inform your team members that their workflow will take longer due to unequal resource distribution at the institutional level.',
          ta: 'நிறுவனத்தின் தவறான வள பகிர்வினால் தான் நமது வேலை தாமதமாகிறது என்பதை எனது குழு உறுப்பினர்களிடம் தெரிவிப்பேன்.',
        },
        justification: {
          en: 'Complaining to team members about institutional policies fosters frustration rather than driving actionable solutions.',
          ta: 'குழு உறுப்பினர்களிடம் விதியை குறை கூறுவது அதிருப்தியை மட்டுமே வளர்க்கும்.',
        },
      },
    ],
    guidance: {
      en: 'Focusing on structured proposals for shared usage helps advocate for fair access through constructive institutional channels.',
      ta: 'சமமான பயன்பாட்டிற்கான முறையான அட்டவணையை முன்மொழிவது நேர்மறையான அணுகுமுறையாகும்.',
    },
  },
  {
    id: 's3',
    title: {
      en: 'Scenario 3: Shared Work Recognition',
      ta: 'சூழ்நிலை 3: கூட்டுப் பணி அங்கீகாரம்',
    },
    text: {
      en: 'A major collaborative report or project has been finalized. Upon reviewing the submission, you notice your contribution is listed only in a minor secondary note rather than in the primary contributor list. How do you proceed?',
      ta: 'ஒரு பெரிய கூட்டுத் திட்டம் முடிவடைந்தது. அதன் இறுதி அறிக்கையைத் திறக்கும்போது, முதன்மைப் பங்களிப்பாளர் பட்டியலில் இல்லாமல் உங்கள் பெயர் மிகச் சிறிய குறிப்பில் மட்டும் குறிப்பிடப்பட்டுள்ளது. நீங்கள் என்ன செய்வீர்கள்?',
    },
    constructive: 'A',
    options: [
      {
        id: 'A',
        text: {
          en: 'Contact the project lead directly to request an update to the contributor list before final publication, providing records of your work.',
          ta: 'திட்டத் தலைவரை நேரடியாகத் தொடர்புகொண்டு, எனது உழைப்பிற்கான ஆதாரங்களைக் காட்டி பட்டியலில் பெயரை மாற்றக் கோருவேன்.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Accept the secondary credit to maintain working harmony, but limit future collaborative projects with this specific team.',
          ta: 'வேலைச் சூழல் கெடாமல் இருக்க இதை ஏற்றுக்கொள்வேன், ஆனால் இனி இந்த அணியுடன் இணைந்து வேலை செய்வதைக் குறைத்துக் கொள்வேன்.',
        },
        justification: {
          en: 'Silently accepting secondary credit while withdrawing engagement can lead to resentment and quiet disengagement.',
          ta: 'மௌனமாக ஏற்பது மனக்கசப்பையும் எதிர்கால வேலைகளில் ஈடுபாடின்மையையும் உண்டாக்கும்.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Formalize a written complaint to the oversight committee requesting a hold on the project until ownership is reassessed.',
          ta: 'எனது பங்களிப்பு சரியாக மறுபரிசீலனை செய்யப்படும் வரை திட்டத்தை நிறுத்தி வைக்குமாறு மேற்பார்வைக் குழுவிடம் புகார் அளிப்பேன்.',
        },
        justification: {
          en: 'Immediately filing formal complaints can unnecessarily escalate conflict before trying direct dialogue.',
          ta: 'உடனடியாக அதிகாரப்பூர்வ புகார் அளிப்பது தேவையில்லாத மனஸ்தாபங்களை வளர்க்கும்.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Mention the discrepancy casually to other colleagues to gauge whether this is a recurring pattern with the project lead.',
          ta: 'மற்ற சக ஊழியர்களிடம் இதை சாதாரண உரையாடலாகக் கூறி, திட்டத் தலைவர் இதுபோன்ற செயல்களில் அடிக்கடி ஈடுபடுகிறாரா என அறிந்துகொள்வேன்.',
        },
        justification: {
          en: 'Discussing grievances casually with colleagues introduces indirect tension rather than resolving the issue.',
          ta: 'சக ஊழியர்களிடம் இதைப் பற்றிப் பேசுவது மறைமுகத் பதற்றத்தை மட்டுமே உருவாக்கும்.',
        },
      },
    ],
    guidance: {
      en: 'Addressing credit discrepancies directly with project leads using record-based evidence ensures fair recognition while preserving working relationships.',
      ta: 'ஆதாரங்களுடன் நேரடியாகப் பேசுவது சரியான அங்கீகாரத்தைப் பெற்றுத்தரும்.',
    },
  },
  {
    id: 's4',
    title: {
      en: 'Scenario 4: Policy & Schedule Modifications',
      ta: 'சூழ்நிலை 4: நிர்வாக விதி மாற்றங்கள்',
    },
    text: {
      en: 'Leadership mandates an immediate integration of new administrative procedures into the current schedule, creating time overlaps for ongoing daily routines. How do you proceed?',
      ta: 'நிர்வாகம் உடனடியாகப் புதிய நடைமுறைகளை அமல்படுத்துகிறது. இதனால் உங்கள் வழக்கமான தினசரி வேலை நேரங்களில் குழப்பமும் காலதாமதமும் ஏற்படுகிறது. நீங்கள் என்ன செய்வீர்கள்?',
    },
    constructive: 'A',
    options: [
      {
        id: 'A',
        text: {
          en: 'Condense lower-priority tasks to fit the new requirements while strictly adhering to regular working hours.',
          ta: 'வேலை நேரத்திற்குள் முடிக்க ஏதுவாக, குறைந்த முக்கியத்துவம் உள்ள பணிகளைச் சுருக்கிக் கொண்டு புதிய விதிகளுக்கு ஏற்ப செயல்படுவேன்.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Absorb the extra work into your personal time to ensure all tasks are completed without disturbing existing schedules.',
          ta: 'தினசரி வேலை பாதிக்கப்படாமல் இருக்க, கூடுதல் வேலையை எனது சொந்த நேரத்தில் செய்து முடிப்பேன்.',
        },
        justification: {
          en: 'Absorbing administrative overloads into personal time leads to long-term exhaustion and severe burnout.',
          ta: 'சொந்த நேரத்தை தியாகம் செய்வது நீண்டகால அடிப்படையில் மன அழுத்தத்தையும் சோர்வையும் தரும்.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Submit a request to the committee highlighting the schedule overlap and ask to defer implementation to the next term.',
          ta: 'நேரக் குழப்பத்தைக் குறிப்பிட்டு, இந்த மாற்றங்களை அடுத்த பருவத்திற்கு ஒத்திவைக்கக் குழுவிடம் விண்ணப்பிப்பேன்.',
        },
        justification: {
          en: 'Deferring mandates entirely avoids adapting to institutional priorities and delays growth.',
          ta: 'நிர்வாக மாற்றங்களை முழுமையாக ஒத்திவைக்கக் கோருவது வளர்ச்சிக்குத் தடையாகும்.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Comply minimalistically by uploading the required materials for self-study to avoid modifying existing time slots.',
          ta: 'வேலை நேரத்தை மாற்றாமல் இருக்க, தேவையான ஆவணங்களை மட்டும் முறைப்படி பதிவேற்றம் செய்து கடமைக்குச் செயல்படுவேன்.',
        },
        justification: {
          en: 'Minimal compliance compromises quality and misses the opportunity to manage workload effectively.',
          ta: 'கடமைக்குச் செயல்படுவது வேலையின் தரத்தைக் குறைக்கும்.',
        },
      },
    ],
    guidance: {
      en: 'Prioritizing and condensing non-essential tasks allows you to adapt to new mandates while maintaining healthy professional boundaries.',
      ta: 'குறைந்த முக்கியத்துவம் உள்ள வேலைகளைச் சுருக்கிக் கொண்டு எல்லைகளை வகுப்பதே சரியான வழிமுறையாகும்.',
    },
  },
  {
    id: 's5',
    title: {
      en: 'Scenario 5: Public Institutional Criticism',
      ta: 'சூழ்நிலை 5: பொதுப் பணியிட விமர்சனம்',
    },
    text: {
      en: 'During a general team meeting, a senior colleague remarks: "Certain units consistently fail to meet operational targets because supervisors are not managing their time effectively." How do you proceed?',
      ta: 'பொதுக் கூட்டத்தில் ஒரு மூத்த அதிகாரி, "சில பிரிவுகள் நேரத்தை சரியாக மேலாண்மை செய்யாததால் தான் இலக்குகளை அடைவதில் தொடர்ந்து தோற்கின்றன" என்று கூறுகிறார். நீங்கள் என்ன செய்வீர்கள்?',
    },
    constructive: 'A',
    options: [
      {
        id: 'A',
        text: {
          en: 'Request that leadership establish objective tracking metrics so such statements are based on clear data rather than general impressions.',
          ta: 'பொதுவான விமர்சனங்களுக்குப் பதிலாக, தெளிவான புள்ளிவிவரங்களின் அடிப்படையில் மதிப்பிடும் முறையைக் கொண்டுவரக் கோருவேன்.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Assume the remark is directed at your unit, experience internal distress, and increase your hours to ensure your metrics remain unassailable.',
          ta: 'அது நமது பிரிவைக் குறிப்பதாக எண்ணி மன உளைச்சலுக்கு ஆளாகி, அதை நிரூபிக்க கூடுதல் நேரங்களைச் செலவிட்டு வேலை செய்வேன்.',
        },
        justification: {
          en: 'Absorbing generalized critiques personally leads to internal distress and unsustainable working hours.',
          ta: 'பொதுவான விமர்சனங்களைச் சொந்தமாக எடுத்துக்கொள்வது மன உளைச்சலையே தரும்.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Point out during the meeting that delays in central administrative processing are the actual cause of unit backlogs.',
          ta: 'மத்திய நிர்வாகத்தின் தாமதமே நமது வேலைப் பழு நிலைக்கு உண்மையான காரணம் என்பதை கூட்டத்திலேயே சுட்டிக்காட்டுவேன்.',
        },
        justification: {
          en: 'Deflecting blame during public meetings can provoke unnecessary confrontation and derail constructive conversation.',
          ta: 'பொதுக் கூட்டத்தில் மற்றவர்களைக் குற்றம் சாட்டுவது மோதலுக்கு வழிவகுக்கும்.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Remain silent during the meeting, but express your dissatisfaction to trusted colleagues in private afterwards.',
          ta: 'கூட்டத்தில் அமைதியாக இருந்துவிட்டு, பின்னர் நம்பிக்கையான சக ஊழியர்களிடம் எனது வருத்தத்தைப் பகிர்ந்துகொள்வேன்.',
        },
        justification: {
          en: 'Venting privately without seeking clarity leaves the underlying operational issues unaddressed.',
          ta: 'தனியாகப் புலம்புவது பிரச்சனைக்குத் தீர்வாகாது.',
        },
      },
    ],
    guidance: {
      en: 'Advocating for objective tracking metrics shifts discussions away from subjective impressions toward data-driven operational transparency.',
      ta: 'உண்மையான புள்ளிவிவரங்களின் அடிப்படையில் மதிப்பிடும் முறையைக் கோருவது வெளிப்படைத்தன்மையை அதிகரிக்கும்.',
    },
  },
  {
    id: 's6',
    title: {
      en: 'Scenario 6: Peak Workload Pressure',
      ta: 'சூழ்நிலை 6: அதிக வேலைப் பளு',
    },
    text: {
      en: 'An unexpected surge in institutional duties coincides with team shortfalls due to sudden leaves, leaving the remaining team members to handle double the normal workload. How do you proceed?',
      ta: 'எதிர்பாராத விதமாகப் பணிச்சுமை அதிகரிக்கும் அதே நேரத்தில், சில ஊழியர்களின் திடீர் விடுப்பால் மீதமுள்ளவர்கள் இரட்டிப்பு வேலை செய்ய வேண்டியுள்ளது. நீங்கள் என்ன செய்வீர்கள்?',
    },
    constructive: 'A',
    options: [
      {
        id: 'A',
        text: {
          en: 'Notify leadership that non-essential duties must be temporarily reduced during this period due to safe operational limits.',
          ta: 'பாதுகாப்பான வேலை வரம்பைக் கருத்தில் கொண்டு, தற்காலிகமாகக் குறைந்த முக்கியத்துவம் வாய்ந்த வேலைகளைக் குறைக்க நிர்வாகத்திடம் தெரிவிப்பேன்.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Work through breaks and stay past regular hours to cover all duties without raising concerns.',
          ta: 'எவ்வித புகாரும் இன்றி ஓய்வு நேரத்தையும் தியாகம் செய்து, அதிக நேரம் இருந்து வேலைகளை முடிப்பேன்.',
        },
        justification: {
          en: 'Consistently overworking through breaks creates hypervigilance, emotional exhaustion, and rapid burnout.',
          ta: 'ஓய்வின்றி தொடர்ந்து உழைப்பது மன அழுத்தத்தையும் உடல்நலக் கேட்டையும் விளைவிக்கும்.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Delegate primary execution to junior colleagues while focusing strictly on mandatory administrative documentation.',
          ta: 'முக்கிய நிர்வாக வேலைகளில் மட்டும் நான் கவனம் செலுத்தி, மற்ற வேலைகளை இளநிலை ஊழியர்களிடம் ஒப்படைப்பேன்.',
        },
        justification: {
          en: 'Passing excess pressure down to junior team members risks delegating liability rather than managing capacity.',
          ta: 'இளநிலை ஊழியர்கள் மீது அதிகப் பளுவை ஏற்றுவது சரியான மேலாண்மை அல்ல.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Request an emergency meeting to demand immediate temporary reassignment of team members from other departments.',
          ta: 'அவசரக் கூட்டத்தைக் கூட்டி, மற்ற துறைகளிலிருந்து ஊழியர்களை உடனடியாக இங்கு மாற்ற வேண்டும் என்று வலியுறுத்துவேன்.',
        },
        justification: {
          en: 'Demanding immediate team reassignments can cause conflict across departments during institution-wide strain.',
          ta: 'உடனடி ஆள் மாற்றத்தைக் கோருவது பிற துறைகளில் சிக்கலை ஏற்படுத்தலாம்.',
        },
      },
    ],
    guidance: {
      en: 'Setting safe operational boundaries by communicating capacity limits to leadership protects overall well-being while sustaining quality output.',
      ta: 'வேலை வரம்புகளைப் புரிந்து கொண்டு நிர்வாகத்திடம் தெளிவாகத் தெரிவிப்பதே நல்வாழ்விற்கும் தரத்திற்கும் சிறந்தது.',
    },
  },
];

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: 'workplace-calm',
    label: 'Workplace C.A.L.M (6 scenarios, English + Tamil)',
    title: 'Workplace C.A.L.M Survey',
    description: 'Culture, Atmosphere, Leadership & Mental health',
    languages: ['en', 'ta'],
    questions: CALM_QUESTIONS,
  },
];

/** Deep copy so edits in the builder never mutate the shared template. */
export function cloneTemplateQuestions(key: string): SurveyQuestion[] {
  const t = SURVEY_TEMPLATES.find((x) => x.key === key);
  return t ? (JSON.parse(JSON.stringify(t.questions)) as SurveyQuestion[]) : [];
}
