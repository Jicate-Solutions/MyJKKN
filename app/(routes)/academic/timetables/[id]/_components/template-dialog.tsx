import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface TemplateDialogProps {
  isOpen: boolean;
  templateName: string;
  saving: boolean;
  onClose: () => void;
  onTemplateNameChange: (name: string) => void;
  onSave: () => void;
}

/**
 * Save Timetable as Template Dialog
 * Allows users to save current timetable as a reusable template
 */
export function TemplateDialog({
  isOpen,
  templateName,
  saving,
  onClose,
  onTemplateNameChange,
  onSave
}: TemplateDialogProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && templateName.trim() && !saving) {
      onSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save this timetable configuration as a template for future use.
            You can apply this template to other sections or semesters.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              placeholder="e.g., Semester 1 Regular Timetable"
              value={templateName}
              onChange={(e) => onTemplateNameChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Give your template a descriptive name to easily identify it later.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!templateName.trim() || saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
