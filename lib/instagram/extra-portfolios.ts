// lib/instagram/extra-portfolios.ts
//
// Multi-portfolio Instagram discovery config.
//
// MyJKKN's primary token (myjkkn_ads_api system user) belongs to the "JKKN
// Institutions" Business Portfolio (1720903384834051) and reads the 9 college
// accounts via `owned_instagram_accounts`. The ~56 DEPARTMENT accounts are
// owned by SEPARATE portfolios (e.g. "JKKN All Departments" 208146911814983)
// — a system-user token can only read assets owned by its own portfolio, so
// each extra portfolio needs its OWN token.
//
// This module parses an env-configured list of {businessId, token} pairs.
// Discover + sync iterate them and run the SAME proven `owned_instagram_accounts`
// path the colleges use, just pointed at each extra portfolio with its token.
//
// Env format — META_IG_EXTRA_PORTFOLIOS is a JSON array string:
//   [{"businessId":"208146911814983","token":"EAAG...","label":"JKKN All Departments"}]
// Absent / empty / malformed → returns [] (feature simply does nothing).
// Tokens are read server-side only and never returned to the client.

export interface ExtraIgPortfolio {
  businessId: string;
  token: string;
  /** Optional human label for logs only. */
  label?: string;
}

/**
 * Parse META_IG_EXTRA_PORTFOLIOS into a validated list. Never throws — a bad
 * value logs a warning and yields []. Entries missing businessId or token are
 * dropped individually.
 */
export function getExtraIgPortfolios(): ExtraIgPortfolio[] {
  const raw = process.env.META_IG_EXTRA_PORTFOLIOS;
  if (!raw || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[ig-extra-portfolios] META_IG_EXTRA_PORTFOLIOS is not valid JSON — ignoring');
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn('[ig-extra-portfolios] META_IG_EXTRA_PORTFOLIOS is not a JSON array — ignoring');
    return [];
  }

  const out: ExtraIgPortfolio[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const businessId = (entry as Record<string, unknown>).businessId;
    const token = (entry as Record<string, unknown>).token;
    const label = (entry as Record<string, unknown>).label;
    if (typeof businessId !== 'string' || !businessId.trim()) continue;
    if (typeof token !== 'string' || !token.trim()) continue;
    out.push({
      businessId: businessId.trim(),
      token: token.trim(),
      label: typeof label === 'string' ? label : undefined,
    });
  }
  return out;
}
