'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Download, Search } from 'lucide-react';
import { DOCUMENT_TYPE_INFO, type DocumentType } from '@/types/documents';
import { useGenerateDocument } from '@/hooks/documents/use-documents';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: DocumentType;
  preselectedLearnerId?: string;
  preselectedInstitutionId?: string;
}

interface LearnerSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  register_number: string | null;
  institution_id: string;
  program_name: string | null;
  semester_name: string | null;
}

export function GenerateDocumentDialog({
  open,
  onOpenChange,
  documentType,
  preselectedLearnerId,
  preselectedInstitutionId,
}: Props) {
  const typeInfo = DOCUMENT_TYPE_INFO[documentType];
  const { profile } = useAuth();
  const generateMutation = useGenerateDocument();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LearnerSearchResult[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<LearnerSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const supabase = createClientSupabaseClient();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase
        .from('learners_profiles')
        .select(`
          id, first_name, last_name, roll_number, register_number, institution_id,
          programs:program_id ( program_name ),
          semesters:semester_id ( semester_name )
        `)
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,roll_number.ilike.%${searchQuery}%,register_number.ilike.%${searchQuery}%`)
        .eq('lifecycle_status', 'active')
        .limit(10);

      setSearchResults(
        (data || []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          first_name: d.first_name as string,
          last_name: d.last_name as string,
          roll_number: d.roll_number as string | null,
          register_number: d.register_number as string | null,
          institution_id: d.institution_id as string,
          program_name: (d.programs as Record<string, unknown> | null)?.program_name as string | null,
          semester_name: (d.semesters as Record<string, unknown> | null)?.semester_name as string | null,
        }))
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedLearner || !user) return;

    generateMutation.mutate({
      dto: {
        institutionId: preselectedInstitutionId || selectedLearner.institution_id,
        documentType,
        learnerId: preselectedLearnerId || selectedLearner.id,
      },
      userId: user.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Generate {typeInfo.displayName}</DialogTitle>
          <DialogDescription>{typeInfo.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Student search */}
          {!preselectedLearnerId && (
            <div className="space-y-2">
              <Label>Search Student</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Name, roll number, or register number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                  {searchResults.map((learner) => (
                    <button
                      key={learner.id}
                      onClick={() => setSelectedLearner(learner)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                        selectedLearner?.id === learner.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="font-medium">
                        {learner.first_name} {learner.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[learner.roll_number, learner.program_name, learner.semester_name]
                          .filter(Boolean)
                          .join(' | ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected student preview */}
          {selectedLearner && (
            <div className="p-3 bg-muted/50 rounded-md">
              <div className="font-medium">
                {selectedLearner.first_name} {selectedLearner.last_name}
              </div>
              <div className="text-sm text-muted-foreground">
                {[
                  selectedLearner.roll_number && `Roll: ${selectedLearner.roll_number}`,
                  selectedLearner.register_number && `Reg: ${selectedLearner.register_number}`,
                  selectedLearner.program_name,
                ]
                  .filter(Boolean)
                  .join(' | ')}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedLearner || generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
