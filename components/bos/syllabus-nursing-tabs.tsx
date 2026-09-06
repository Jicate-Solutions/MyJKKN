'use client';

// Nursing (CNR / INC B.Sc Nursing, TNMGRMU) syllabus editors — the tabs that
// replace the Anna CO-PO/Pedagogy sections for the inc_nursing academic model.
// Kept in a separate file so the 3,900-line syllabus-form.tsx only needs thin
// wiring. All cards are controlled (value + onChange, no internal state), so
// they slot straight into the parent form's formData / updateField flow.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import type {
  BosNursingWorkload,
  BosNursingWorkloadPart,
  BosClinicalOutlineData,
  BosClinicalOutlineUnit,
  BosPracticumSkill,
  BosCompetencyMappingsData,
  BosCoreCompetency,
  BosCompetencyMapping,
} from '@/types/bos';

// lines <-> string[] helpers (arrays edited as one-per-line textareas)
const toLines = (a?: string[]) => (a && a.length ? a.join('\n') : '');
const fromLines = (s: string) =>
  s.split('\n').map((x) => x.trim()).filter(Boolean);
const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// ── Workload (Theory / Lab-Skill-Lab / Clinical credits + hours + weeks) ──
export function NursingWorkloadCard({
  value,
  onChange,
}: {
  value?: BosNursingWorkload;
  onChange: (v: BosNursingWorkload) => void;
}) {
  const wl: BosNursingWorkload = value ?? {};
  const part = (k: 'theory' | 'practical' | 'clinical'): BosNursingWorkloadPart =>
    wl[k] ?? {};
  const setPart = (k: 'theory' | 'practical' | 'clinical', p: Partial<BosNursingWorkloadPart>) =>
    onChange({ ...wl, [k]: { ...part(k), ...p } });

  const Row = ({ k, label, weeks }: { k: 'theory' | 'practical' | 'clinical'; label: string; weeks?: boolean }) => {
    const p = part(k);
    return (
      <div className="grid grid-cols-4 items-end gap-2">
        <div className="text-sm font-medium">{label}</div>
        <div>
          <label className="text-xs text-muted-foreground">Credits</label>
          <Input inputMode="numeric" value={p.credits ?? ''}
            onChange={(e) => setPart(k, { credits: numOrNull(e.target.value) })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Hours</label>
          <Input inputMode="numeric" value={p.hours ?? ''}
            onChange={(e) => setPart(k, { hours: numOrNull(e.target.value) })} />
        </div>
        {weeks ? (
          <div>
            <label className="text-xs text-muted-foreground">Weeks</label>
            <Input inputMode="numeric" value={p.weeks ?? ''}
              onChange={(e) => setPart(k, { weeks: numOrNull(e.target.value) })} />
          </div>
        ) : <div />}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workload</CardTitle>
        <CardDescription>
          INC records credits and per-semester contact hours split across Theory,
          Lab/Skill-Lab, and Clinical (clinical also in weeks).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row k="theory" label="Theory" />
        <Row k="practical" label="Lab / Skill-Lab" />
        <Row k="clinical" label="Clinical" weeks />
      </CardContent>
    </Card>
  );
}

// ── Clinical outline + skill-lab practicum ───────────────────────────────
export function NursingClinicalOutlineCard({
  value,
  onChange,
}: {
  value?: BosClinicalOutlineData;
  onChange: (v: BosClinicalOutlineData) => void;
}) {
  const data: BosClinicalOutlineData = value ?? {};
  const units: BosClinicalOutlineUnit[] = data.units ?? [];
  const skills: BosPracticumSkill[] = data.practicum_skills ?? [];

  const setUnit = (i: number, p: Partial<BosClinicalOutlineUnit>) =>
    onChange({ ...data, units: units.map((u, idx) => (idx === i ? { ...u, ...p } : u)) });
  const addUnit = () =>
    onChange({ ...data, units: [...units, { clinical_unit: '', duration_weeks: null }] });
  const delUnit = (i: number) =>
    onChange({ ...data, units: units.filter((_, idx) => idx !== i) });

  const setSkill = (i: number, p: Partial<BosPracticumSkill>) =>
    onChange({ ...data, practicum_skills: skills.map((s, idx) => (idx === i ? { ...s, ...p } : s)) });
  const addSkill = () =>
    onChange({ ...data, practicum_skills: [...skills, { sno: String(skills.length + 1), competency: '', mode: '' }] });
  const delSkill = (i: number) =>
    onChange({ ...data, practicum_skills: skills.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Skill-Lab Practicum</CardTitle>
          <CardDescription>Pre-clinical skill-lab competencies and their mode of teaching.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {skills.map((s, i) => (
            <div key={i} className="grid grid-cols-12 items-start gap-2">
              <Input className="col-span-1" value={s.sno ?? ''} placeholder="#"
                onChange={(e) => setSkill(i, { sno: e.target.value })} />
              <Input className="col-span-7" value={s.competency} placeholder="Competency"
                onChange={(e) => setSkill(i, { competency: e.target.value })} />
              <Input className="col-span-3" value={s.mode ?? ''} placeholder="Mode of teaching"
                onChange={(e) => setSkill(i, { mode: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" className="col-span-1"
                onClick={() => delSkill(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addSkill}>
            <Plus className="mr-1 h-4 w-4" /> Add skill
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clinical Outline</CardTitle>
          <CardDescription>
            Ward-wise clinical placement: duration, learning outcomes, procedural
            competencies, clinical requirements, and assessment methods (one item
            per line).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {units.map((u, i) => (
            <div key={i} className="rounded-md border p-3 space-y-2">
              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-7">
                  <label className="text-xs text-muted-foreground">Clinical unit / ward</label>
                  <Input value={u.clinical_unit ?? ''}
                    onChange={(e) => setUnit(i, { clinical_unit: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">Duration (weeks)</label>
                  <Input inputMode="numeric" value={u.duration_weeks ?? ''}
                    onChange={(e) => setUnit(i, { duration_weeks: numOrNull(e.target.value) })} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="col-span-2"
                  onClick={() => delUnit(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Learning outcomes</label>
                  <Textarea rows={3} value={toLines(u.learning_outcomes)}
                    onChange={(e) => setUnit(i, { learning_outcomes: fromLines(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Procedural competencies / clinical skills</label>
                  <Textarea rows={3} value={toLines(u.procedural_competencies)}
                    onChange={(e) => setUnit(i, { procedural_competencies: fromLines(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Clinical requirements</label>
                  <Textarea rows={3} value={toLines(u.clinical_requirements)}
                    onChange={(e) => setUnit(i, { clinical_requirements: fromLines(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Assessment methods</label>
                  <Textarea rows={3} value={toLines(u.assessment_methods)}
                    onChange={(e) => setUnit(i, { assessment_methods: fromLines(e.target.value) })} />
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addUnit}>
            <Plus className="mr-1 h-4 w-4" /> Add clinical unit
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Competency mapping (CO → 10 INC core competencies) ───────────────────
export function NursingCompetencyMappingCard({
  value,
  onChange,
  coIds,
}: {
  value?: BosCompetencyMappingsData;
  onChange: (v: BosCompetencyMappingsData) => void;
  /** CO ids from the Competencies (CLO) tab, so each can be mapped. */
  coIds: string[];
}) {
  const data: BosCompetencyMappingsData = value ?? {};
  const core: BosCoreCompetency[] = data.core_competencies ?? [];
  const mappings: BosCompetencyMapping[] = data.mappings ?? [];

  const setCore = (i: number, label: string) =>
    onChange({ ...data, core_competencies: core.map((c, idx) => (idx === i ? { ...c, label } : c)) });
  const addCore = () =>
    onChange({ ...data, core_competencies: [...core, { id: core.length + 1, label: '' }] });
  const delCore = (i: number) =>
    onChange({ ...data, core_competencies: core.filter((_, idx) => idx !== i) });

  const mapFor = (co: string) => mappings.find((m) => m.co_id === co)?.competencies ?? [];
  const setMap = (co: string, csv: string) => {
    const ids = csv.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
    const others = mappings.filter((m) => m.co_id !== co);
    onChange({ ...data, mappings: [...others, { co_id: co, competencies: ids }] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Core Competencies (INC 10)</CardTitle>
          <CardDescription>The 10 NLN / Nurse-of-the-Future core competencies this program maps to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {core.map((c, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <div className="col-span-1 text-center text-sm text-muted-foreground">{c.id}</div>
              <Input className="col-span-10" value={c.label}
                onChange={(e) => setCore(i, e.target.value)} />
              <Button type="button" variant="ghost" size="icon" className="col-span-1"
                onClick={() => delCore(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addCore}>
            <Plus className="mr-1 h-4 w-4" /> Add core competency
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CO → Core Competency Mapping</CardTitle>
          <CardDescription>
            For each Competency/CO, list the core-competency IDs it maps to
            (comma-separated, e.g. &quot;1, 2, 8&quot;). INC maps at program level;
            leave blank if not mapped per-CO.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {coIds.length === 0 && (
            <p className="text-sm text-muted-foreground">Add Competencies on the Competencies tab first.</p>
          )}
          {coIds.map((co) => (
            <div key={co} className="grid grid-cols-12 items-center gap-2">
              <div className="col-span-2 text-sm font-medium">{co}</div>
              <Input className="col-span-10" placeholder="1, 2, 8"
                value={mapFor(co).join(', ')}
                onChange={(e) => setMap(co, e.target.value)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
