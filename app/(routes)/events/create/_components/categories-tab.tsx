'use client';

// Categories tab — the entry classes people register into (`event_categories`).
//
// This is the general-event counterpart of a tournament's divisions. A preset's
// `divisions` list used to be copied into `events.config` where nothing read it,
// so applying a preset with divisions produced no categories at all; here those
// labels arrive as editable rows that become real `event_categories`.
//
// COMPETITION FIELDS (Sport / Level / Competition format) render only for
// competition-shaped formats. They are deliberately not shown for a lecture or
// a convocation — asking a guest lecture for its sport and age band is noise.
// Today the tournament format routes to its own creator before reaching this
// tab, so the block is dormant; it is written and gated rather than omitted so
// that lifting that redirect needs no second edit here.

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JKKN_SPORTS, SPORT_LEVELS } from '@/types/health-sports';
import { DIVISION_GENDERS, TOURNAMENT_FORMATS } from '@/types/tournament';
import type { EventCategoryDraft, EventCreateForm } from './event-create-form';
import { emptyCategoryDraft } from './event-create-form';

export function CategoriesTab({
  form,
  set,
  showCompetitionFields,
  error,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  showCompetitionFields: boolean;
  error?: string;
}) {
  const rows = form.categories;

  const addRow = () => set('categories', [...rows, emptyCategoryDraft()]);

  const removeRow = (key: string) =>
    set('categories', rows.filter((r) => r.key !== key));

  const editRow = (
    key: string,
    field: keyof EventCategoryDraft,
    value: string,
  ) =>
    set(
      'categories',
      rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-sm font-semibold">Categories</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The classes people register into — &ldquo;Delegate&rdquo;,
            &ldquo;Student&rdquo;, &ldquo;U-19 Boys&rdquo;. Leave empty for a single
            open entry.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
          Add category
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No categories — everyone registers into one open entry at the event fee.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.key} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Category {i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`cat-name-${row.key}`} className="text-xs">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`cat-name-${row.key}`}
                    placeholder="e.g. Delegate"
                    value={row.name}
                    onChange={(e) => editRow(row.key, 'name', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cat-fee-${row.key}`} className="text-xs">
                    Fee (₹)
                  </Label>
                  <Input
                    id={`cat-fee-${row.key}`}
                    type="number"
                    min={0}
                    placeholder={form.entry_fee || '0'}
                    value={row.fee_amount}
                    onChange={(e) => editRow(row.key, 'fee_amount', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`cat-max-${row.key}`} className="text-xs">
                    Max people
                  </Label>
                  <Input
                    id={`cat-max-${row.key}`}
                    type="number"
                    min={0}
                    placeholder="—"
                    value={row.max_participants}
                    onChange={(e) => editRow(row.key, 'max_participants', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cat-minage-${row.key}`} className="text-xs">
                    Min age
                  </Label>
                  <Input
                    id={`cat-minage-${row.key}`}
                    type="number"
                    min={0}
                    placeholder="—"
                    value={row.min_age}
                    onChange={(e) => editRow(row.key, 'min_age', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cat-maxage-${row.key}`} className="text-xs">
                    Max age
                  </Label>
                  <Input
                    id={`cat-maxage-${row.key}`}
                    type="number"
                    min={0}
                    placeholder="—"
                    value={row.max_age}
                    onChange={(e) => editRow(row.key, 'max_age', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={row.gender || '__any'}
                    onValueChange={(v) => editRow(row.key, 'gender', v === '__any' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any">Anyone</SelectItem>
                      {DIVISION_GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {showCompetitionFields && (
                <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sport</Label>
                    <Select
                      value={row.sport || '__none'}
                      onValueChange={(v) => editRow(row.key, 'sport', v === '__none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Not a sport</SelectItem>
                        {JKKN_SPORTS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Level</Label>
                    <Select
                      value={row.level || '__none'}
                      onValueChange={(v) => editRow(row.key, 'level', v === '__none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Not set</SelectItem>
                        {SPORT_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Competition format</Label>
                    <Select
                      value={row.competition_format || '__none'}
                      onValueChange={(v) =>
                        editRow(row.key, 'competition_format', v === '__none' ? '' : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Not set</SelectItem>
                        {TOURNAMENT_FORMATS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
