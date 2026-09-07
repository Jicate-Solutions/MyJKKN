'use client';

/**
 * Import wizard step 2 — link unmapped enrolment codes to staff.
 * Created: 2026-08-06.
 *
 * Folded in from the former /hr/admin/biometric-mapping page: that page took
 * the SAME file for a different read of it, so HR had to upload once to map and
 * again to import. One upload, one place.
 *
 * Every row also reports whether the person exists in the MyJKKN staff table at
 * all. A biometric machine keeps every enrolment ever made, so a monthly export
 * carries people who left years ago; those rows are not "link them" work, they
 * are permanently unimportable, and lumping them into one "Need attention"
 * number sent HR hunting for staff records that were never going to be there.
 *
 * The step only appears when the dry run found unmapped codes, and it is gated
 * on staff.edit — the permission that governs writing to the staff table. A
 * user who may import but not edit staff sees what is missing and who to ask,
 * rather than a control that would fail on save.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronsUpDown, Loader2, Save, SkipForward, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getErrorMessage } from '@/lib/utils';
import { useSaveBiometricMappings } from '@/hooks/hr/use-biometric-mapping';
import { StaffPickerDialog, type StaffPickerTarget } from './staff-picker-dialog';
import type {
  BiometricMappingRow,
  BiometricStaffOption,
  BiometricSuggestResponse,
} from '@/types/hr-biometric';

interface Props {
  suggestion: BiometricSuggestResponse;
  /** False when the signed-in user lacks staff.edit. */
  canEdit: boolean;
  /** Called after a successful save so the wizard can re-run the dry run. */
  onSaved: () => void;
  /** Continue without mapping — those codes simply will not import. */
  onSkip: () => void;
}

