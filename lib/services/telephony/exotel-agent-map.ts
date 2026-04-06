// lib/services/telephony/exotel-agent-map.ts
// Maps Exotel co-worker phones to JKKN departments and colleges.
// Used by the webhook handler to auto-tag inbound calls with department context.
//
// Data source: Exotel Dashboard → Co-workers and Groups (my.exotel.com/jkkn1/accounts)
// Last synced: 2026-04-04

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type JKKNCollege =
  | 'COE'   // College of Engineering
  | 'CET'   // College of Engineering & Technology
  | 'COP'   // College of Pharmacy
  | 'CNR'   // College of Nursing
  | 'DCH'   // Dental College & Hospital
  | 'AHS'   // Allied Health Sciences
  | 'CAS'   // College of Arts & Science
  | 'SCHOOL'
  | 'ATCHAYAM';

export type CallDepartment =
  | 'admission'
  | 'principal'
  | 'students'
  | 'accounts'
  | 'placement'
  | 'library'
  | 'hospital'
  | 'general'
  | 'school'
  | 'ambulance';

export interface ExotelAgent {
  name: string;
  phone: string;
  email: string;
  college?: JKKNCollege;
  department: CallDepartment;
  isAdmissionCounselor: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT MAP — keyed by phone (with leading 0)
// ═══════════════════════════════════════════════════════════════════════════

const AGENT_MAP: Record<string, ExotelAgent> = {
  // === ADMINS ===
  '09894116664': { name: 'Exotel JKKN', phone: '09894116664', email: 'exotel@jkkn.org', department: 'general', isAdmissionCounselor: false },
  '08778377147': { name: 'Ranjith JKKN', phone: '08778377147', email: 'ranjith@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09942405777': { name: 'Admission Dhuraimurugan', phone: '09942405777', email: 'shanmugaprabhu@jkkn.org', department: 'admission', isAdmissionCounselor: true },

  // === ADMISSION COUNSELORS (handle most inbound calls) ===
  '09842547666': { name: 'Gowrishankar', phone: '09842547666', email: 'gowrisankar@jkkn.ac.in', department: 'admission', isAdmissionCounselor: true },
  '09092327666': { name: 'NARAYAN RAO N', phone: '09092327666', email: 'ratheshraj@jkkn.ac.in', department: 'admission', isAdmissionCounselor: true },
  '09865933332': { name: 'Narayan Rao (Murugan)', phone: '09865933332', email: 'murugan.s@jkkn.org', department: 'admission', isAdmissionCounselor: true },
  '09788261666': { name: 'RAJENDIRAN', phone: '09788261666', email: 'rajendiran.km@jkkn.ac.in', department: 'admission', isAdmissionCounselor: true },
  '09092334666': { name: 'SARANYADEVI P M', phone: '09092334666', email: 'saranyadevi.pm@jkkn.ac.in', department: 'admission', isAdmissionCounselor: true },
  '08754864052': { name: 'Gandhimathi', phone: '08754864052', email: 'gandhimathi.v@jkkn.ac.in', department: 'admission', isAdmissionCounselor: true },

  // === DENTAL ===
  '09171668571': { name: 'SELVAKUMAR', phone: '09171668571', email: 'hodpublichealthdentistry@jkkn.ac.in', college: 'DCH', department: 'principal', isAdmissionCounselor: false },
  '09841101475': { name: 'Dr AISHWARYA KRISHNAMOORTHY', phone: '09841101475', email: 'aishwarya@jkkn.ac.in', college: 'DCH', department: 'general', isAdmissionCounselor: false },

  // === PHARMACY ===
  '09629771832': { name: 'PHARMACY OFFICE', phone: '09629771832', email: 'tamilselvi.c@jkkn.ac.in', college: 'COP', department: 'general', isAdmissionCounselor: false },
  '09842663659': { name: 'DR V SEKAR', phone: '09842663659', email: 'hodpharmaceuticalanalysis@jkkn.ac.in', college: 'COP', department: 'principal', isAdmissionCounselor: false },

  // === NURSING ===
  '09943583666': { name: 'NURSING OFFICE', phone: '09943583666', email: 'hemaparvathi.s@jkkn.ac.in', college: 'CNR', department: 'general', isAdmissionCounselor: false },

  // === ENGINEERING ===
  '09965939333': { name: 'ENGINEERING OFFICE', phone: '09965939333', email: 'a.nandhini@jkkn.ac.in', college: 'COE', department: 'general', isAdmissionCounselor: false },

  // === SCHOOL ===
  '09976253000': { name: 'School JKKN', phone: '09976253000', email: 'school@jkkn.ac.in', department: 'school', isAdmissionCounselor: false },
  '09047515766': { name: 'Nazarkhan Matric', phone: '09047515766', email: 'matricprincipal@jkkn.ac.in', department: 'school', isAdmissionCounselor: false },
  '09994344986': { name: 'KOSHI PRIYA SCHOOL', phone: '09994344986', email: 'vidhyalyaprincipal@jkkn.ac.in', department: 'school', isAdmissionCounselor: false },

  // === ARTS & SCIENCE ===
  '09976622671': { name: 'LATHA JKKN', phone: '09976622671', email: 'hodphysics@jkkn.ac.in', college: 'CAS', department: 'principal', isAdmissionCounselor: false },

  // === GENERAL STAFF ===
  '09865910003': { name: 'ROBERT JKKN', phone: '09865910003', email: 'nirmalsathyaraj@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09942717828': { name: 'SUBRAMANIYAN', phone: '09942717828', email: 'subramanian.r@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09578085089': { name: 'LOGANANDHI', phone: '09578085089', email: 'loganandhi.p@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09789298008': { name: 'KANDHASAMY', phone: '09789298008', email: 'kandasamy@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09788648307': { name: 'GUNASEKARAN', phone: '09788648307', email: 'gunasekar_s@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '06369319639': { name: 'Naveenkumar', phone: '06369319639', email: 'pranoukumar1999@gmail.com', department: 'general', isAdmissionCounselor: false },
  '09715737333': { name: 'NAZAR JKKN', phone: '09715737333', email: 'nazarkhan.k@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09629001443': { name: 'DINESH KULANTHAIVEL', phone: '09629001443', email: 'dinesh.kulanthaivel@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09498837581': { name: 'BOOPATHI K', phone: '09498837581', email: 'boopathi.k@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09787800286': { name: 'ROJA', phone: '09787800286', email: 'sroja@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '08248275908': { name: 'JANAKI', phone: '08248275908', email: 'janaki@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },
  '09344114367': { name: 'Sneha', phone: '09344114367', email: 'snehapoppy.ss@gmail.com', department: 'general', isAdmissionCounselor: false },
  '09095255887': { name: 'SURENDAR', phone: '09095255887', email: 'surendhar@jkkn.ac.in', department: 'general', isAdmissionCounselor: false },

  // === ATCHAYAM TRUST ===
  '09787800772': { name: 'Naveen Atchayam', phone: '09787800772', email: 'naveenkumar@atchayamtrust.com', department: 'general', isAdmissionCounselor: false },

  // === JICATE ===
  '09025449944': { name: 'DHINESH JICATE', phone: '09025449944', email: 'DHINESHKUMAR.B@JKKN.AC.IN', department: 'general', isAdmissionCounselor: false },
};

// ═══════════════════════════════════════════════════════════════════════════
// EXOPHONE → DEPARTMENT/FLOW
// ═══════════════════════════════════════════════════════════════════════════

export const EXOPHONE_MAP: Record<string, { name: string; department: CallDepartment; college?: JKKNCollege }> = {
  '04446313503': { name: '1-JKKN-COLLEGES', department: 'admission' },
  '04448134434': { name: 'JKKN-MAIN', department: 'general' },
  '04446313545': { name: 'JKKN-SECONDARY', department: 'general' },
  '04446313596': { name: 'JKKN-TERTIARY', department: 'general' },
  '04446310202': { name: 'Dharmapuri2025', department: 'admission' },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Look up an agent by phone number. Handles various phone formats
 * (with/without leading 0, with +91, last 10 digits).
 */
export function lookupAgent(phone: string): ExotelAgent | null {
  if (!phone) return null;

  // Direct match
  if (AGENT_MAP[phone]) return AGENT_MAP[phone];

  // Try with leading 0
  const with0 = '0' + phone.replace(/^\+?91/, '').replace(/^0/, '');
  if (AGENT_MAP[with0]) return AGENT_MAP[with0];

  // Try last 10 digits with 0 prefix
  if (phone.length >= 10) {
    const last10 = phone.slice(-10);
    const withPrefix = '0' + last10;
    if (AGENT_MAP[withPrefix]) return AGENT_MAP[withPrefix];
  }

  return null;
}

/**
 * Look up ExoPhone context by number.
 */
export function lookupExoPhone(phone: string): { name: string; department: CallDepartment; college?: JKKNCollege } | null {
  if (!phone) return null;
  return EXOPHONE_MAP[phone] || EXOPHONE_MAP[phone.replace(/^\+?91/, '')] || null;
}

/**
 * Determine if a call is admission-related based on agent and ExoPhone.
 */
export function isAdmissionCall(agentPhone: string, exoPhone: string): boolean {
  const agent = lookupAgent(agentPhone);
  if (agent?.isAdmissionCounselor) return true;

  const exo = lookupExoPhone(exoPhone);
  if (exo?.department === 'admission') return true;

  return false;
}

/**
 * Get all agents marked as admission counselors from the static agent map.
 * Used by CounselorSyncService to know which Exotel users should be
 * in the admission_counselors table.
 */
export function getAdmissionCounselors(): ExotelAgent[] {
  return Object.values(AGENT_MAP).filter(a => a.isAdmissionCounselor);
}

/**
 * Get call context for enriching call logs.
 */
export function getCallContext(agentPhone: string, exoPhone: string): {
  agentName: string | null;
  agentEmail: string | null;
  department: CallDepartment;
  college: JKKNCollege | null;
  isAdmission: boolean;
} {
  const agent = lookupAgent(agentPhone);
  const exo = lookupExoPhone(exoPhone);

  return {
    agentName: agent?.name || null,
    agentEmail: agent?.email || null,
    department: agent?.department || exo?.department || 'general',
    college: agent?.college || exo?.college || null,
    isAdmission: isAdmissionCall(agentPhone, exoPhone),
  };
}
