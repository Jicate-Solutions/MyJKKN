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
import { Handshake, Package, Wallet, Users, UserCheck, QrCode, HeartHandshake, AlertTriangle, BadgeCheck, Upload, BarChart3, Shirt, ClipboardList } from 'lucide-react';
import { RegistrationsBoard } from './registrations-board';
import { SponsorsBoard } from './sponsors-board';
import { BudgetBoard } from './budget-board';
import { CommitteesBoard } from './committees-board';
import { CheckinBoard } from './checkin-board';
import { QrBoard } from './qr-board';
import { VolunteersBoard } from './volunteers-board';
import { IncidentsBoard } from './incidents-board';
import { CertificatesBoard } from './certificates-board';
import { BulkImportBoard } from './bulk-import-board';
import { AnalyticsBoard } from './analytics-board';
import { KitBoard } from './kit-board';

export interface EventLogisticsContext {
  eventId: string;
  eventType: string;
  canManage: boolean;
  /**
   * Committee prep-tasks may be editable for people who cannot manage the event
   * (tournament committee members: view everything, tick their tasks). Defaults
   * to canManage when the host page doesn't distinguish the two.
   */
  canEditTasks: boolean;
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
  // Registrations is deliberately FIRST, not appended. The append-only rule above
  // exists to stop concurrent PRs colliding on this array, not to fix display
  // order — and with twelve tabs the list already wraps to two rows, so appending
  // the event's primary record would bury it last.
  {
    key: 'registrations',
    label: 'Registrations',
    icon: ClipboardList,
    eventTypes: 'all',
    render: ({ eventId, eventType, canManage }) => (
      <RegistrationsBoard eventId={eventId} eventType={eventType} canManage={canManage} />
    ),
  },
  {
    key: 'sponsors',
    label: 'Sponsors',
    icon: Handshake,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <SponsorsBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'budget',
    label: 'Budget',
    icon: Wallet,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <BudgetBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'committees',
    label: 'Committees',
    icon: Users,
    eventTypes: 'all',
    render: ({ eventId, canManage, canEditTasks }) => (
      <CommitteesBoard eventId={eventId} canManage={canManage} canEditTasks={canEditTasks} />
    ),
  },
  {
    key: 'checkin',
    label: 'Check-in',
    icon: UserCheck,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <CheckinBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'qr',
    label: 'QR Passes',
    icon: QrCode,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <QrBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'volunteers',
    label: 'Volunteers',
    icon: HeartHandshake,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <VolunteersBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'incidents',
    label: 'Incidents',
    icon: AlertTriangle,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <IncidentsBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'certificates',
    label: 'Certificates',
    icon: BadgeCheck,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <CertificatesBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'bulk-import',
    label: 'Bulk Import',
    icon: Upload,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <BulkImportBoard eventId={eventId} canManage={canManage} />,
  },
  // PR8 — shared analytics shell (format-agnostic core metrics).
  {
    key: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <AnalyticsBoard eventId={eventId} canManage={canManage} />,
  },
  // PR8 — kit / t-shirt / merch distribution over events_registrations.tshirt_collected*.
  {
    key: 'kit',
    label: 'Kit / T-shirt',
    icon: Shirt,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => <KitBoard eventId={eventId} canManage={canManage} />,
  },
];

/**
 * Tabs whose boards expose money or incident detail. `canManage={false}` makes
 * every board READ-ONLY, not hidden — which is fine on a console that already
 * gates who may open it at all (the tournament page checks access.canView
 * first), and not fine on one that doesn't.
 *
 * RLS does not cover this: `event_sponsors` / `event_budget_items` are readable
 * far more broadly than any event's access model implies. So a host page with
 * no gate of its own passes `hideSensitiveWithoutManage` and these three
 * disappear for non-managers rather than merely going read-only.
 */
const SENSITIVE_TAB_KEYS = ['sponsors', 'budget', 'incidents'] as const;

/**
 * The event's primary record. Always shown, even when `enabledTools` names a
 * narrower set — an event whose registrations you cannot reach is not a console.
 */
const ALWAYS_ON_TAB_KEY = 'registrations';

function tabVisible(
  tab: EventLogisticsTab,
  eventType: string,
  enabledTools: string[] | null | undefined,
  canManage: boolean,
  hideSensitiveWithoutManage: boolean,
): boolean {
  if (tab.eventTypes !== 'all' && !tab.eventTypes.includes(eventType)) return false;

  if (
    hideSensitiveWithoutManage &&
    !canManage &&
    (SENSITIVE_TAB_KEYS as readonly string[]).includes(tab.key)
  ) {
    return false;
  }

  // An ABSENT or EMPTY selection means "every tool" — events created before the
  // tools picker existed have no key at all, and writing [] to mean "none" would
  // silently blank the console for them.
  if (!enabledTools?.length) return true;

  return tab.key === ALWAYS_ON_TAB_KEY || enabledTools.includes(tab.key);
}

/** Exported for tests — the filter above with no React around it. */
export function visibleLogisticsTabs(opts: {
  eventType: string;
  enabledTools?: string[] | null;
  canManage?: boolean;
  hideSensitiveWithoutManage?: boolean;
}): EventLogisticsTab[] {
  return EVENT_LOGISTICS_TABS.filter((t) =>
    tabVisible(
      t,
      opts.eventType,
      opts.enabledTools,
      opts.canManage ?? true,
      opts.hideSensitiveWithoutManage ?? false,
    ),
  );
}

export function EventLogistics({
  eventId,
  eventType,
  canManage = true,
  canEditTasks,
  enabledTools,
  hideSensitiveWithoutManage = false,
}: {
  eventId: string;
  eventType: string;
  canManage?: boolean;
  /** Defaults to canManage — pass true to let non-managers tick committee tasks. */
  canEditTasks?: boolean;
  /**
   * `events.config.enabled_tools` — the tools chosen when the event was created.
   * Absent/empty shows every tab (see tabVisible).
   */
  enabledTools?: string[] | null;
  /**
   * Hide Sponsors / Budget / Incidents from viewers who cannot manage the event.
   * Pass `true` from any console that does NOT gate access before rendering.
   * Defaults to false so the tournament console keeps showing committee members
   * every board read-only, as it does today.
   */
  hideSensitiveWithoutManage?: boolean;
}) {
  const tabs = visibleLogisticsTabs({
    eventType,
    enabledTools,
    canManage,
    hideSensitiveWithoutManage,
  });
  if (tabs.length === 0) return null;
  const tasksEditable = canEditTasks ?? canManage;

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
              {t.render({ eventId, eventType, canManage, canEditTasks: tasksEditable })}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
