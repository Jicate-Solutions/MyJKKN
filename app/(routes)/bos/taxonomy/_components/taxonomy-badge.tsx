import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Color-coded framework pill so Fink's vs Bloom's vs JKKN Advanced vs custom are
 * scannable at a glance across the taxonomy screens. Renders the human label
 * ("Fink's") rather than the raw code ("finks") — without the jkkn_advanced arm a
 * JABT board rendered the literal string "jkkn_advanced".
 */
export function TaxonomyBadge({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  const cls =
    t === 'finks'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900'
      : t === 'blooms'
        ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900'
        : t === 'jkkn_advanced'
          ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900'
          : 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900';
  const label =
    t === 'finks' ? "Fink's"
      : t === 'blooms' ? "Bloom's"
        : t === 'jkkn_advanced' ? 'JKKN Advanced'
          : type;
  return <Badge variant='outline' className={cn('capitalize font-medium', cls, className)}>{label}</Badge>;
}
