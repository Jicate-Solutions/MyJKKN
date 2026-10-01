'use client';

// "Bring in candidates": pick the CVViZ export and the resumes, upload, and open
// the new batch for review. Nothing is filed into MyJKKN at this step.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCreateIntakeBatch } from '@/hooks/hr/use-recruitment-intake';
import { IntakeApiClientError, type IntakeCollegeChoice } from '@/lib/hr/intake/api-client';
import { IntakeError } from './intake-states';

// The same list the server reads (parseExport).
const EXPORT_EXT = ['.csv', '.tsv', '.txt', '.xlsx', '.xls'];
const RESUME_EXT = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];

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
    return `The export must be a .csv, .tsv, .txt, .xlsx or .xls file — "${exportFile.name}" is not.`;
  }
  const zips = resumes.filter((f) => ext(f.name) === '.zip');
  if (zips.length > 0 && resumes.length > 1) {
    return 'Upload either one .zip of resumes or the resume files themselves, not both.';
  }
  const odd = resumes.find((f) => ext(f.name) !== '.zip' && !RESUME_EXT.includes(ext(f.name)));
  if (odd) return `Resumes must be PDF, Word or photo files (or one .zip) — "${odd.name}" is not.`;
  return null;
}

export function IntakeUploadForm() {
  const router = useRouter();
  const create = useCreateIntakeBatch();
  const [exportFile, setExportFile] = useState<File | null>(null);
  const [resumes, setResumes] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [stepText, setStepText] = useState<string | null>(null);
  // Shown only when the server says this person's profile has no college.
  const [colleges, setColleges] = useState<IntakeCollegeChoice[] | null>(null);
  const [collegeId, setCollegeId] = useState('');

  const resumeBytes = resumes.reduce((n, f) => n + f.size, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issue = checkIntakeFiles(exportFile, resumes);
    setProblem(issue);
    if (issue || !exportFile) return;
    if (colleges && !collegeId) {
      setProblem('Choose which college this upload is for.');
      return;
    }
    try {
      const batch = await create.mutateAsync({
        exportFile,
        resumes,
        institutionId: colleges ? collegeId : null,
        onProgress: (stage, done, total) =>
          setStepText(
            stage === 'export'
              ? 'Reading the export…'
              : stage === 'resumes'
                ? `Uploading resumes ${done} of ${total}…`
                : 'Reading the resumes and preparing each candidate… this can take a minute.',
          ),
      });
      router.push(`/hr/recruitment/intake/${batch.id}`);
    } catch (e) {
      // Shown below from create.error. A "choose a college" answer also brings the choices.
      if (e instanceof IntakeApiClientError && e.institutions) setColleges(e.institutions);
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

      {colleges && (
        <div className="space-y-2">
          <Label htmlFor="intake-college" className="text-sm font-medium text-foreground">
            3. Which college is this upload for?
          </Label>
          <p className="text-sm text-muted-foreground">
            Your profile has no college, so choose one. Only HR of that college will see these candidates.
          </p>
          {colleges.length === 0 ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              You do not have access to any college. Ask whoever manages roles to give you one.
            </p>
          ) : (
            <select
              id="intake-college"
              value={collegeId}
              onChange={(e) => {
                setCollegeId(e.target.value);
                setProblem(null);
              }}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Choose a college…</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

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
          {create.isPending ? (stepText ?? 'Uploading…') : 'Upload and review'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nothing is added to MyJKKN yet. You review every candidate first.
        </p>
      </div>
    </form>
  );
}
