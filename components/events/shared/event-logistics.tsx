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
import { Handshake, Package, Wallet, Users, UserCheck, QrCode, HeartHandshake, AlertTriangle, BadgeCheck, Upload, BarChart3, Shirt, ClipboardList, Megaphone } from 'lucide-react';
import { RegistrationsBoard } from './registrations-board';
import { SponsorsBoard } from './sponsors-board';
import { BudgetBoard } from './budget-board';
import { CommitteesBoard } from './committees-board';
import { CheckinBoard } from './checkin-board';
import { QrBoard, TournamentQrLinks } from './qr-board';
import { VolunteersBoard } from './volunteers-board';
import { IncidentsBoard } from './incidents-board';
import { CertificatesBoard } from './certificates-board';
import { BulkImportBoard } from './bulk-import-board';
import { AnalyticsBoard } from './analytics-board';
import { KitBoard } from './kit-board';
import { MessagesBoard } from './messages-board';

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
  /** Event types that never see this tab, even under 'all'. */
  excludeEventTypes?: string[];
  /**
   * The `events.config.enabled_tools` key that switches this tab on — i.e. the
   * EVENT_TOOL_KEYS entry the create wizard writes. Defaults to `key`, which is
   * right for every tab whose picker entry is spelled the same.
   *
   * Declared HERE, on the tab, rather than in a lookup table somewhere else,
   * for two reasons. The registry is append-only so that concurrent PRs don't
   * collide; a side table would be a second place every new tab has to
   * remember to touch, and the whole defect below is what happens when the two
   * vocabularies are maintained apart. And one picker entry may legitimately
   * cover SEVERAL tabs — "Check-in & QR Passes" is one checkbox over two
   * boards — which a tab-key rename cannot express at all.
   *
   * The invariant in __tests__/events/event-logistics-tool-keys.test.ts fails
   * loudly if a tab's tool key is not offerable, or if a picker key mounts
   * nothing.
   */
  toolKey?: string;
  render: (ctx: EventLogisticsContext) => ReactNode;
}

/**
 * The `enabled_tools` key that turns this tab on. `toolKey` when the tab
 * declares one, otherwise the tab's own key.
 */
export const toolKeyFor = (tab: Pick<EventLogisticsTab, 'key' | 'toolKey'>): string =>
  tab.toolKey ?? tab.key;

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
  // Check-in and QR Passes are ONE choice in the create wizard — the checkbox is
  // labelled "Check-in & QR Passes" — so both name that entry's key. Without
  // this, `enabledTools.includes('checkin')` never matched the 'check-in' the
  // wizard writes, and neither board could be reached on an event that had
  // chosen its tools. See the invariant test.
  {
    key: 'checkin',
    label: 'Check-in',
    icon: UserCheck,
    eventTypes: 'all',
    toolKey: 'check-in',
    render: ({ eventId, canManage }) => <CheckinBoard eventId={eventId} canManage={canManage} />,
  },
  {
    key: 'qr',
    label: 'QR Passes',
    icon: QrCode,
    eventTypes: 'all',
    toolKey: 'check-in',
    // Tournament entries have no BIB number, so the BIB-based board is always
    // empty for them — route to the tournament passes / registration QR instead.
    render: ({ eventId, eventType, canManage }) =>
      eventType === 'sports_tournament' ? (
        <TournamentQrLinks eventId={eventId} canManage={canManage} />
      ) : (
        <QrBoard eventId={eventId} canManage={canManage} />
      ),
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
  // Not on tournaments (BUG-006175): every registration of a chess or carrom
  // tournament showed up here as a T-shirt still to hand out. As of 28 Sep no
  // tournament has ever recorded a kit hand-out (0 of 692 registrations across
  // 19); marathons have (136).
  {
    key: 'kit',
    label: 'Kit / T-shirt',
    icon: Shirt,
    eventTypes: 'all',
    excludeEventTypes: ['sports_tournament'],
    render: ({ eventId, canManage }) => <KitBoard eventId={eventId} canManage={canManage} />,
  },
  // The organiser's one manual, deliberate message to the event's registrants.
  // Appended, per the registry rule at the top of this file.
  //
  // NOT in SENSITIVE_TAB_KEYS, and NOT gated on canManage — both for the same
  // reason. `canManage` on /events/[id] is canEditEvent(), which recognises
  // neither the event's in-charge nor an ordinary admin, while the server gate
  // fn_can_manage_event_messages recognises both. Hiding or disabling on
  // canManage would lock out two of the four roles allowed to send. The board
  // asks the server and renders an explicit "you do not have access" card when
  // the answer is no (house rule #27); no registrant data renders in that state.
  {
    key: 'messages',
    label: 'Messages',
    icon: Megaphone,
    eventTypes: 'all',
    render: ({ eventId, canManage }) => (
      <MessagesBoard eventId={eventId} canManage={canManage} />
    ),
  },
];

