/**
 * Parent Portal — institution logo resolution.
 *
 * Maps an institution's counselling_code to a local logo asset under /public/logo.
 * Falls back to the DB institutions.logo_url when no local mapping exists.
 * Add new schools/colleges by extending LOGO_BY_CODE.
 */
const LOGO_BY_CODE: Record<string, string> = {
  MATRIC: '/logo/matric/matric_logo.png', // JKKN Matric Higher Secondary School
  NV: '/logo/nv/nv_logo.png', // Nattraja Vidhyalya CBSE
};

export function institutionLogo(
  counsellingCode?: string | null,
  fallbackUrl?: string | null
): string | undefined {
  const code = (counsellingCode ?? '').trim().toUpperCase();
  return LOGO_BY_CODE[code] || fallbackUrl || undefined;
}
