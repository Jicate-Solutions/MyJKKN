'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  feature: string;
  icon?: LucideIcon;
  plannedQuarter?: string;
  backHref?: string;
  backLabel?: string;
  bullets?: string[];
  breadcrumb?: Array<{ label: string; href?: string }>;
}

export function CampusLivingComingSoon({
  title,
  description,
  feature,
  icon: Icon = Sparkles,
  plannedQuarter,
  backHref = '/campus-living',
  backLabel = 'Back to Campus Living',
  bullets,
  breadcrumb,
}: ComingSoonProps) {
  const crumbs = breadcrumb ?? [
    { label: 'Home', href: '/' },
    { label: 'Campus Living', href: '/campus-living' },
    { label: title },
  ];
  return (
    <ContentLayout title={title}>
      <PageBreadcrumb items={crumbs} />
      <div className="container mx-auto p-6 max-w-3xl">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Button>
        </Link>

        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 px-8 text-center gap-6">
            <div className="rounded-full bg-primary/10 p-6">
              <Icon className="h-12 w-12 text-primary" />
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-muted-foreground max-w-xl">{description}</p>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {plannedQuarter ? `Coming ${plannedQuarter}` : 'Coming Soon'}
              </span>
            </div>

            {bullets && bullets.length > 0 && (
              <div className="w-full max-w-md text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  What you&apos;ll be able to do
                </p>
                <ul className="space-y-2">
                  {bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              Database schema for <code className="bg-muted px-1.5 py-0.5 rounded">{feature}</code>{' '}
              is already live on production. UI ships next.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
