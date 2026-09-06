'use client';

// 4 sliders summing to 100% — but actually 5 OSCE domains.
// Spec line 302 says "domain weight sliders summing to 100%" + memory file shows 5 domains;
// keeping 5 to match Agent A schema (data_gathering, hypothesis_generation, management_planning,
// patient_communication, professionalism). Validation enforces sum=100.

import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { DomainWeights, OSCEDomain } from '@/types/pde';

const DOMAINS: { key: OSCEDomain; label: string; hint: string }[] = [
  { key: 'data_gathering', label: 'Data Gathering', hint: 'History-taking, examination, observation' },
  { key: 'hypothesis_generation', label: 'Hypothesis Generation', hint: 'Differential diagnosis, reasoning' },
  { key: 'management_planning', label: 'Management Planning', hint: 'Treatment, investigations, follow-up' },
  { key: 'patient_communication', label: 'Patient Communication', hint: 'Empathy, explanation, consent' },
  { key: 'professionalism', label: 'Professionalism', hint: 'Ethics, judgment, multidisciplinary liaison' },
];

interface Props {
  value: DomainWeights;
  onChange: (next: DomainWeights) => void;
}

export function DomainWeightSliders({ value, onChange }: Props) {
  // Treat stored fractions (0.20) and percentages (20) the same way for display.
  const asPercent = (v: number) => (v <= 1 ? v * 100 : v);
  const sum = DOMAINS.reduce((acc, d) => acc + asPercent(value[d.key] || 0), 0);
  const isValid = Math.abs(sum - 100) < 0.5;

  const update = useCallback(
    (key: OSCEDomain, raw: number) => {
      onChange({
        ...value,
        [key]: raw, // store as percent (0..100)
      });
    },
    [value, onChange]
  );

  const normalize = useCallback(() => {
    // Scale each to make the total exactly 100.
    if (sum === 0) return;
    const scaled = DOMAINS.reduce((acc, d) => {
      acc[d.key] = Math.round((asPercent(value[d.key] || 0) / sum) * 100 * 10) / 10;
      return acc;
    }, {} as DomainWeights);
    onChange(scaled);
  }, [sum, value, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-baseline">
        <div>
          <Label className="text-sm">OSCE Domain Weights</Label>
          <p className="text-xs text-muted-foreground">
            Each case can weight the 5 OSCE domains differently. Sliders must sum to 100%.
          </p>
        </div>
        <div className={`text-sm font-semibold ${isValid ? 'text-green-600' : 'text-red-600'}`}>
          Total: {sum.toFixed(1)}%
          {!isValid ? (
            <button
              type="button"
              onClick={normalize}
              className="ml-3 text-xs underline text-muted-foreground"
            >
              Auto-normalize to 100%
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {DOMAINS.map((d) => {
          const v = asPercent(value[d.key] || 0);
          return (
            <div key={d.key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-center">
              <div className="sm:col-span-4">
                <Label className="text-sm font-medium">{d.label}</Label>
                <p className="text-xs text-muted-foreground">{d.hint}</p>
              </div>
              <div className="sm:col-span-6">
                <Slider
                  value={[v]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(arr) => update(d.key, arr[0])}
                />
              </div>
              <div className="sm:col-span-2 text-left sm:text-right text-sm tabular-nums font-semibold">
                {v.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>

      {!isValid ? (
        <p className="text-xs text-red-600">
          Domain weights must sum to exactly 100%. Use the auto-normalize button or adjust sliders.
        </p>
      ) : null}
    </div>
  );
}
