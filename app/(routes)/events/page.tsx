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
import { Timer, Music, Mic2, Dumbbell, BookOpen, Users } from 'lucide-react';

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
  },
  {
    title: 'Cultural Fest',
    description:
      'Manage cultural festivals with multiple stages, performances, and competitions.',
    href: '/events/cultural-fest',
    icon: Music,
    available: false,
  },
  {
    title: 'Seminar',
    description:
      'Plan seminars with speaker management, session scheduling, and attendee tracking.',
    href: '/events/seminar',
    icon: Mic2,
    available: false,
  },
  {
    title: 'Sports Day',
    description:
      'Organize sports days with multiple events, team scoring, and medal tracking.',
    href: '/events/sports-day',
    icon: Dumbbell,
    available: false,
  },
  {
    title: 'Workshop',
    description:
      'Conduct workshops with material management, hands-on sessions, and certificates.',
    href: '/events/workshop',
    icon: BookOpen,
    available: false,
  },
  {
    title: 'Conference',
    description:
      'Host conferences with multi-track agendas, networking, and exhibitor management.',
    href: '/events/conference',
    icon: Users,
    available: false,
  },
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
        <div>
          <h1 className="text-2xl font-bold py-1">Events Hub</h1>
          <p className="text-sm text-muted-foreground">
            Manage all types of institutional events from a single place.
          </p>
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
