'use client';

// Host Institution(s) for a tournament (2026-10-01). A tournament may be hosted
// jointly by several colleges. The PRIMARY host stays events.institution_id —
// fees settle into its payment account and it issues the event number — while
// every picked host lands in events.host_institution_ids, which grants each of
// them host visibility (migration 20270522090000).

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface HostInstitutionsValue {
  /** events.institution_id — fee account + event number. Always one of hostIds. */
  primaryId: string;
  /** Every host, primary included. */
  hostIds: string[];
}

/**
 * DTO fields for a create/update call. A single host stores no list, and the
 * column is only SENT when there is a list to write or one to clear — so a
 * single-host save keeps working even before migration 20270522090000 lands.
 */
export function hostInstitutionsDto(v: HostInstitutionsValue, hadList = false) {
  const multi = v.hostIds.length > 1;
  return {
    institution_id: v.primaryId,
    ...(multi ? { host_institution_ids: v.hostIds } : hadList ? { host_institution_ids: null } : {}),
  };
}

export function HostInstitutionsPicker({
  institutions,
  loading,
  value,
  onChange,
  primaryLocked = false,
  primaryLockedHint,
  hideSingleHostHint = false,
  id = 'host_institutions',
}: {
  institutions: { id: string; name: string }[];
  loading?: boolean;
  value: HostInstitutionsValue;
  onChange: (next: HostInstitutionsValue) => void;
  /** The primary host can't change (event left draft) — co-hosts still can. */
  primaryLocked?: boolean;
  primaryLockedHint?: React.ReactNode;
  /** The caller renders its own fee/number hint for a single host. */
  hideSingleHostHint?: boolean;
  id?: string;
}) {
  const { primaryId, hostIds } = value;

  const toggle = (instId: string, checked: boolean) => {
    if (!checked && instId === primaryId && primaryLocked) return;
    // Keep the catalog order so the list reads the same every time. Hosts the
    // current user can't see (outside their institution access) are kept as-is
    // rather than silently dropped on save.
    const catalogIds = institutions.map((i) => i.id);
    const unseen = hostIds.filter((i) => !catalogIds.includes(i));
    const nextIds = [
      ...unseen,
      ...catalogIds.filter((i) => (i === instId ? checked : hostIds.includes(i))),
    ];
    const nextPrimary = nextIds.includes(primaryId) ? primaryId : nextIds[0] ?? '';
    onChange({ primaryId: nextPrimary, hostIds: nextIds });
  };

  const picked = institutions.filter((i) => hostIds.includes(i.id));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        Host Institution(s) <span className="text-destructive">*</span>
      </Label>
      <div id={id} className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border p-2">
        {loading && institutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading institutions…</p>
        ) : (
          institutions.map((inst) => {
            const isPrimary = inst.id === primaryId;
            return (
              <label key={inst.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={hostIds.includes(inst.id)}
                  disabled={isPrimary && primaryLocked}
                  onCheckedChange={(c) => toggle(inst.id, c === true)}
                />
                <span className="leading-tight">{inst.name}</span>
                {isPrimary && hostIds.length > 1 && (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    Primary
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>

      {hostIds.length === 0 ? (
        <p className="text-xs text-destructive">Pick at least one host institution.</p>
      ) : hostIds.length === 1 ? (
        hideSingleHostHint ? null : <p className="text-xs text-muted-foreground">
          Registration fees for this tournament settle into this institution&apos;s payment account.
        </p>
      ) : (
        <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
          <Label className="text-xs">Primary host — fees settle into its payment account</Label>
          <Select
            value={primaryId}
            disabled={primaryLocked}
            onValueChange={(v) => onChange({ primaryId: v, hostIds })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {picked.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {hostIds.length} hosts — every host college can see and follow this tournament.
          </p>
        </div>
      )}
      {primaryLocked && primaryLockedHint}
    </div>
  );
}
