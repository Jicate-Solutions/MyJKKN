// PDF header config per institution.
// Resolved from the institution name fetched from the DB so the
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

const HEADERS: Array<{ match: RegExp; header: InstitutionPdfHeader }> = [
	{
		match: /engineering|technology/i,
		header: {
			institution_name: 'J K K NATARAJA COLLEGE OF ENGINEERING AND TECHNOLOGY',
			institution_address:
				'Natarajapuram, NH-544, Komarapalayam - 638 183, Namakkal Dt., Tamil Nadu.',
			institution_accreditation:
				'(Approved by AICTE - New Delhi and Affiliated to Anna University - Chennai)',
			banner_lines: [
				'(AN AUTONOMOUS INSTITUTION)',
				'(MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST)',
				'(Approved by AICTE - New Delhi and Affiliated to Anna University - Chennai)',
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
			// Green "JKKN College of Engineering & Technology" mark. Save the PNG
			// at this path (see public/logo/engg/); until then the banner renders
			// text-only (addImage failures are caught).
			logoImage: '/logo/engg/jkkn_engg_logo.png',
			rightLogoImage: '/logo/engg/jkkn_engg_logo.png',
		},
	},
	{
		match: /arts|science/i,
		header: {
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
		},
	},
]

export function getInstitutionHeader(name?: string | null): InstitutionPdfHeader {
	if (name) {
		for (const { match, header } of HEADERS) {
			if (match.test(name)) return header
		}
		// Unknown institution — render its own name with no accreditation line
		return {
			institution_name: name.toUpperCase(),
			institution_address: DEFAULT_ADDRESS,
			institution_accreditation: '',
			rightLogoImage: '/jkkn_logo.png',
		}
	}
	// No name available — fall back to Arts & Science (legacy default)
	return HEADERS[1].header
}
