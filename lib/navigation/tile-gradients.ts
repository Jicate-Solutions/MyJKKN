/**
 * tile-gradients.ts
 *
 * Maps BottomNav More-drawer group labels to CSS gradient strings.
 * Color families encode function families so tiles are glanceable at a glance.
 *
 * Palette source: /tmp/more-drawer-tiles.html SECTIONS array (approved mockup).
 *
 * Usage:
 *   import { getTileGradient } from '@/lib/navigation/tile-gradients';
 *   const bg = getTileGradient('Academic Management'); // → 'linear-gradient(135deg, #6366f1, #4f46e5)'
 */

/** CSS linear-gradient string. */
type CSSGradient = string;

/**
 * Exact groupLabel strings that come from sidebarMenuLink.ts GetRoleBasedPages.
 * Unknown labels fall back to the slate family.
 */
const TILE_GRADIENT_MAP: Record<string, CSSGradient> = {
  // ── Operations / Admin (slate) ─────────────────────────────────────────
  'Overview':               'linear-gradient(135deg, #475569, #334155)',
  'User Management':        'linear-gradient(135deg, #64748b, #475569)',
  'Organization Management':'linear-gradient(135deg, #475569, #1e293b)',
  'Administration':         'linear-gradient(135deg, #52525b, #27272a)',

  // ── Applications (blue) ───────────────────────────────────────────────
  'Applications':           'linear-gradient(135deg, #3b82f6, #2563eb)',
  'Application Management': 'linear-gradient(135deg, #2563eb, #1d4ed8)',

  // ── Academic family (indigo / violet) ─────────────────────────────────
  'Academic Management':    'linear-gradient(135deg, #6366f1, #4f46e5)',
  'Learners':               'linear-gradient(135deg, #4f46e5, #4338ca)',
  'Faculty':                'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'Learning':               'linear-gradient(135deg, #a855f7, #9333ea)',
  'Value Added Courses':    'linear-gradient(135deg, #c084fc, #a855f7)',
  'Learners Council':       'linear-gradient(135deg, #7c3aed, #6d28d9)',

  // ── People / HR (rose) ────────────────────────────────────────────────
  'Employee Management':    'linear-gradient(135deg, #f43f5e, #e11d48)',
  'HR (Sprints 1-3)':       'linear-gradient(135deg, #e11d48, #be123c)',

  // ── Living / Wellness (amber / orange) ────────────────────────────────
  'Campus Living':          'linear-gradient(135deg, #f59e0b, #d97706)',
  'Health & Wellness':      'linear-gradient(135deg, #fb923c, #ea580c)',
  'Work Pulse':             'linear-gradient(135deg, #fbbf24, #f59e0b)',

  // ── Admissions / Growth (pink / fuchsia) ──────────────────────────────
  'Admission CRM':          'linear-gradient(135deg, #ec4899, #db2777)',
  'Events':                 'linear-gradient(135deg, #d946ef, #c026d3)',
  'Startup Studio':         'linear-gradient(135deg, #c026d3, #a21caf)',
  'Solution Hub':           'linear-gradient(135deg, #e879f9, #d946ef)',

  // ── Finance / Operations (emerald / teal) ─────────────────────────────
  'Accounts':               'linear-gradient(135deg, #10b981, #059669)',
  'Resource Management':    'linear-gradient(135deg, #14b8a6, #0d9488)',
  'Service Requests':       'linear-gradient(135deg, #0ea5e9, #0284c7)',

  // ── Performance / Compliance (cyan / sky) ─────────────────────────────
  'OKR & Performance':      'linear-gradient(135deg, #06b6d4, #0891b2)',
  'Audit Workflow':         'linear-gradient(135deg, #0891b2, #0e7490)',
  'Accreditation':          'linear-gradient(135deg, #0284c7, #0369a1)',

  // ── System (zinc / dark) ──────────────────────────────────────────────
  'System':                 'linear-gradient(135deg, #18181b, #09090b)',
};

/** Fallback for any groupLabel not in the map. */
const FALLBACK_GRADIENT: CSSGradient = 'linear-gradient(135deg, #475569, #334155)';

/**
 * Returns the CSS gradient string for a given groupLabel.
 * Falls back to slate if unknown.
 */
export function getTileGradient(groupLabel: string): CSSGradient {
  return TILE_GRADIENT_MAP[groupLabel] ?? FALLBACK_GRADIENT;
}
