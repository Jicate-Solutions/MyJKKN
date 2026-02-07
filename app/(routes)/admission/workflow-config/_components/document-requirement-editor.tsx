'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { COMMON_DOCUMENTS } from '@/types/admission-workflow-config';

interface DocumentRequirementEditorProps {
  selectedDocs: string[];
  onChange: (docs: string[]) => void;
}

const DOC_LABELS: Record<string, string> = {
  photo: 'Passport Photo',
  id_proof: 'ID Proof (Aadhaar/PAN)',
  marksheet_10th: '10th Marksheet',
  marksheet_12th: '12th Marksheet',
  transfer_certificate: 'Transfer Certificate',
  community_certificate: 'Community Certificate',
  neet_scorecard: 'NEET Scorecard',
  birth_certificate: 'Birth Certificate',
  previous_report_card: 'Previous Report Card',
  address_proof: 'Address Proof',
  migration_certificate: 'Migration Certificate',
  gap_certificate: 'Gap Certificate',
  income_certificate: 'Income Certificate',
};

export function DocumentRequirementEditor({
  selectedDocs,
  onChange,
}: DocumentRequirementEditorProps) {
  const [docs, setDocs] = useState<string[]>(selectedDocs);

  const toggleDoc = (docId: string) => {
    const updated = docs.includes(docId)
      ? docs.filter((d) => d !== docId)
      : [...docs, docId];
    setDocs(updated);
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Required Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {COMMON_DOCUMENTS.map((docId) => (
          <div key={docId} className="flex items-center space-x-2">
            <Checkbox
              id={`doc-${docId}`}
              checked={docs.includes(docId)}
              onCheckedChange={() => toggleDoc(docId)}
            />
            <Label htmlFor={`doc-${docId}`} className="text-sm">
              {DOC_LABELS[docId] || docId}
            </Label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
