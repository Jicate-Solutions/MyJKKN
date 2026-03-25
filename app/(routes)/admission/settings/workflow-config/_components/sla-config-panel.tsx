'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { SLAConfig } from '@/types/admission-workflow-config';

interface SLAConfigPanelProps {
  slaConfig: SLAConfig;
  onChange: (config: SLAConfig) => void;
}

const SLA_FIELDS: { key: keyof SLAConfig; label: string; unit: string }[] = [
  { key: 'first_contact_hours', label: 'First Contact', unit: 'hours' },
  { key: 'document_verification_hours', label: 'Document Verification', unit: 'hours' },
  { key: 'offer_validity_days', label: 'Offer Validity', unit: 'days' },
  { key: 'token_payment_days', label: 'Token Payment Deadline', unit: 'days' },
];

export function SLAConfigPanel({ slaConfig, onChange }: SLAConfigPanelProps) {
  const update = (key: keyof SLAConfig, value: number) => {
    onChange({ ...slaConfig, [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">SLA Thresholds</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {SLA_FIELDS.map((field) => (
          <div key={field.key} className="flex items-center gap-3">
            <Label className="text-sm flex-1">{field.label}</Label>
            <Input
              type="number"
              min={0}
              className="w-20 h-8"
              value={slaConfig[field.key] ?? ''}
              onChange={(e) => update(field.key, Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground w-12">{field.unit}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
