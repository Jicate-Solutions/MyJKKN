'use client';

// ============================================================================
// ROOM SHARING — the deadlines and scope behind empty-bed settlement
// ============================================================================
// Created 2026-08-13.
//
// A learner alone in a 4-bed Premium room carries three empty beds. The engine
// that bills her for them, and the countdown she gets to fill them instead, were
// configured only by hand-written SQL — so a five-day window nobody could see
// had never been reviewed by anyone who would have to defend it to a parent.
//
// This tab surfaces those numbers next to the fee they modify. Each control
// states its consequence in a sentence, following the Director's-view rule
// established on /campus-living/premium/allocation-rules: never raw JSON.
//
// THE MASTER SWITCH IS SHOWN, NOT OFFERED. Arming settle-then-bill starts
// billing families on a timer and is a Director decision taken after reading the
// practice run. It is rendered as state with a link to that run, and there is no
// writer for it in settle-policy-service.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Info, Loader2, ShieldAlert, ExternalLink } from 'lucide-react';
import {
  useSettleCategoryScope,
  useSettlePolicies,
  useSetSettleCategoryScope,
  useUpdateSettlePolicy,
} from '@/hooks/campus-living/use-settle-policies';
import { SETTLE_POLICY_KEYS } from '@/lib/services/campus-living/settle-policy-service';
import { HOSTEL_CATEGORY_TYPE_LABELS } from '@/types/hostel-categories';
import type { SettlePolicyKey } from '@/lib/services/campus-living/settle-policy-service';

interface Props {
  canEdit: boolean;
}

