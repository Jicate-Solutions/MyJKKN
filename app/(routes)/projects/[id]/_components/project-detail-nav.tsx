'use client';

/**
 * Project Detail Workspace Nav
 *
 * Wave-4 integration: the project detail page is the hub from which every
 * per-project feature (built as its own `/projects/[id]/<feature>` route in
 * Wave 4) is reached. Each Wave-4 PR was forbidden from editing this shared
 * page to keep the 10 parallel builds conflict-free; this component is the
 * single integration point that surfaces them all.
 *
 * Pure presentational link grid — no data fetching. Active route is derived
 * from usePathname so the current view is highlighted.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GanttChartSquare,
  ShieldAlert,
  Users,
  IndianRupee,
  FileText,
  Contact,
  BadgeCheck,
  Building2,
  Video,
  Replace,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';

type ProjectView = {
  /** URL segment under /projects/[id]/. */
  seg: string;
  label: string;
  icon: LucideIcon;
};

/** The 11 per-project feature views (Wave-3 Timeline/Risks + Wave-4 F5–F15). */
const PROJECT_VIEWS: ProjectView[] = [
  { seg: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { seg: 'risks', label: 'Risks & Issues', icon: ShieldAlert },
  { seg: 'resources', label: 'Resources', icon: Users },
  { seg: 'budget', label: 'Budget', icon: IndianRupee },
  { seg: 'documents', label: 'Documents', icon: FileText },
  { seg: 'stakeholders', label: 'Stakeholders', icon: Contact },
  { seg: 'approvals', label: 'Approvals', icon: BadgeCheck },
  { seg: 'institutions', label: 'Institutions', icon: Building2 },
  { seg: 'meetings', label: 'Meetings', icon: Video },
  { seg: 'changes', label: 'Changes', icon: Replace },
  { seg: 'closure', label: 'Closure', icon: CheckCircle2 },
];

export function ProjectDetailNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Project workspace"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {PROJECT_VIEWS.map((view) => {
        const href = `/projects/${projectId}/${view.seg}`;
        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
        const Icon = view.icon;
        return (
          <Link
            key={view.seg}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              TAP_TARGET,
              'hover:bg-accent hover:text-accent-foreground',
              isActive
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'border-border text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
