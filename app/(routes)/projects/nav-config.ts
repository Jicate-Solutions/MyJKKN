import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Projects — unified work-management module (absorbs OKR objectives/key-results).
 *
 * Three static top-level surfaces:
 *   /projects          — List / Board / Timeline / Portfolio tabs (landing)
 *   /projects/portfolio — Portfolio overview across all projects
 *   /projects/templates — Reusable project templates
 *
 * Dynamic routes (/projects/[id]/...) are intentionally excluded — they are
 * per-project drilldowns, not sidebar-level navigation destinations.
 */
const config: ModuleNavConfig = {
  module: 'projects',
  groups: [
    {
      label: 'Projects',
      icon: 'FolderKanban',
      href: '/projects',
      matchPaths: ['/projects'],
    },
    {
      label: 'Portfolio',
      icon: 'LayoutGrid',
      href: '/projects/portfolio',
      matchPaths: ['/projects/portfolio'],
    },
    {
      label: 'Templates',
      icon: 'Copy',
      href: '/projects/templates',
      matchPaths: ['/projects/templates'],
    },
  ],
};

export default config;