// ── In-charge write audit (PR #4326 review, 11 Oct 2026) ────────────────────
// /events/[id] passes canManage = canEdit || isEventIncharge(event, uid). Every
// control below that canManage unlocks was traced to the write it performs and
// the LIVE gate on that write (pg_policies / pg_get_functiondef / route code,
// read 11 Oct). Classes:
//   ADMITS-INCHARGE  live policy / RPC / route admits fn_is_event_incharge
//   OPEN             live gate admits any signed-in user (pre-existing hole,
//                    out of scope here — it is open to in-charges and
//                    non-in-charges alike)
//   PERMISSION       gated on a named permission in BOTH the UI and the RPC;
//                    canManage only narrows it (an editor without the
//                    permission is refused too), so canEdit would change nothing
//   EDITOR-ONLY / EVENTS-ROW  would be refused for an in-charge, or writes the
//                    events row itself → must be fed canEdit instead. NONE found.
//
// board         control                         write target                                   live gate                                          class
// registrations mark paid / withdraw (tourn.)   PATCH|DELETE /api/events/tournament/:id/entries canManageTournament (perm OR fn_is_event_incharge) ADMITS-INCHARGE
// registrations payment link (tournament)       POST …/entries/:entry/pay                       canManageTournament                                ADMITS-INCHARGE
// registrations division fee (DivisionFeeBadge) tournament_divisions UPDATE                     tournament_divisions_incharge_all                  ADMITS-INCHARGE
// registrations export xlsx/csv                 none (download of rows already read)            —                                                  read-only
// sponsors      add / edit / delete / stage     event_sponsors ALL                              event_sponsors_event_team_write                    ADMITS-INCHARGE
// sponsors      sponsorship notes               event_sponsorship_notes UPSERT                  event_sponsorship_notes_event_team_write           ADMITS-INCHARGE
// budget        add / edit / delete line        event_budget_items ALL                          event_budget_items_event_team_write (+ lock trg)   ADMITS-INCHARGE
// budget        attach / remove bill            /api/events/:id/budget-attachment → items UPDATE same policy, via caller's session client          ADMITS-INCHARGE
// budget        settle line                     rpc fn_settle_event_budget_line                 is_admin OR fn_is_event_incharge OR perms          ADMITS-INCHARGE
// budget        submit for sign-off             rpc fn_submit_event_budget                      auth.uid() IS NOT NULL (button not on canManage)   OPEN
// budget        approve / reopen / close books  rpc fn_{approve,reopen,close}_event_budget      is_admin OR events.budget.approve (UI: same perm)  PERMISSION
// committees    create / edit / roster / leads  POST|PUT /api/events/marathon/:id/committees    canManageEventOps (… OR fn_is_event_incharge)      ADMITS-INCHARGE
// committees    delete committee                event_committees DELETE                         event_committees_event_team_write                  ADMITS-INCHARGE
// committees    add / edit / delete task        event_tasks ALL                                 event_tasks_committee_write (fn_can_manage_committee_tasks → incharge) ADMITS-INCHARGE
// checkin       check in / undo                 events_registrations UPDATE                     events_reg_scoped_update (fn_is_event_incharge)    ADMITS-INCHARGE
// qr            generate passes                 POST /api/events/marathon/:id/qr/generate       canGenerateEventQr → canManageEventOps             ADMITS-INCHARGE
// qr            TournamentQrLinks               none (links only)                               —                                                  read-only
// volunteers    check in / out / remove         event_volunteer_checkins ALL                    marathon_volunteers_auth_all USING (true)          OPEN
// incidents     log / resolve / delete          event_incidents ALL                             event_incidents_event_team_write                   ADMITS-INCHARGE
// certificates  generate                        marathon_results UPDATE                         marathon_results_auth_all USING (true)             OPEN
// bulk-import   import roster                   POST /api/events/marathon/:id/bulk-register     getUser() only, then SERVICE-ROLE insert           OPEN
// analytics     —                               none                                            —                                                  read-only
// kit           mark collected                  events_registrations UPDATE                     events_reg_scoped_update (fn_is_event_incharge)    ADMITS-INCHARGE
// messages      send                            server action                                   fn_can_manage_event_messages (ignores canManage)   own gate
//
// No board writes the events row (no .from('events') write in any board's
// hook, service or route). So every board keeps the single canManage flag; no
// per-board flag exists. If a future board is EDITOR-ONLY or EVENTS-ROW, add
// one and feed that board canEdit — the test in
// __tests__/events/event-incharge-sees-logistics.test.ts refuses either class
// while no such flag exists, and refuses any tab missing from this map.
export type InchargeWriteClass =
  | 'admits-incharge'
  | 'open'
  | 'permission'
  | 'read-only'
  | 'own-gate'
  | 'editor-only'
  | 'events-row';

