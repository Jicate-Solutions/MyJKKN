'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Timer, Music, Mic2, Dumbbell, BookOpen, Users, Plus } from 'lucide-react';

interface EventTypeCard {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  available: boolean;
}

const EVENT_TYPES: EventTypeCard[] = [
  {
    title: 'Marathon',
    description:
      'Organize running events with registration, bib management, live tracking, and results.',
    href: '/events/marathon',
    icon: Timer,
    available: true,
  }
];

export default function EventsHubPage() {
  return (
    <ContentLayout title="Events">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">Events Hub</h1>
            <p className="text-sm text-muted-foreground">
              Manage all types of institutional events from a single place.
            </p>
          </div>
          <Button asChild size="lg" className="self-start sm:self-end">
            <Link href="/events/propose">
              <Plus className="h-4 w-4 mr-2" />
              Propose new event
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_TYPES.map((eventType) => {
            const Icon = eventType.icon;
            const CardWrapper = eventType.available ? Link : 'div';
            const wrapperProps = eventType.available
              ? { href: eventType.href }
              : {};

            return (
              <CardWrapper
                key={eventType.title}
                {...(wrapperProps as any)}
                className={eventType.available ? 'block' : 'block'}
              >
                <Card
                  className={`h-full transition-colors ${
                    eventType.available
                      ? 'hover:border-primary/50 cursor-pointer'
                      : 'opacity-60'
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-lg">
                          {eventType.title}
                        </CardTitle>
                      </div>
                      {!eventType.available && (
                        <Badge variant="secondary">Coming Soon</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{eventType.description}</CardDescription>
                  </CardContent>
                </Card>
              </CardWrapper>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
