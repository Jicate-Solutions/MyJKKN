'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';
import { StageConfigurator } from './stage-configurator';
import { DocumentRequirementEditor } from './document-requirement-editor';
import { QuotaConfigPanel } from './quota-config-panel';
import { SLAConfigPanel } from './sla-config-panel';
import type { AdmissionWorkflowConfig, SLAConfig } from '@/types/admission-workflow-config';
import { ALL_ADMISSION_STAGES, COMMON_DOCUMENTS } from '@/types/admission-workflow-config';

interface InstitutionWorkflowFormProps {
  config: AdmissionWorkflowConfig | null;
  institutionId: string;
  onSave: (data: Partial<AdmissionWorkflowConfig> & {
    institution_id: string;
    academic_year: string;
    config_name: string;
  }) => void;
  isSaving: boolean;
}

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${(year + 1).toString().slice(2)}`;
}

export function InstitutionWorkflowForm({
  config,
  institutionId,
  onSave,
  isSaving,
}: InstitutionWorkflowFormProps) {
  const defaultStages = ALL_ADMISSION_STAGES.map((s) => s.id);

  const [configName, setConfigName] = useState(config?.config_name || 'Default');
  const [academicYear, setAcademicYear] = useState(
    config?.academic_year || getCurrentAcademicYear()
  );
  const [activeStages, setActiveStages] = useState<string[]>(
    config?.active_stages || defaultStages
  );
  const [hasEntranceExam, setHasEntranceExam] = useState(config?.has_entrance_exam ?? false);
  const [requiredDocs, setRequiredDocs] = useState<string[]>(
    config?.required_documents || COMMON_DOCUMENTS.slice(0, 5)
  );
  const [hasGovernmentQuota, setHasGovernmentQuota] = useState(
    config?.has_government_quota ?? false
  );
  const [governmentQuotaPercentage, setGovernmentQuotaPercentage] = useState(
    config?.government_quota_percentage ?? 0
  );
  const [hasManagementQuota, setHasManagementQuota] = useState(
    config?.has_management_quota ?? false
  );
  const [hasNriQuota, setHasNriQuota] = useState(config?.has_nri_quota ?? false);
  const [quotaConfig, setQuotaConfig] = useState<Record<string, number>>(
    config?.quota_config || {}
  );
  const [slaConfig, setSlaConfig] = useState<SLAConfig>(
    config?.sla_config || {
      first_contact_hours: 24,
      document_verification_hours: 72,
      offer_validity_days: 7,
      token_payment_days: 3,
    }
  );
  const [isActive, setIsActive] = useState(config?.is_active ?? true);

  const handleSave = () => {
    onSave({
      ...(config?.id ? { id: config.id } : {}),
      institution_id: institutionId,
      config_name: configName,
      academic_year: academicYear,
      active_stages: activeStages,
      stage_configs: {},
      has_entrance_exam: hasEntranceExam,
      entrance_exam_type: null,
      has_government_quota: hasGovernmentQuota,
      government_quota_percentage: governmentQuotaPercentage,
      has_management_quota: hasManagementQuota,
      has_nri_quota: hasNriQuota,
      quota_config: quotaConfig,
      required_documents: requiredDocs,
      default_templates: {},
      sla_config: slaConfig,
      is_active: isActive,
    });
  };

  const handleQuotaChange = (field: string, value: boolean | number | Record<string, number>) => {
    switch (field) {
      case 'has_government_quota':
        setHasGovernmentQuota(value as boolean);
        break;
      case 'government_quota_percentage':
        setGovernmentQuotaPercentage(value as number);
        break;
      case 'has_management_quota':
        setHasManagementQuota(value as boolean);
        break;
      case 'has_nri_quota':
        setHasNriQuota(value as boolean);
        break;
      case 'quota_config':
        setQuotaConfig(value as Record<string, number>);
        break;
    }
  };

  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="config-name" className="text-xs">
                Config Name
              </Label>
              <Input
                id="config-name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="academic-year" className="text-xs">
                Academic Year
              </Label>
              <Input
                id="academic-year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="h-8"
                placeholder="2025-26"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="is-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="is-active" className="text-sm">
                  Active
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assessment Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="entrance">Entrance Exam</Label>
            <Switch
              id="entrance"
              checked={hasEntranceExam}
              onCheckedChange={setHasEntranceExam}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sub-panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StageConfigurator activeStages={activeStages} onChange={setActiveStages} />
        <DocumentRequirementEditor selectedDocs={requiredDocs} onChange={setRequiredDocs} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuotaConfigPanel
          hasGovernmentQuota={hasGovernmentQuota}
          governmentQuotaPercentage={governmentQuotaPercentage}
          hasManagementQuota={hasManagementQuota}
          hasNriQuota={hasNriQuota}
          quotaConfig={quotaConfig}
          onChange={handleQuotaChange}
        />
        <SLAConfigPanel slaConfig={slaConfig} onChange={setSlaConfig} />
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
