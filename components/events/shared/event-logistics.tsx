'use client';

// components/events/shared/event-logistics.tsx
// Shared "Event Logistics" section surfaced on every event-type detail page (tournament, marathon, …).
// Created by Events Platform Promotion PR1. Each later PR (budget, committees, tasks, volunteers,
// incidents, check-in/QR, certificates, bulk-import, analytics/kit) APPENDS one entry to
// EVENT_LOGISTICS_TABS below — the registry is intentionally append-only so PRs don't collide.
//
// Per-type visibility is a static map today (`eventTypes`); PR9 upgrades it to read saved presets.

import type { ComponentType, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Handshake, Package } from 'lucide-react';
import { SponsorsBoard } from './sponsors-board';

export interface EventLogisticsContext {
  eventId: string;
  eventType: string;
  canManage: boolean;
}

export interface EventLogisticsTab {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** 'all' = every event type; otherwise the event_type discriminators that should see this tab. */
  eventTypes: 'all' | string[];
  render: (ctx: EventLogisticsContext) => ReactNode;
}

// ── Append-only tab registry ────────────────────────────────────────────────
// PR1 registers Sponsors. PR2+ push their own entry here (one per PR → low conflict).
export const EVENT_LOGISTICS_TABS: EventLogisticsTab[] = [
  {
    key: 'sponsors',
    label: 'Sponsors',
    icon: Handshake,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <SponsorsBoard eventId={eventId} canManage={canManage} />,
  },
];

function tabVisible(tab: EventLogisticsTab, eventType: string): boolean {
  return tab.eventTypes === 'all' || tab.eventTypes.includes(eventType);
}

export function EventLogistics({
  eventId,
  eventType,
  canManage = true,
}: {
  eventId: string;
  eventType: string;
  canManage?: boolean;
}) {
  const tabs = EVENT_LOGISTICS_TABS.filter((t) => tabVisible(t, eventType));
  if (tabs.length === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-muted-foreground" />
          Event Logistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={tabs[0].key} className="w-full">
          <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5 text-xs">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-0">
              {t.render({ eventId, eventType, canManage })}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
