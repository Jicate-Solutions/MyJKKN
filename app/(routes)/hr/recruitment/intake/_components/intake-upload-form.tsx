'use client';

// "Bring in candidates": pick the CVViZ export and the resumes, upload, and open
// the new batch for review. Nothing is filed into MyJKKN at this step.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCreateIntakeBatch } from '@/hooks/hr/use-recruitment-intake';
import { IntakeError } from './intake-states';

const EXPORT_EXT = ['.csv', '.tsv', '.xlsx'];
const RESUME_EXT = ['.pdf', '.doc', '.docx'];

const ext = (name: string) => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};

function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Plain-English problem with the chosen files, or null when they are fine. */
export function checkIntakeFiles(exportFile: File | null, resumes: File[]): string | null {
  if (!exportFile) return 'Choose the CVViZ export file first.';
  if (!EXPORT_EXT.includes(ext(exportFile.name))) {
    return `The export must be a .csv, .tsv or .xlsx file — "${exportFile.name}" is not.`;
  }
  const zips = resumes.filter((f) => ext(f.name) === '.zip');
  if (zips.length > 0 && resumes.length > 1) {
    return 'Upload either one .zip of resumes or the resume files themselves, not both.';
  }
  const odd = resumes.find((f) => ext(f.name) !== '.zip' && !RESUME_EXT.includes(ext(f.name)));
  if (odd) return `Resumes must be PDF or Word files (or one .zip) — "${odd.name}" is not.`;
  return null;
}

export function IntakeUploadForm() {
  const router = useRouter();
  const create = useCreateIntakeBatch();
  const [exportFile, setExportFile] = useState<File | null>(null);
  const [resumes, setResumes] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const resumeBytes = resumes.reduce((n, f) => n + f.size, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issue = checkIntakeFiles(exportFile, resumes);
    setProblem(issue);
    if (issue || !exportFile) return;
    try {
      const batch = await create.mutateAsync({ exportFile, resumes });
      router.push(`/hr/recruitment/intake/${batch.id}`);
    } catch {
      // Shown below from create.error.
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none sm:p-6"
    >
      <div className="space-y-2">
        <Label htmlFor="intake-export" className="text-sm font-medium text-foreground">
          1. The CVViZ export
        </Label>
        <p className="text-sm text-muted-foreground">
          In CVViZ, open the candidate list you want to bring in, select the candidates, and export them as a
          CSV or Excel file. Keep the &ldquo;File Name&rdquo; column — it is how the helper finds each
          candidate&rsquo;s resume.
        </p>
        <input
          id="intake-export"
          type="file"
          accept={EXPORT_EXT.join(',')}
          onChange={(e) => {
            setExportFile(e.target.files?.[0] ?? null);
            setProblem(null);
          }}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        {exportFile && (
          <p className="text-xs text-muted-foreground">
            {exportFile.name} · {sizeText(exportFile.size)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="intake-resumes" className="text-sm font-medium text-foreground">
          2. The resumes (optional, but the helper reads them)
        </Label>
        <p className="text-sm text-muted-foreground">
          In CVViZ, download the resumes for the same candidates. You can upload the .zip CVViZ gives you as it
          is, or select the PDF and Word files themselves.
        </p>
        <input
          id="intake-resumes"
          type="file"
          multiple
          accept={[...RESUME_EXT, '.zip'].join(',')}
          onChange={(e) => {
            setResumes(Array.from(e.target.files ?? []));
            setProblem(null);
          }}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        {resumes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {resumes.length === 1 ? resumes[0].name : `${resumes.length} files`} · {sizeText(resumeBytes)}
          </p>
        )}
      </div>

      {problem && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
      {create.isError && <IntakeError title="The upload did not go through" error={create.error} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          {create.isPending ? 'Uploading and reading…' : 'Upload and review'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nothing is added to MyJKKN yet. You review every candidate first.
        </p>
      </div>
    </form>
  );
}
