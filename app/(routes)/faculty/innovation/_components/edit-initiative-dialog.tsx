'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { CategoryBranchFields } from './category-branch-fields';
import {
  CATEGORY_LABEL,
  type ClinicalDetails,
  type FacultyInitiative,
  type FacultyInitiativeCategory,
  type ResearchDetails,
  type UpdateFacultyInitiativeInput,
} from '@/types/faculty-innovation';

interface Props {
  initiative: FacultyInitiative | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, input: UpdateFacultyInitiativeInput) => Promise<void>;
}

export function EditInitiativeDialog({ initiative, open, onOpenChange, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FacultyInitiativeCategory>('ip_bearing');
  const [clinicalDetails, setClinicalDetails] = useState<ClinicalDetails>({});
  const [researchDetails, setResearchDetails] = useState<ResearchDetails>({});
  const [shPublicationId, setShPublicationId] = useState('');
  const [saving, setSaving] = useState(false);

  // Populate from initiative whenever it changes
  useEffect(() => {
    if (!initiative) return;
    setTitle(initiative.title);
    setAbstract(initiative.abstract);
    setDescription(initiative.description ?? '');
    setCategory(initiative.category);
    setClinicalDetails((initiative.clinical_details as ClinicalDetails) ?? {});
    setResearchDetails((initiative.research_details as ResearchDetails) ?? {});
    setShPublicationId(initiative.sh_publication_id ?? '');
  }, [initiative]);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const shPubIdInvalid = !!shPublicationId && !UUID_RE.test(shPublicationId);

  const handleSave = async () => {
    if (!initiative) return;
    if (shPubIdInvalid) return;

    setSaving(true);
    try {
      const input: UpdateFacultyInitiativeInput = {
        title: title.trim(),
        abstract: abstract.trim(),
        description: description.trim() || undefined,
        category,
        clinical_details: category === 'clinical' ? clinicalDetails : undefined,
        research_details:
          category === 'research_grant' || category === 'ip_bearing'
            ? researchDetails
            : undefined,
        sh_publication_id:
          category === 'publication' && shPublicationId ? shPublicationId : undefined,
      };
      await onSave(initiative.id, input);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Initiative</DialogTitle>
          <DialogDescription className="text-xs">
            Changes are only allowed while the initiative is in draft status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="edit-title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-abstract">Abstract <span className="text-red-500">*</span></Label>
            <Textarea
              id="edit-abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FacultyInitiativeCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABEL) as FacultyInitiativeCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CategoryBranchFields
            category={category}
            clinicalDetails={clinicalDetails}
            researchDetails={researchDetails}
            shPublicationId={shPublicationId}
            onClinicalChange={setClinicalDetails}
            onResearchChange={setResearchDetails}
            onShPublicationChange={setShPublicationId}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || abstract.trim().length < 20 || shPubIdInvalid}
          >
            {saving
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</>
              : <><Save className="h-4 w-4 mr-1" /> Save changes</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
