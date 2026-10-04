'use client';

// Compact Registration card on the tournament detail page. Replaces the old
// inline builder: the builder now lives on its own page. Students register
// only through the public link — organizers configure the questions here.

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { useEventRegistrationForms } from '@/hooks/events/use-tournament-registration-form';

export function RegistrationFormCard({
  eventId,
  canManage,
}: {
  eventId: string;
  canManage: boolean;
}) {
  // An event holds many forms, addressed by FORM id — summarise the list rather
  // than passing the event id where a form id is expected.
  const { data: forms } = useEventRegistrationForms(canManage ? eventId : '');

  if (!canManage) return null;

  const formCount = forms?.length ?? 0;
  const openCount = forms?.filter((f) => f.is_enabled).length ?? 0;
  const responseCount = forms?.reduce((n, f) => n + (f.response_count ?? 0), 0) ?? 0;

  const summary =
    formCount === 0
      ? 'No registration forms yet — create one to start collecting entries.'
      : `${formCount} ${formCount === 1 ? 'form' : 'forms'} (${openCount} open) · ${responseCount} ${
          responseCount === 1 ? 'response' : 'responses'
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
          Configure the banner and questions students see when they register. {summary}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/events/tournament/${eventId}/registration-form`}>
            Manage registration form <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