export function LinkCodesStep({ suggestion, canEdit, onSaved, onSkip }: Props) {
  const save = useSaveBiometricMappings();

  const [choice, setChoice] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    for (const r of suggestion.rows) initial[r.code] = r.mapped_staff_id ?? r.suggested_staff_id ?? null;
    return initial;
  });

  const [picker, setPicker] = useState<StaffPickerTarget | null>(null);

  const staffById = useMemo(() => {
    const m = new Map<string, BiometricStaffOption>();
    for (const s of suggestion.staff) m.set(s.id, s);
    return m;
  }, [suggestion.staff]);

  // The DB rejects two staff sharing a code on one machine; catch it here so the
  // user sees which rows clash instead of a raw 23505.
  const duplicates = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const [code, staffId] of Object.entries(choice)) {
      if (!staffId) continue;
      const list = seen.get(staffId);
      if (list) list.push(code);
      else seen.set(staffId, [code]);
    }
    return [...seen.entries()].filter(([, codes]) => codes.length > 1);
  }, [choice]);

  const assigned = useMemo(() => Object.values(choice).filter(Boolean).length, [choice]);

  const c = suggestion.counts;
  /** People who ARE in MyJKKN and still have no code stored — the actual queue. */
  const toLink = c.in_myjkkn - c.already_mapped;
  /**
   * staff id -> the code already claiming them, minus the row being edited, so
   * the picker can warn before the save-time duplicate guard has to.
   */
  const assignedElsewhere = useMemo(() => {
    const m = new Map<string, string>();
    for (const [code, staffId] of Object.entries(choice)) {
      if (staffId && code !== picker?.code) m.set(staffId, code);
    }
    return m;
  }, [choice, picker]);

  const notInMyjkkn = useMemo(
    () => suggestion.rows.filter((r) => r.identity === 'not_in_myjkkn'),
    [suggestion.rows],
  );

  const handleSave = useCallback(async () => {
    try {
      const saved = await save.mutateAsync({
        institutionId: suggestion.institution.id,
        assignments: suggestion.rows.map((r) => ({ code: r.code, staffId: choice[r.code] ?? null })),
      });
      toast.success(`Linked ${saved} code(s)`);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [save, suggestion, choice, onSaved]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enrolments in file" value={c.total} />
        <Stat label="In MyJKKN team" value={c.in_myjkkn} good={c.in_myjkkn > 0} />
        <Stat label="Not in MyJKKN" value={c.not_in_myjkkn} warn={c.not_in_myjkkn > 0} />
        <Stat label="MyJKKN team roster" value={suggestion.roster.total} hint={`${suggestion.roster.active} active`} />
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>{c.in_myjkkn}</strong> of the <strong>{c.total}</strong> enrolments in this file
        belong to someone who exists in the MyJKKN team member table — that is the ceiling on what
        this import can ever write. The other <strong>{c.not_in_myjkkn}</strong> are enrolments the
        machine still holds for people with no MyJKKN team member record; re-uploading will not
        change that. Identity is decided by the enrolment code first and, only when no code is
        stored, by comparing the machine&rsquo;s name to the team roster — so a &ldquo;Not in
        MyJKKN&rdquo; row can still be linked by hand if you recognise the person.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Already linked" value={c.already_mapped} />
        <Stat label="Suggested by name" value={c.suggested} />
        <Stat label="Shared name — pick manually" value={c.ambiguous} warn={c.ambiguous > 0} />
        <Stat label="Still to link" value={toLink} warn={toLink > 0} />
      </div>

      {c.not_in_myjkkn > 0 && (
        <details className="rounded-md border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            <UserX className="mr-1 inline h-4 w-4 text-amber-700" />
            {c.not_in_myjkkn} enrolment(s) have no MyJKKN team member record
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {notInMyjkkn.map((r) => (
              <li key={r.code}>
                <span className="font-mono">{r.code}</span> · {r.device_name || '(no name on machine)'}
              </li>
            ))}
          </ul>
        </details>
      )}

      {c.inactive_staff > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {c.inactive_staff} enrolment(s) resolve to a team member record marked{' '}
            <strong>relieved</strong> (inactive). Their punches are <strong>not imported</strong> —
            since 2026-09-02 the import resolves active team members only, and these codes are
            reported as skipped rather than turned into attendance. Records imported while they were
            still active are left untouched. Clear the code on those team member records to stop
            them appearing here.
          </AlertDescription>
        </Alert>
      )}

      {!canEdit && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to edit staff records, so codes cannot be linked here. Ask an
            HR administrator to link them, then run this import again. Continuing now will import
            everyone already linked and skip the rest.
          </AlertDescription>
        </Alert>
      )}

      {suggestion.institution.matched_by !== 'code' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This machine was identified by <strong>{suggestion.institution.matched_by}</strong>, not
            by its code alone. Set Dept.&nbsp;Name on the machine to{' '}
            <strong>{suggestion.institution.code ?? 'the institution code'}</strong> so future files
            resolve unambiguously.
          </AlertDescription>
        </Alert>
      )}

      {duplicates.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {duplicates.length} staff member(s) are selected for more than one code
            ({duplicates.map(([, codes]) => codes.join(' & ')).join(', ')}). Each person can hold
            only one code per machine.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name on machine</th>
              <th className="px-3 py-2 font-medium">In MyJKKN</th>
              <th className="px-3 py-2 font-medium">Staff member</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {suggestion.rows.map((r) => {
              const picked = choice[r.code] ? staffById.get(choice[r.code]!) : null;
              return (
                <tr key={r.code} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2">{r.device_name || '—'}</td>
                  <td className="px-3 py-2"><IdentityCell row={r} pickedManually={Boolean(picked)} /></td>
                  <td className="px-3 py-2">
                    <Button
                      variant="outline"
                      disabled={!canEdit}
                      onClick={() => setPicker({ code: r.code, deviceName: r.device_name, value: choice[r.code] ?? null })}
                      className="h-auto w-full min-w-[260px] justify-between gap-2 py-1.5 text-left font-normal"
                      aria-label={`Choose team member for code ${r.code}`}
                    >
                      <span className="min-w-0 flex-1">
                        {picked ? (
                          <>
                            <span className="block truncate">{picked.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[picked.staff_id ?? 'no team member code', picked.institution_name ?? 'no institution'].join(' · ')}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Search team members…</span>
                        )}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                    {picked?.is_active === false && (
                      <p className="mt-1 text-xs text-amber-700">
                        This team member record is relieved — their punches will not be imported.
                      </p>
                    )}
                    {picked?.other_machine && (
                      <p className="mt-1 text-xs text-amber-700">
                        Currently enrolled on another machine — saving moves them here.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.mapped_staff_id ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Linked</Badge>
                    ) : r.suggested_staff_id ? (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Suggested</Badge>
                    ) : (
                      <Badge variant="outline">Unresolved</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <StaffPickerDialog
        target={picker}
        onOpenChange={(open) => { if (!open) setPicker(null); }}
        staff={suggestion.staff}
        machineName={suggestion.institution.name}
        assignedElsewhere={assignedElsewhere}
        onSelect={(staffId) => {
          setChoice((prev) => ({ ...prev, [picker!.code]: staffId }));
          setPicker(null);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {assigned} of {suggestion.rows.length} codes will be linked. Codes left blank are cleared,
          and their punches will not import — including every &ldquo;No team member record&rdquo; row you
          leave alone.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSkip}>
            <SkipForward className="mr-2 h-4 w-4" />
            Continue without linking
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || save.isPending || duplicates.length > 0}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save links &amp; re-check
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, warn, good, hint,
}: { label: string; value: number; warn?: boolean; good?: boolean; hint?: string }) {
  const tone = warn ? 'text-amber-700' : good ? 'text-green-700' : '';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Identity, not link state. 'not_in_myjkkn' is what nothing in the roster
 * answers to this name — a manual pick overrides it, so say so rather than
 * leaving a red badge on a row the user just resolved.
 */
function IdentityCell({ row, pickedManually }: { row: BiometricMappingRow; pickedManually: boolean }) {
  const relieved = row.staff_is_active === false;

  let badge: ReactNode;
  if (row.identity === 'linked') {
    badge = <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Yes · by code</Badge>;
  } else if (row.identity === 'name_match') {
    badge = <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Yes · by name</Badge>;
  } else if (row.identity === 'ambiguous') {
    badge = (
      <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100">
        Yes · {row.name_candidates} share this name
      </Badge>
    );
  } else if (pickedManually) {
    badge = <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Yes · chosen by you</Badge>;
  } else {
    badge = <Badge variant="outline" className="border-amber-300 text-amber-800">No team member record</Badge>;
  }

  return (
    <div className="space-y-1">
      {badge}
      {relieved && (
        <p className="text-xs text-amber-700">Team member record is relieved — punches not imported</p>
      )}
    </div>
  );
}
