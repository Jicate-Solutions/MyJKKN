'use client';

/**
 * Import wizard step 2 — link unmapped enrolment codes to staff.
 * Created: 2026-08-06.
 *
 * Folded in from the former /hr/admin/biometric-mapping page: that page took
 * the SAME file for a different read of it, so HR had to upload once to map and
 * again to import. One upload, one place.
 *
 * The step only appears when the dry run found unmapped codes, and it is gated
 * on staff.edit — the permission that governs writing to the staff table. A
 * user who may import but not edit staff sees what is missing and who to ask,
 * rather than a control that would fail on save.
 */

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getErrorMessage } from '@/lib/utils';
import { useSaveBiometricMappings } from '@/hooks/hr/use-biometric-mapping';
import type { BiometricStaffOption, BiometricSuggestResponse } from '@/types/hr-biometric';

const STAFF_LIST_ID = 'biometric-wizard-staff-options';

function staffLabel(s: BiometricStaffOption): string {
  return `${s.full_name} · ${s.staff_id ?? 'no code'} · ${s.institution_name ?? 'no institution'}`;
}

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

  const labelToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suggestion.staff) if (!m.has(staffLabel(s))) m.set(staffLabel(s), s.id);
    return m;
  }, [suggestion.staff]);

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
        <Stat label="Enrolments in file" value={suggestion.counts.total} />
        <Stat label="Already linked" value={suggestion.counts.already_mapped} />
        <Stat label="Suggested" value={suggestion.counts.suggested} />
        <Stat label="Need attention" value={suggestion.counts.unresolved} warn={suggestion.counts.unresolved > 0} />
      </div>

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

      <datalist id={STAFF_LIST_ID}>
        {suggestion.staff.map((s) => <option key={s.id} value={staffLabel(s)} />)}
      </datalist>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name on machine</th>
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
                  <td className="px-3 py-2">
                    <Input
                      list={STAFF_LIST_ID}
                      className="w-full min-w-[280px]"
                      disabled={!canEdit}
                      defaultValue={picked ? staffLabel(picked) : ''}
                      placeholder="Search staff by name…"
                      onChange={(e) =>
                        setChoice((prev) => ({ ...prev, [r.code]: labelToId.get(e.target.value) ?? null }))
                      }
                      aria-label={`Staff for code ${r.code}`}
                    />
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {assigned} of {suggestion.rows.length} codes will be linked. Codes left blank are cleared,
          and their punches will not import.
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

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${warn ? 'text-amber-700' : ''}`}>{value}</p>
    </div>
  );
}
