// Shared display formatters for the Program Eligibility tables/dialogs.
// Kept dependency-free (no local imports) so both columns.tsx and the
// detail dialogs can import it without forming an import cycle.

// ₹ rupees → compact lakh label. Trims trailing zeros (400000 => "4L").
const lakh = (n: number) => `${Number((n / 100000).toFixed(2))}L`;

// Academic-fee band is closed [fee_min, fee_max] in rupees (both bounds
// inclusive); either bound null => unbounded. Both null => "Any". The fee a
// learner is matched against is their ADMISSION-year academic bill total
// (fn_learner_admission_year_academic_fee), not the current year's.
export function formatFeeBand(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Any';
  if (min == null) return `< ${lakh(max!)}`;
  if (max == null) return `≥ ${lakh(min)}`;
  return `${lakh(min)} – ${lakh(max)}`;
}
