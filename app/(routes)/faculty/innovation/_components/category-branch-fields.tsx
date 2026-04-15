'use client';

// app/(routes)/faculty/innovation/_components/category-branch-fields.tsx
// Category-specific fields that swap based on the selected category.
// Week 1 implements Clinical + Research Grant + IP + Publication branches.

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ClinicalDetails,
  ResearchDetails,
  FacultyInitiativeCategory,
} from '@/types/faculty-innovation';

interface Props {
  category: FacultyInitiativeCategory;
  clinicalDetails: ClinicalDetails;
  researchDetails: ResearchDetails;
  shPublicationId: string;
  onClinicalChange: (details: ClinicalDetails) => void;
  onResearchChange: (details: ResearchDetails) => void;
  onShPublicationChange: (id: string) => void;
}

export function CategoryBranchFields({
  category,
  clinicalDetails,
  researchDetails,
  shPublicationId,
  onClinicalChange,
  onResearchChange,
  onShPublicationChange,
}: Props) {
  if (category === 'clinical') {
    return (
      <div className="space-y-4 rounded-md border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Clinical Details</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="validation_methodology">Validation methodology</Label>
            <Input
              id="validation_methodology"
              value={(clinicalDetails.validation_methodology as string) ?? ''}
              onChange={(e) =>
                onClinicalChange({
                  ...clinicalDetails,
                  validation_methodology: e.target.value,
                })
              }
              placeholder="e.g. AIR Index against radiologist ground-truth"
            />
          </div>
          <div>
            <Label htmlFor="sample_size">Sample size</Label>
            <Input
              id="sample_size"
              type="number"
              min={0}
              value={(clinicalDetails.sample_size as number) ?? ''}
              onChange={(e) =>
                onClinicalChange({
                  ...clinicalDetails,
                  sample_size: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="ethics_approval_id">Ethics approval ID</Label>
            <Input
              id="ethics_approval_id"
              value={(clinicalDetails.ethics_approval_id as string) ?? ''}
              onChange={(e) =>
                onClinicalChange({
                  ...clinicalDetails,
                  ethics_approval_id: e.target.value,
                })
              }
              placeholder="e.g. IEC/JKKN-DC/2026/xxx"
            />
          </div>
          <div>
            <Label htmlFor="deployment_site">Deployment site</Label>
            <Input
              id="deployment_site"
              value={(clinicalDetails.deployment_site as string) ?? ''}
              onChange={(e) =>
                onClinicalChange({
                  ...clinicalDetails,
                  deployment_site: e.target.value,
                })
              }
              placeholder="e.g. OPD, OT, tele-clinic"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="clinical_maturity">Current maturity</Label>
          <Input
            id="clinical_maturity"
            value={(clinicalDetails.current_maturity as string) ?? ''}
            onChange={(e) =>
              onClinicalChange({
                ...clinicalDetails,
                current_maturity: e.target.value,
              })
            }
            placeholder="e.g. validated_prototype, in-clinic pilot, scaled"
          />
        </div>
      </div>
    );
  }

  if (category === 'research_grant') {
    return (
      <div className="space-y-4 rounded-md border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Research / Grant Details</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="funding_agency">Funding agency</Label>
            <Input
              id="funding_agency"
              value={(researchDetails.funding_agency as string) ?? ''}
              onChange={(e) =>
                onResearchChange({
                  ...researchDetails,
                  funding_agency: e.target.value,
                })
              }
              placeholder="e.g. DBT, ICMR, DST"
            />
          </div>
          <div>
            <Label htmlFor="grant_amount">Grant amount</Label>
            <Input
              id="grant_amount"
              type="number"
              min={0}
              value={(researchDetails.grant_amount as number) ?? ''}
              onChange={(e) =>
                onResearchChange({
                  ...researchDetails,
                  grant_amount: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="INR"
            />
          </div>
          <div>
            <Label htmlFor="project_duration">Project duration</Label>
            <Input
              id="project_duration"
              value={(researchDetails.project_duration as string) ?? ''}
              onChange={(e) =>
                onResearchChange({
                  ...researchDetails,
                  project_duration: e.target.value,
                })
              }
              placeholder="e.g. 24 months"
            />
          </div>
          <div>
            <Label htmlFor="collaborators">Collaborators (comma-separated)</Label>
            <Input
              id="collaborators"
              value={
                Array.isArray(researchDetails.collaborators)
                  ? (researchDetails.collaborators as string[]).join(', ')
                  : ''
              }
              onChange={(e) =>
                onResearchChange({
                  ...researchDetails,
                  collaborators: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor="deliverables">Deliverables</Label>
          <Textarea
            id="deliverables"
            value={
              Array.isArray(researchDetails.deliverables)
                ? (researchDetails.deliverables as string[]).join('\n')
                : ''
            }
            onChange={(e) =>
              onResearchChange({
                ...researchDetails,
                deliverables: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={3}
            placeholder="One deliverable per line"
          />
        </div>
      </div>
    );
  }

  if (category === 'ip_bearing') {
    return (
      <div className="space-y-4 rounded-md border bg-amber-50 p-4">
        <h3 className="text-sm font-semibold">IP / Patent Summary (non-confidential)</h3>
        <p className="text-xs text-muted-foreground">
          Patent filing details (filing number, jurisdiction, annuity dates) are
          logged separately in the confidential IP register in Week 2. For now,
          capture the non-confidential summary here.
        </p>

        <div>
          <Label htmlFor="ip_status">IP status</Label>
          <Input
            id="ip_status"
            value={(researchDetails.ip_status as string) ?? ''}
            onChange={(e) =>
              onResearchChange({
                ...researchDetails,
                ip_status: e.target.value,
              })
            }
            placeholder="e.g. provisional_patent_filed, drafting, granted"
          />
        </div>

        <div>
          <Label htmlFor="ip_collaborators">Internal collaborators (other JKKN colleges)</Label>
          <Input
            id="ip_collaborators"
            value={
              Array.isArray(researchDetails.collaborators)
                ? (researchDetails.collaborators as string[]).join(', ')
                : ''
            }
            onChange={(e) =>
              onResearchChange({
                ...researchDetails,
                collaborators: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g. JKKN College of Pharmacy, JKKN Dental College"
          />
        </div>

        <div>
          <Label htmlFor="ip_needs">Institutional support needed</Label>
          <Textarea
            id="ip_needs"
            value={
              Array.isArray(researchDetails.needs)
                ? (researchDetails.needs as string[]).join('\n')
                : ''
            }
            onChange={(e) =>
              onResearchChange({
                ...researchDetails,
                needs: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={3}
            placeholder="One item per line (e.g. MVP build, Formulation partner, Regulatory review)"
          />
        </div>
      </div>
    );
  }

  if (category === 'publication') {
    return (
      <div className="space-y-4 rounded-md border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Publication Link</h3>
        <p className="text-xs text-muted-foreground">
          If this publication already exists in Solutions Hub, paste its ID
          below. Otherwise leave blank — a matching{' '}
          <code>sh_publications</code> record will be created on submit.
        </p>

        <div>
          <Label htmlFor="sh_publication_id">Solutions Hub publication ID (optional)</Label>
          <Input
            id="sh_publication_id"
            value={shPublicationId}
            onChange={(e) => onShPublicationChange(e.target.value)}
            placeholder="UUID"
          />
        </div>
      </div>
    );
  }

  return null;
}
