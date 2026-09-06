'use client';

// OneMark — hub.
//
// /foundation/onemark has three child surfaces (practice, paper, review), so
// this page must exist or the parent URL 404s (hub-page-404 class, see
// .github/workflows/hub-page-reachability-pr-scoped.yml). It lists the
// surfaces the caller may open; a caller who may open none sees an explicit
// access panel, never a silent redirect (CLAUDE.md #27).

import Link from 'next/link';
import { ArrowRight, CheckSquare, FileText, PenLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../_components/foundation-header';

interface Surface {
  href: string;
  title: string;
  description: string;
  audience: string;
  action: string;
  permission: string;
  icon: LucideIcon;
}

const SURFACES: Surface[] = [
  {
    href: '/foundation/onemark/practice',
    title: 'Practice',
    description: 'Answer one-score items from the live bank, unit by unit, and see your score as you go.',
    audience: 'Learners',
    action: 'practice.take',
    permission: 'foundation.practice.take',
    icon: PenLine,
  },
  {
    href: '/foundation/onemark/paper',
    title: 'Paper',
    description: 'Assemble a one-score paper from the live bank against a unit list.',
    audience: 'Senior Learners',
    action: 'assessments.manage',
    permission: 'foundation.assessments.manage',
    icon: FileText,
  },
  {
    href: '/foundation/onemark/review',
    title: 'Review drafts',
    description: 'Read each draft against its source paper, set the answer and level, then tick it into the live bank.',
    audience: 'Subject Senior Learners',
    action: 'items.manage',
    permission: 'foundation.items.manage',
    icon: CheckSquare,
  },
];

export default function OneMarkHubPage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const visible = SURFACES.filter((s) => canAccess('foundation', s.action));

  if (visible.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="You don't have access to OneMark — contact your school's resource person."
          requiredPermission={SURFACES.map((s) => s.permission)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark"
        subtitle="One-score items lifted from past board papers: practise them, assemble them into a paper, or approve new drafts into the bank."
        crumbs={[{ label: 'Foundation', href: '/foundation' }, { label: 'OneMark' }]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ href, title, description, audience, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-[#0b6d41]/40 hover:shadow-sm"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b6d41]/10 text-[#0b6d41]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="uppercase tracking-wider text-muted-foreground">{audience}</span>
              <ArrowRight className="h-4 w-4 text-[#0b6d41] transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
