'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface QuotaConfigPanelProps {
  hasGovernmentQuota: boolean;
  governmentQuotaPercentage: number;
  hasManagementQuota: boolean;
  hasNriQuota: boolean;
  quotaConfig: Record<string, number>;
  onChange: (field: string, value: boolean | number | Record<string, number>) => void;
}

export function QuotaConfigPanel({
  hasGovernmentQuota,
  governmentQuotaPercentage,
  hasManagementQuota,
  hasNriQuota,
  quotaConfig,
  onChange,
}: QuotaConfigPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Quota Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="gov-quota">Government Quota</Label>
          <Switch
            id="gov-quota"
            checked={hasGovernmentQuota}
            onCheckedChange={(v) => onChange('has_government_quota', v)}
          />
        </div>
        {hasGovernmentQuota && (
          <div className="pl-4 flex items-center gap-2">
            <Label htmlFor="gov-pct" className="text-sm text-muted-foreground">
              Percentage
            </Label>
            <Input
              id="gov-pct"
              type="number"
              min={0}
              max={100}
              className="w-20 h-8"
              value={governmentQuotaPercentage}
              onChange={(e) =>
                onChange('government_quota_percentage', Number(e.target.value))
              }
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="mgmt-quota">Management Quota</Label>
          <Switch
            id="mgmt-quota"
            checked={hasManagementQuota}
            onCheckedChange={(v) => onChange('has_management_quota', v)}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="nri-quota">NRI Quota</Label>
          <Switch
            id="nri-quota"
            checked={hasNriQuota}
            onCheckedChange={(v) => onChange('has_nri_quota', v)}
          />
        </div>

        {(hasManagementQuota || hasNriQuota) && (
          <div className="pt-2 border-t space-y-2">
            <p className="text-xs text-muted-foreground">
              Seat allocation (% of total)
            </p>
            {Object.entries(quotaConfig).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 pl-4">
                <Label className="text-sm capitalize w-24">{key.replace(/_/g, ' ')}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 h-8"
                  value={value}
                  onChange={(e) => {
                    const updated = { ...quotaConfig, [key]: Number(e.target.value) };
                    onChange('quota_config', updated);
                  }}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
