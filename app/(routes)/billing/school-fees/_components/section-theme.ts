// section-theme.ts
//
// One colour identity per School Fees section so a user can tell, at a glance,
// which screen they are on. The colour lives in the header, the section icon,
// the card headers, the table headers and the primary action — never the
// whole page background, which stays neutral with only a soft tint.
//
// Every class string is written out in full (no template interpolation) so
// Tailwind's scanner can see it.

import {
  CalendarDays,
  ClipboardList,
  HandCoins,
  Percent,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type SchoolFeeSection = 'plans' | 'calendar' | 'concessions' | 'generate' | 'collect';

export interface SectionTheme {
  key: SchoolFeeSection;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Soft tinted wrapper behind the whole section. */
  pageBg: string;
  /** Gradient banner behind the page title. */
  headerGradient: string;
  /** Icon tile inside the banner and card titles. */
  iconTile: string;
  /** Small icon tile used inside card titles. */
  iconTileSm: string;
  /** Tinted card header strip. */
  cardHeader: string;
  /** Card border accent. */
  cardBorder: string;
  /** Tinted table header row. */
  tableHeader: string;
  /** Primary action button. */
  button: string;
  /** Count / status badge in the section colour. */
  badge: string;
  /** Active nav chip. */
  chipActive: string;
  /** Text in the section colour. */
  text: string;
}

export const SECTION_THEMES: Record<SchoolFeeSection, SectionTheme> = {
  plans: {
    key: 'plans',
    label: 'Fee Plans',
    href: '/billing/school-fees',
    icon: ClipboardList,
    pageBg: 'bg-blue-50/60 dark:bg-blue-950/20',
    headerGradient:
      'bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 text-white dark:from-blue-800 dark:via-blue-700 dark:to-sky-700',
    iconTile: 'bg-white/20 text-white ring-1 ring-white/30',
    iconTileSm: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    cardHeader: 'bg-blue-50 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900 rounded-t-xl',
    cardBorder: 'border-blue-200 dark:border-blue-900',
    tableHeader:
      'bg-blue-50 dark:bg-blue-950/30 [&_th]:text-blue-900 dark:[&_th]:text-blue-200 [&_th]:font-semibold',
    button: 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500',
    badge: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    chipActive: 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
  },
  calendar: {
    key: 'calendar',
    label: 'Term Calendar',
    href: '/billing/school-fees/term-calendar',
    icon: CalendarDays,
    pageBg: 'bg-purple-50/60 dark:bg-purple-950/20',
    headerGradient:
      'bg-gradient-to-r from-purple-600 via-violet-500 to-fuchsia-400 text-white dark:from-purple-800 dark:via-violet-700 dark:to-fuchsia-700',
    iconTile: 'bg-white/20 text-white ring-1 ring-white/30',
    iconTileSm: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    cardHeader:
      'bg-purple-50 dark:bg-purple-950/40 border-b border-purple-100 dark:border-purple-900 rounded-t-xl',
    cardBorder: 'border-purple-200 dark:border-purple-900',
    tableHeader:
      'bg-purple-50 dark:bg-purple-950/30 [&_th]:text-purple-900 dark:[&_th]:text-purple-200 [&_th]:font-semibold',
    button: 'bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-600 dark:hover:bg-purple-500',
    badge: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    chipActive: 'bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500',
    text: 'text-purple-700 dark:text-purple-300',
  },
  concessions: {
    key: 'concessions',
    label: 'Concessions',
    href: '/billing/school-fees/concessions',
    icon: Percent,
    pageBg: 'bg-emerald-50/60 dark:bg-emerald-950/20',
    headerGradient:
      'bg-gradient-to-r from-emerald-600 via-green-500 to-lime-400 text-white dark:from-emerald-800 dark:via-green-700 dark:to-lime-700',
    iconTile: 'bg-white/20 text-white ring-1 ring-white/30',
    iconTileSm: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    cardHeader:
      'bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900 rounded-t-xl',
    cardBorder: 'border-emerald-200 dark:border-emerald-900',
    tableHeader:
      'bg-emerald-50 dark:bg-emerald-950/30 [&_th]:text-emerald-900 dark:[&_th]:text-emerald-200 [&_th]:font-semibold',
    button:
      'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500',
    badge: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    chipActive:
      'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  generate: {
    key: 'generate',
    label: 'Generate Fees',
    href: '/billing/school-fees/generate',
    icon: Wallet,
    pageBg: 'bg-orange-50/60 dark:bg-orange-950/20',
    headerGradient:
      'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 text-white dark:from-orange-800 dark:via-orange-700 dark:to-amber-700',
    iconTile: 'bg-white/20 text-white ring-1 ring-white/30',
    iconTileSm: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    cardHeader:
      'bg-orange-50 dark:bg-orange-950/40 border-b border-orange-100 dark:border-orange-900 rounded-t-xl',
    cardBorder: 'border-orange-200 dark:border-orange-900',
    tableHeader:
      'bg-orange-50 dark:bg-orange-950/30 [&_th]:text-orange-900 dark:[&_th]:text-orange-200 [&_th]:font-semibold',
    button: 'bg-orange-600 hover:bg-orange-700 text-white dark:bg-orange-600 dark:hover:bg-orange-500',
    badge: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    chipActive: 'bg-orange-600 text-white border-orange-600 dark:bg-orange-500 dark:border-orange-500',
    text: 'text-orange-700 dark:text-orange-300',
  },
  collect: {
    key: 'collect',
    label: 'Bill Payment',
    href: '/billing/school-fees/collect',
    icon: HandCoins,
    pageBg: 'bg-teal-50/60 dark:bg-teal-950/20',
    headerGradient:
      'bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-400 text-white dark:from-teal-800 dark:via-teal-700 dark:to-cyan-700',
    iconTile: 'bg-white/20 text-white ring-1 ring-white/30',
    iconTileSm: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    cardHeader: 'bg-teal-50 dark:bg-teal-950/40 border-b border-teal-100 dark:border-teal-900 rounded-t-xl',
    cardBorder: 'border-teal-200 dark:border-teal-900',
    tableHeader:
      'bg-teal-50 dark:bg-teal-950/30 [&_th]:text-teal-900 dark:[&_th]:text-teal-200 [&_th]:font-semibold',
    button: 'bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-600 dark:hover:bg-teal-500',
    badge: 'border-transparent bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    chipActive: 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500',
    text: 'text-teal-700 dark:text-teal-300',
  },
};

/** Section order shown in the header nav chips — the order of the work. */
export const SECTION_ORDER: SchoolFeeSection[] = [
  'plans',
  'calendar',
  'concessions',
  'generate',
  'collect',
];
