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
	/** Officials block rendered below the institutional banner on BoS PDFs. */
	officials?: InstitutionPdfOfficials
}

const DEFAULT_ADDRESS = 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu'

const HEADERS: Array<{ match: RegExp; header: InstitutionPdfHeader }> = [
	{
		match: /engineering|technology/i,
		header: {
			institution_name: 'J.K.K.NATARAJA COLLEGE OF ENGINEERING & TECHNOLOGY',
			institution_address: DEFAULT_ADDRESS,
			institution_accreditation:
				'(Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai)',
			rightLogoImage: '/jkkn_logo.png',
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
				secretary_name: 'Mrs.N.SENDAMARAAI',
				principal_name: 'Capt.Dr.M.NALINI, M.Sc.,M.Phil.,Ph.D., Principal',
				contact_cell: '94878 33330, 99653 63999',
				contact_web: 'www.jkkn.ac.in',
				contact_email: 'arts@jkkn.org',
			},
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
