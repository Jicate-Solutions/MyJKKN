// app/(routes)/billing/reports/accountant/_components/_utils.ts
// Reuses the analytics date/number helpers (does not modify that feature) and
// adds hub-specific scheme options + dark-mode-safe chart color tokens.
export {
  presetRange,
  DATE_PRESETS,
  formatINRCompact,
  formatCurrency,
  num,
  type DatePreset,
} from '@/app/(routes)/billing/analytics/_components/_utils';

import type { ReportScheme } from '@/types/billing-accountant-reports';

export const SCHEME_OPTIONS: { value: ReportScheme; label: string }[] = [
  { value: 'all', label: 'All Students' },
  { value: 'first_graduate', label: 'First Graduate' },
  { value: 'pmss', label: 'PMSS' },
  { value: 'scholarship_7_5', label: '7.5% Scholarship' },
];

export const SCHEME_LABEL: Record<ReportScheme, string> = {
  all: 'All Students',
  first_graduate: 'First Graduate',
  pmss: 'PMSS',
  scholarship_7_5: '7.5% Scholarship',
};

// Theme tokens — resolve to the Tailwind --chart-1..5 HSL vars so charts adapt
// to light/dark automatically (unlike the older billing charts' hardcoded hex).
export const CHART_TOKENS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];
export const chartToken = (i: number) => CHART_TOKENS[i % CHART_TOKENS.length];
