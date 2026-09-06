/**
 * PDE Module — top-level layout shell.
 *
 * PDE was previously stuffed under three different role-prefixed surfaces
 * (/pde/admin/*, /pde/faculty/*, /pde/learn/*), inheriting the full
 * admin/layout.tsx chrome — which produced ~43 navigation chips above every
 * PDE admin page, none of them PDE-relevant. Director surfaced this 2026-06-09
 * as "how the hell can you navigate like this?"
 *
 * Module extraction moves the 3 subtrees under a unified /pde/{admin,faculty,
 * learn}/* tree with this layout as the single PDE-focused shell. Per-role
 * sub-layouts (pde/admin/layout.tsx etc.) provide their own focused chrome.
 *
 * Behaviour at /pde itself is handled by app/(routes)/pde/page.tsx — a
 * config-driven redirect via platform_policies (nav.pde.default_landing).
 *
 * The per-module "?Help" Smart Guide FAB that previously rode here has been
 * REPLACED by the ONE route-aware platform FAB in the root layout
 * (components/guide/platform-guide-fab-mount.tsx), so help is one tap away on
 * every PDE screen via that single platform FAB. The PDE guide PAGE (/pde/guide)
 * is untouched. With the FAB gone this shell is a plain pass-through.
 */

import type { ReactNode } from 'react';

export default function PdeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
