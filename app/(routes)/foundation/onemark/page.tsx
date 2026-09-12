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
import type { OneMarkStringKey } from '@/lib/onemark/i18n';
import { OneMarkLocaleToggle } from '@/lib/onemark/i18n/locale-toggle';
import { useOneMarkT } from '@/lib/onemark/i18n/use-onemark-t';
import { FoundationHeader } from '../_components/foundation-header';

// The hub carries the interface-language switch (decision 5): it is the first
// OneMark screen a learner opens, so the choice is available before anything
// else is read. The copy below is keyed rather than written inline — the
// dictionaries live in lib/onemark/i18n and English is the fallback for every
// key a native reviewer has not yet answered (ruling 10).

interface Surface {
  href: string;
  titleKey: OneMarkStringKey;
  descriptionKey: OneMarkStringKey;
  audienceKey: OneMarkStringKey;
  action: string;
  permission: string;
  icon: LucideIcon;
}

const SURFACES: Surface[] = [
  {
    href: '/foundation/onemark/practice',
    titleKey: 'hub.card.practice.title',
    descriptionKey: 'hub.card.practice.description',
    audienceKey: 'hub.card.practice.audience',
    action: 'practice.take',
    permission: 'foundation.practice.take',
    icon: PenLine,
  },
  {
    href: '/foundation/onemark/paper',
    titleKey: 'hub.card.paper.title',
    descriptionKey: 'hub.card.paper.description',
    audienceKey: 'hub.card.paper.audience',
    action: 'assessments.manage',
    permission: 'foundation.assessments.manage',
    icon: FileText,
  },
  {
    href: '/foundation/onemark/review',
    titleKey: 'hub.card.review.title',
    descriptionKey: 'hub.card.review.description',
    audienceKey: 'hub.card.review.audience',
    action: 'items.manage',
    permission: 'foundation.items.manage',
    icon: CheckSquare,
  },
];

export default function OneMarkHubPage() {
  const { isLoading, canAccess } = usePermissions();
  const { t } = useOneMarkT();

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
          message={t('hub.noAccess')}
          requiredPermission={SURFACES.map((s) => s.permission)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark"
        subtitle={t('hub.subtitle')}
        crumbs={[{ label: 'Foundation', href: '/foundation' }, { label: 'OneMark' }]}
        actions={<OneMarkLocaleToggle />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ href, titleKey, descriptionKey, audienceKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-[#0b6d41]/40 hover:shadow-sm"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b6d41]/10 text-[#0b6d41]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-foreground">{t(titleKey)}</p>
              <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="uppercase tracking-wider text-muted-foreground">
                {t(audienceKey)}
              </span>
              <ArrowRight className="h-4 w-4 text-[#0b6d41] transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
