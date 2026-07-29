'use client';

// Compact Registration card shown on an event's detail page. Replaces the old
// inline builder: the builder now lives on its own page. Students register
// only through the public link — organizers configure the questions here.
//
// Moved here from the tournament route's _components/ 2026-07-29, because the
// general-event detail page (app/(routes)/events/[id]/page.tsx) now renders
// it too — a shared component must not live inside one route's _components/.

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { useRegistrationForm } from '@/hooks/events/use-tournament-registration-form';

export function RegistrationFormCard({
  eventId,
  canManage,
  href,
}: {
  eventId: string;
  canManage: boolean;
  /** Builder URL. Defaults to the tournament builder so the original caller is unchanged. */
  href?: string;
}) {
  const { data: form } = useRegistrationForm(canManage ? eventId : '');

  if (!canManage) return null;

  const sections = form?.sections ?? [];
  const fieldCount = sections.reduce((n, s) => n + (s.fields?.length ?? 0), 0);
  const enabled = form?.is_enabled !== false;

  const summary = !enabled
    ? 'Custom fields are turned off.'
    : fieldCount === 0
      ? 'No custom fields yet — learners only answer the standard fields.'
      : `${fieldCount} custom ${fieldCount === 1 ? 'field' : 'fields'} across ${sections.length} ${
          sections.length === 1 ? 'section' : 'sections'
        }.`;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-md bg-emerald-50 p-1.5 dark:bg-emerald-950/50">
            <ClipboardList className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </span>
          Registration Form
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="text-sm text-muted-foreground">
          Configure the questions students answer when they register. {summary}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={href ?? `/events/tournament/${eventId}/registration-form`}>
            Manage registration form <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