// ── One numeric setting, with the sentence that says what it does ───────────
function NumberSetting({
  title,
  consequence,
  policyKey,
  value,
  unit,
  min,
  max,
  canEdit,
  onSave,
  saving,
}: {
  title: string;
  consequence: string;
  policyKey: SettlePolicyKey;
  value: number;
  unit: string;
  min: number;
  max: number;
  canEdit: boolean;
  onSave: (key: SettlePolicyKey, v: number) => void;
  saving: boolean;
}) {
  // Seeded once from the saved value. The parent remounts this via `key` when
  // the server value changes after a save, so there is no state to sync back —
  // which is why there is no effect here. `value` is stable while she types.
  const [draft, setDraft] = useState<string>(String(value));

  const parsed = Number(draft);
  const valid = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= min && parsed <= max;
  const dirty = valid && parsed !== value;

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-xl">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{consequence}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {policyKey}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          disabled={!canEdit || saving}
          onChange={(e) => setDraft(e.target.value)}
          className="w-24 tabular-nums"
          aria-label={title}
        />
        <span className="w-12 text-sm text-muted-foreground">{unit}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit || !dirty || saving}
          onClick={() => onSave(policyKey, parsed)}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function RoomSharingSection({ canEdit }: Props) {
  const { data: policies, isLoading } = useSettlePolicies();
  const { data: categories, isLoading: categoriesLoading } = useSettleCategoryScope();
  const updatePolicy = useUpdateSettlePolicy();
  const setScope = useSetSettleCategoryScope();

  const save = (key: SettlePolicyKey, value: number | boolean) =>
    updatePolicy.mutate({ key, value });

  if (isLoading || !policies) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const inScope = (categories ?? []).filter((c) => c.settle_billing_enabled);
  const roomsInScope = inScope.reduce((n, c) => n + c.under_filled_rooms, 0);

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        A room&apos;s cost is shared by the people living in it, so a learner alone in a
        four-bed room carries three empty beds. These settings decide how long she has to
        invite someone before those beds are billed to her — and which categories that
        applies to at all.
      </p>

      {/* ── Master switch: state, not a control ───────────────────────────── */}
      <Alert variant={policies.masterEnabled ? 'default' : undefined}>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          Empty-bed billing is{' '}
          {policies.masterEnabled ? (
            <Badge variant="destructive">ON — rooms are being billed</Badge>
          ) : (
            <Badge variant="outline">OFF — nothing is billed</Badge>
          )}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Everything below is configured whether this is on or off, and takes effect the
            moment it is switched on. Turning it on starts billing at settled occupancy on a
            timer, so it is deliberately not a control on this screen — read the practice run
            first and have it switched on for you.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/campus-living/settle-preview">
              <ExternalLink className="mr-2 h-4 w-4" />
              See what would be billed
            </Link>
          </Button>
        </AlertDescription>
      </Alert>

      {/* ── Deadlines ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deadlines</CardTitle>
          <CardDescription>
            The countdown starts when the first learner moves into a room and restarts every
            time someone new joins, so a room that is actively filling is never billed
            mid-fill.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <NumberSetting
            key={`window-${policies.windowDays}`}
            title="Settle window"
            consequence="Days a room waits after the last learner joined before its empty beds are billed. Each new joiner restarts this countdown."
            policyKey={SETTLE_POLICY_KEYS.WINDOW_DAYS}
            value={policies.windowDays}
            unit="days"
            min={0}
            max={180}
            canEdit={canEdit}
            onSave={save}
            saving={updatePolicy.isPending}
          />
          <NumberSetting
            key={`outer-${policies.outerLimitDays}`}
            title="Hard outer limit"
            consequence="Measured from when the room first filled a bed. Restarts can never push the deadline past it, so a slowly-filling room still gets billed."
            policyKey={SETTLE_POLICY_KEYS.OUTER_LIMIT_DAYS}
            value={policies.outerLimitDays}
            unit="days"
            min={0}
            max={365}
            canEdit={canEdit}
            onSave={save}
            saving={updatePolicy.isPending}
          />
          <NumberSetting
            key={`due-${policies.billDueDays}`}
            title="Bill due in"
            consequence="Days from the window closing to the due date on the empty-bed bills it raises."
            policyKey={SETTLE_POLICY_KEYS.BILL_DUE_DAYS}
            value={policies.billDueDays}
            unit="days"
            min={0}
            max={180}
            canEdit={canEdit}
            onSave={save}
            saving={updatePolicy.isPending}
          />
          <NumberSetting
            key={`consent-${policies.buyoutConsentHours}`}
            title="Roommates have to agree within"
            consequence="When a learner asks to take her whole room, every roommate must agree inside this window or the request lapses. A learner living alone never waits."
            policyKey={SETTLE_POLICY_KEYS.BUYOUT_CONSENT_HOURS}
            value={policies.buyoutConsentHours}
            unit="hours"
            min={1}
            max={720}
            canEdit={canEdit}
            onSave={save}
            saving={updatePolicy.isPending}
          />
          {policies.outerLimitDays < policies.windowDays ? (
            <Alert variant="destructive" className="mt-4">
              <Info className="h-4 w-4" />
              <AlertTitle>The outer limit is shorter than the window</AlertTitle>
              <AlertDescription>
                Every room will be billed at the outer limit and the settle window will never
                have an effect. Set the outer limit longer than the window.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Telling the learner ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telling the learner</CardTitle>
          <CardDescription>
            Notices move no money. They can safely be switched on before billing is, so
            residents get the chance to fill their rooms first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 sm:max-w-xl">
              <Label htmlFor="noticeEnabled" className="font-medium">
                Send empty-bed notices
              </Label>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tells each resident of an under-filled room how many beds are empty, what her
                share is now, what it would be if the room filled, and the date she has until.
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
                {SETTLE_POLICY_KEYS.NOTICE_ENABLED}
              </p>
            </div>
            <Switch
              id="noticeEnabled"
              checked={policies.noticeEnabled}
              disabled={!canEdit || updatePolicy.isPending}
              onCheckedChange={(v) => save(SETTLE_POLICY_KEYS.NOTICE_ENABLED, v)}
            />
          </div>

          <NumberSetting
            key={`notice-${policies.noticeIntervalDays}`}
            title="Wait between reminders"
            consequence="Least number of days before the same learner is told about the same room again."
            policyKey={SETTLE_POLICY_KEYS.NOTICE_INTERVAL_DAYS}
            value={policies.noticeIntervalDays}
            unit="days"
            min={1}
            max={90}
            canEdit={canEdit}
            onSave={save}
            saving={updatePolicy.isPending}
          />
        </CardContent>
      </Card>

      {/* ── Scope ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which categories this applies to</CardTitle>
          <CardDescription>
            Only ticked categories open a settle window or can be billed for empty beds.
            {inScope.length > 0 ? (
              <>
                {' '}
                Right now {roomsInScope} room{roomsInScope === 1 ? '' : 's'} in scope
                {roomsInScope > 0 ? ' hold at least one empty bed' : ''}.
              </>
            ) : (
              ' Nothing is in scope, so nothing can be billed.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoriesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Hostel type</TableHead>
                    <TableHead className="text-right">Under-filled rooms</TableHead>
                    <TableHead className="text-right">In scope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(categories ?? []).map((c) => (
                    <TableRow key={c.id} className={c.is_active ? undefined : 'opacity-60'}>
                      <TableCell className="font-medium">
                        {c.name}
                        {!c.is_active ? (
                          <Badge variant="outline" className="ml-2">
                            Inactive
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {HOSTEL_CATEGORY_TYPE_LABELS[
                            c.type as keyof typeof HOSTEL_CATEGORY_TYPE_LABELS
                          ] ?? c.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.under_filled_rooms}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={c.settle_billing_enabled}
                          disabled={!canEdit || setScope.isPending}
                          onCheckedChange={(v) =>
                            setScope.mutate({ categoryId: c.id, enabled: v })
                          }
                          aria-label={`Empty-bed settlement for ${c.name} (${c.type})`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
