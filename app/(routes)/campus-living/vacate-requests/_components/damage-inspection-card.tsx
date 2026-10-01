'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Hammer, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDamageTypes } from '@/hooks/campus-living/use-damage-types';
import { useSetVacateDamages } from '@/hooks/campus-living/use-hostel-vacate';
import type { HostelVacateDamage } from '@/types/hostel-vacate';
import { formatInr } from './bills-card';

interface Line {
  key: string;
  damage_type_id: string;
  amount: string;
  note: string;
}

let lineSeq = 0;
const newLine = (over?: Partial<Line>): Line => ({
  key: `l${++lineSeq}`,
  damage_type_id: '',
  amount: '',
  note: '',
  ...over,
});

/**
 * Warden's room inspection. The warden must take an explicit decision before
 * approving: record one or more damages (type + editable amount), or confirm
 * "No damage". The total becomes the fine bill raised at CAO approval.
 */
export function DamageInspectionCard({
  requestId,
  damages,
  roomInspected,
  damageTotal,
  canEdit,
}: {
  requestId: string;
  damages: HostelVacateDamage[];
  roomInspected: boolean;
  damageTotal: number;
  canEdit: boolean;
}) {
  const { data: types = [] } = useDamageTypes();
  const save = useSetVacateDamages();

  const [noDamage, setNoDamage] = useState(roomInspected && damages.length === 0);
  const [lines, setLines] = useState<Line[]>(() =>
    damages.map((d) =>
      newLine({ damage_type_id: d.damage_type_id ?? '', amount: String(d.amount), note: d.note ?? '' }),
    ),
  );

  const activeTypes = types.filter((t) => t.is_active);
  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const linesValid = lines.every((l) => l.damage_type_id && Number(l.amount) > 0);
  const canSave = noDamage ? lines.length === 0 : lines.length > 0 && linesValid;

  function pickType(key: string, typeId: string) {
    const type = types.find((t) => t.id === typeId);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, damage_type_id: typeId, amount: l.amount || String(type?.default_amount ?? '') }
          : l,
      ),
    );
  }

  function patch(key: string, change: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function toggleNoDamage(checked: boolean) {
    setNoDamage(checked);
    if (checked) setLines([]);
  }

  function submit() {
    save.mutate({
      requestId,
      noDamage,
      lines: noDamage
        ? []
        : lines.map((l) => ({
            damage_type_id: l.damage_type_id,
            amount: Number(l.amount),
            note: l.note.trim() || null,
          })),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base flex items-center gap-2'>
          <Hammer className='h-4 w-4' />
          Step 3 · Room Inspection
        </CardTitle>
        <CardDescription>
          {canEdit
            ? 'Check the room for damage. Pick each damage type and confirm the amount; the total is billed as a fine when the CAO approves. If the room is fine, tick “No damage”.'
            : 'Room condition recorded by the warden.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {!canEdit ? (
          !roomInspected ? (
            <p className='text-sm text-muted-foreground'>The room has not been inspected yet.</p>
          ) : damages.length === 0 ? (
            <p className='text-sm text-green-700'>No damage recorded.</p>
          ) : (
            <>
              {damages.map((d) => (
                <div key={d.id} className='flex items-start justify-between gap-3 rounded-md border p-3'>
                  <div className='min-w-0'>
                    <p className='text-sm font-medium'>{d.damage_name}</p>
                    {d.note && <p className='text-xs text-muted-foreground'>{d.note}</p>}
                  </div>
                  <span className='text-sm font-medium'>{formatInr(d.amount)}</span>
                </div>
              ))}
              <div className='flex justify-between border-t pt-2 text-sm font-semibold'>
                <span>Total fine</span>
                <span>{formatInr(damageTotal)}</span>
              </div>
            </>
          )
        ) : (
          <>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox checked={noDamage} onCheckedChange={(v) => toggleNoDamage(!!v)} />
              No damage — the room is in good condition
            </label>

            {!noDamage && (
              <div className='space-y-2'>
                {lines.map((l) => (
                  <div key={l.key} className='grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[1fr_120px_auto]'>
                    <Select value={l.damage_type_id} onValueChange={(v) => pickType(l.key, v)}>
                      <SelectTrigger>
                        <SelectValue placeholder='Damage type' />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type='number'
                      min={0}
                      step='0.01'
                      inputMode='decimal'
                      value={l.amount}
                      onChange={(e) => patch(l.key, { amount: e.target.value })}
                      placeholder='Amount ₹'
                      aria-label='Damage amount'
                    />
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      aria-label='Remove damage'
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                    <Input
                      value={l.note}
                      onChange={(e) => patch(l.key, { note: e.target.value })}
                      placeholder='Note (optional) — what exactly is damaged'
                      className='sm:col-span-3 text-xs'
                    />
                  </div>
                ))}
                <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                  <Button type='button' size='sm' variant='outline' onClick={() => setLines((p) => [...p, newLine()])}>
                    <Plus className='mr-2 h-4 w-4' />
                    Add damage
                  </Button>
                  <Link
                    href='/campus-living/settings/damage-types'
                    className='text-xs text-muted-foreground underline-offset-2 hover:underline'
                  >
                    Damage type missing? Add or edit types
                  </Link>
                </div>
                {lines.length > 0 && (
                  <div className='flex justify-between border-t pt-2 text-sm font-semibold'>
                    <span>Total fine</span>
                    <span>{formatInr(total)}</span>
                  </div>
                )}
              </div>
            )}

            <Button onClick={submit} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {roomInspected ? 'Update inspection' : 'Save inspection'}
            </Button>
            {!roomInspected && (
              <p className='text-xs text-amber-700'>Save the inspection before approving this step.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
