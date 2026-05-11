'use client';

// ============================================================================
// getRuleTypeIcon — resolve a Lucide icon for an assignment-rule type.
//
// Extracted from columns.tsx during the policy-shell refactor (2026-05-08) so
// the helper survives independently of the now-deleted TanStack table.
// PR #757's /admin/counselors/rule-types page imports this from
// components/shared/assignment-rules-crud/columns; the columns.tsx file now
// re-exports from here to keep that import path stable.
// ============================================================================

import * as Icons from 'lucide-react';
import {
  Shuffle,
  GraduationCap,
  MapPin,
  Target,
  Building,
  Activity,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * Render the icon for an assignment-rule type.
 *
 * @param type     The rule type key (e.g. 'round_robin'). Falls back to a hardcoded
 *                 switch for the 6 system types when no iconName is supplied — keeps
 *                 backwards compatibility with callers that don't yet read from the
 *                 assignment_rule_type_registry.
 * @param iconName Optional Lucide icon name from the registry row (e.g. 'Shuffle').
 *                 When provided, it is preferred over the hardcoded mapping so admin-
 *                 created rule types get the icon the admin chose. Unknown names
 *                 fall through to the Settings glyph.
 */
export function getRuleTypeIcon(type?: string, iconName?: string | null) {
  // Prefer registry-supplied icon when present.
  if (iconName) {
    const Resolved = (Icons as unknown as Record<string, LucideIcon>)[iconName];
    if (Resolved) {
      return <Resolved className="h-4 w-4 text-muted-foreground" />;
    }
  }

  switch (type) {
    case 'program':
      return <GraduationCap className="h-4 w-4 text-blue-500" />;
    case 'round_robin':
      return <Shuffle className="h-4 w-4 text-purple-500" />;
    case 'location':
      return <MapPin className="h-4 w-4 text-green-500" />;
    case 'score':
      return <Target className="h-4 w-4 text-red-500" />;
    case 'source':
      return <Building className="h-4 w-4 text-orange-500" />;
    case 'workload':
      return <Activity className="h-4 w-4 text-yellow-500" />;
    default:
      return <Settings className="h-4 w-4 text-gray-500" />;
  }
}