/** Per-tab summary of the audit above : every class its controls fall into. */
export const LOGISTICS_INCHARGE_WRITE_AUDIT: Record<string, InchargeWriteClass[]> = {
  registrations: ['admits-incharge', 'read-only'],
  sponsors: ['admits-incharge'],
  budget: ['admits-incharge', 'open', 'permission'],
  committees: ['admits-incharge'],
  checkin: ['admits-incharge'],
  qr: ['admits-incharge', 'read-only'],
  volunteers: ['open'],
  incidents: ['admits-incharge'],
  certificates: ['open'],
  'bulk-import': ['open'],
  analytics: ['read-only'],
  kit: ['admits-incharge'],
  messages: ['own-gate'],
};

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
 * Tabs that are shown even when `enabledTools` names a narrower set.
 *
 * `registrations` — the event's primary record. An event whose registrations
 * you cannot reach is not a console.
 *
 * `messages` — the organiser's only way to tell registrants anything. It is
 * NOT opt-in, and cannot be, for a reason worth stating: `enabled_tools` is
 * written once by the create wizard and never edited afterwards (the edit
 * dialog merges `config` without touching it, and EVENT_TOOL_KEYS in
 * types/events-presets.ts does not list `messages` at all, so no picker can
 * add it). A selection saved before this tab existed therefore cannot name it,
 * and no operator anywhere in the product can turn it on. Left to opt in, the
 * tab would be permanently invisible on every event that chose its tools —
 * built, wired, and unreachable, which is the failure mode this codebase keeps
 * repeating. Opt-out is not offered because "we could not tell the registrants"
 * is never the better default.
 */
const ALWAYS_ON_TAB_KEYS = ['registrations', 'messages'] as const;

function tabVisible(
  tab: EventLogisticsTab,
  eventType: string,
  enabledTools: string[] | null | undefined,
  canManage: boolean,
  hideSensitiveWithoutManage: boolean,
): boolean {
  if (tab.eventTypes !== 'all' && !tab.eventTypes.includes(eventType)) return false;
  if (tab.excludeEventTypes?.includes(eventType)) return false;

  if (
    hideSensitiveWithoutManage &&
    !canManage &&
    (SENSITIVE_TAB_KEYS as readonly string[]).includes(tab.key)
  ) {
    return false;
  }

  // An ABSENT or EMPTY selection means "every tool" — events created before the
  // tools picker existed have no key at all, and writing [] to mean "none" would
  // silently blank the console for them. This is the path EVERY event in
  // production takes today (55 of 55 carry no enabled_tools), so it is the
  // behaviour everyone currently depends on: it must not change.
  if (!enabledTools?.length) return true;

  // BOTH halves of this line were changed by concurrent PRs, and the resolution
  // keeps both. #3699 widened the always-on set (Messages joined Registrations);
  // this PR changed what a saved selection is compared AGAINST — the tab's TOOL
  // key rather than its own key, because Check-in and QR Passes share the
  // wizard's single "Check-in & QR Passes" entry.
  //
  // Dropping either half is a silent regression, and each has its own failing
  // assertion in __tests__/events/event-logistics-tool-keys.test.ts: lose the
  // first and `messages` becomes unreachable, lose the second and `check-in`
  // goes back to being a dead checkbox.
  return (
    (ALWAYS_ON_TAB_KEYS as readonly string[]).includes(tab.key) ||
    enabledTools.includes(toolKeyFor(tab))
  );
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
