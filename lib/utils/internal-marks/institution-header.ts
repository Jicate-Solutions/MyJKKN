// PDF header config per institution.
// Resolved from the institution name / counselling_code so the
// internal-marks PDFs render the correct college branding.

export interface InstitutionPdfOfficials {
	secretary_name: string
	principal_name: string
	contact_cell?: string
	contact_web?: string
	contact_email?: string
}

export interface InstitutionPdfHeader {
	institution_name: string
	institution_address: string
	institution_accreditation: string
	rightLogoImage: string
	/** Left-side logo override (PNG path under /public). Defaults to /logo.png. */
	logoImage?: string
	/**
	 * Extra centred lines rendered under the institution name on the engineering
	 * CET syllabus banner (autonomous status, managing trust, approvals, NAAC).
	 * Consumed only by the CET renderer; other PDFs ignore it.
	 */
	banner_lines?: string[]
	/** Website line for the engineering CET banner (e.g. "www.engg.jkkn.in"). */
	website?: string
	/** Officials block rendered below the institutional banner on BoS PDFs. */
	officials?: InstitutionPdfOfficials
	/**
	 * Names row printed on the physical CET letterhead, directly above the rule:
	 * Chairperson flush left, Principal flush right. Kept separate from
	 * `officials` on purpose — `officials` also feeds the {{signoff_name}} email
	 * placeholder, so overloading it would silently change email bodies.
	 */
	letterhead_signatories?: {
		left_name: string
		left_title: string
		right_name: string
		right_title: string
	}
	/**
	 * Institution short code used as the first segment of a call-letter
	 * reference number (e.g. "JKKNCET" → JKKNCET/BoS/ECE/2026-2027/01).
	 */
	ref_prefix?: string
	/**
	 * Bottom-left round seal stamp on BoS call-letter PDFs. PNG path relative
	 * to /public. Omit when the institution has no official seal asset.
	 */
	sealImage?: string
	/**
	 * Bottom-right principal signature block on BoS call-letter PDFs. PNG
	 * should already contain the squiggle + "PRINCIPAL" + institution +
	 * address lines so the renderer can place it as-is. Omit when not
	 * available — the PDF falls back to "With Warm Regards," alone.
	 */
	signImage?: string
}

const DEFAULT_ADDRESS = 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu'

const CET_HEADER: InstitutionPdfHeader = {
	// Verbatim CET stationery spelling (NATTRAJA double-T, & TECHNOLOGY).
	institution_name: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING & TECHNOLOGY',
	institution_address: DEFAULT_ADDRESS,
	institution_accreditation:
		'(Approved by AICTE - New Delhi & Affiliated to Anna University, Chennai)',
	banner_lines: [
		'( An Autonomous Institution )',
		'(MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST)',
		'(Approved by AICTE - New Delhi & Affiliated to Anna University, Chennai)',
		'Accredited by NAAC',
	],
	website: 'https://engg.jkkn.ac.in/',
	// Printed-letterhead names row (see the scanned CET stationery):
	// Chairperson on the left, Principal on the right, above the rule.
	letterhead_signatories: {
		left_name: 'Mrs. N. SENDAMARAAI',
		left_title: 'Chairperson',
		right_name: 'Dr. C.KATHIRVEL, B.E.,M.E.,Ph.D.',
		right_title: 'Principal',
	},
	ref_prefix: 'JKKNCET',
	// CET office seal + principal stamp for BoS call letters. Shipped
	// defaults — either can be replaced from /bos/email-settings
	// (bos_letterhead_assets) without a deploy.
	// NOTE: the signature scan carries the squiggle PLUS "Dr.C.KATHIRVEL,
	// M.E.,Ph.D., PRINCIPAL / J.K.K.Natraja College … / KUMARAPALAYAM"
	// baked in, which is why the call-letter renderer drops its own typed
	// designation line when this image is present.
	sealImage: '/logo/engg/jkkncet_seal.png',
	signImage: '/logo/engg/jkkncet_principal_sign.png',
	// Green CET engineering mark — used as the left logo on syllabus PDFs
	// and as the right logo on dual-logo banners (attendance certificates).
	logoImage: '/logo/engg/jkkn_engg_logo.png',
	rightLogoImage: '/logo/engg/jkkn_engg_logo.png',
}

const CAS_HEADER: InstitutionPdfHeader = {
	institution_name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
	institution_address: DEFAULT_ADDRESS,
	institution_accreditation:
		'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
	rightLogoImage: '/jkkncas_logo.png',
	officials: {
		secretary_name: 'SMT.N.SENDAMARAAI',
		principal_name: 'Capt.Dr.M.NALINI, M.Sc.,M.Phil.,Ph.D., Principal',
		contact_cell: '94878 33330, 99653 63999',
		contact_web: 'www.jkkn.ac.in',
		contact_email: 'arts@jkkn.org',
	},
	sealImage: '/logo/arts/jkkn_arts_round_seal.png',
	signImage: '/logo/arts/jkkn_arts_principal_sign.png',
}

/** COE counselling_code / institution_code values that map to CET branding. */
const CET_CODES = new Set(['CET', 'JKKNCET'])
/** COE counselling_code / institution_code values that map to Arts & Science. */
const CAS_CODES = new Set(['CAS', 'JKKNCAS'])
/** Allied Health Sciences (Dr. MGR Medical University). */
const AHS_CODES = new Set(['AHS'])
const MGR_MEDICAL_ACCREDITATION =
	'(Affiliated to The Tamil Nadu Dr. M.G.R. Medical University, Chennai)'

function isCetName(name: string): boolean {
	// Short codes ("CET", "JKKNCET") must win — DB display names often omit
	// the words "engineering" / "technology".
	return /\bcet\b|jkkncet|engineering|technology/i.test(name)
}

// AHS is checked BEFORE CAS: "Allied Health Science" contains "science", which
// would otherwise be stolen by the Arts & Science (Periyar) letterhead.
function isAhsName(name: string): boolean {
	return /\bahs\b|allied\s+health/i.test(name)
}

function isCasName(name: string): boolean {
	return /\bcas\b|jkkncas|arts|science/i.test(name)
}

/** AHS header — shows the institution's OWN name + Dr. MGR Medical affiliation. */
function ahsHeader(name?: string | null): InstitutionPdfHeader {
	return {
		institution_name: (name?.trim() || 'J.K.K.NATARAJA COLLEGE OF ALLIED HEALTH SCIENCES').toUpperCase(),
		institution_address: DEFAULT_ADDRESS,
		institution_accreditation: MGR_MEDICAL_ACCREDITATION,
		rightLogoImage: '/jkkn_logo.png',
	}
}

/**
 * Resolve PDF letterhead branding for an institution.
 *
 * Prefer `institutionCode` (MyJKKN counselling_code === COE institution_code)
 * over free-text name matching — CET is identified as code "CET" across BoS,
 * and name-only matching silently fell back to Arts whenever the context
 * name was missing or abbreviated.
 */
export function getInstitutionHeader(
	name?: string | null,
	institutionCode?: string | null,
): InstitutionPdfHeader {
	const code = (institutionCode ?? '').trim().toUpperCase()
	if (CET_CODES.has(code)) return CET_HEADER
	if (AHS_CODES.has(code)) return ahsHeader(name)
	if (CAS_CODES.has(code)) return CAS_HEADER

	if (name) {
		if (isCetName(name)) return CET_HEADER
		// AHS before CAS — "Allied Health Science" would otherwise match CAS.
		if (isAhsName(name)) return ahsHeader(name)
		if (isCasName(name)) return CAS_HEADER
		// Unknown institution — render its own name with no accreditation line
		return {
			institution_name: name.toUpperCase(),
			institution_address: DEFAULT_ADDRESS,
			institution_accreditation: '',
			rightLogoImage: '/jkkn_logo.png',
		}
	}
	// No name / code available — fall back to Arts & Science (legacy default)
	return CAS_HEADER
}
