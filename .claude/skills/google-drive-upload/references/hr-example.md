# Reference Implementation — HR Recruitment Resume Upload

This is the first Drive upload module in MyJKKN (implemented 2026-06-27). Use as a concrete reference when implementing Drive upload in other modules.

## Folder structure in Drive

```
JKKN HR Resumes (root: 1xR8xwYQnEOfhcq1xvBiSp-Y2UAU__wKn)
  └── HR Recruitment/
       └── {job.title} [{job.job_code or job.id[:8]}]/
            └── {Date.now()}-{original-filename}.pdf
```

## Files touched

| File | Change |
|---|---|
| `lib/google/drive-upload.ts` | Added `uploadResumeToJobFolder()` |
| `app/api/hr/recruitment/jobs/[id]/resume-upload/route.ts` | New multipart upload API route |
| `app/(routes)/hr/recruitment/submit/_components/step-upload-resume.tsx` | Client component — POSTs FormData |
| `app/(routes)/hr/recruitment/submit/_components/apply-wizard.tsx` | Tracks `driveFileId` in state |
| `app/api/hr/recruitment/jobs/[id]/apply/route.ts` | Inserts `drive_file_id` into DB |
| `supabase/migrations/20260627_hr_job_applications.sql` | Creates `hr_job_applications` table |
| Migration (applied separately) | `ALTER TABLE hr_job_applications ADD COLUMN drive_file_id TEXT` |
| `types/supabase.ts` | Added `drive_file_id` to Row/Insert/Update |
| `types/hr-recruitment.ts` | Added `drive_file_id` to `HRJobApplication` + `HRJobApplicationInsert` |

## `uploadResumeToJobFolder` signature

```ts
export interface ResumeUploadOptions {
  jobTitle: string;
  jobCode?: string | null;
  jobId: string;
  file: File;
}

export interface ResumeUploadResult {
  url: string;       // https://drive.google.com/file/d/{id}/view
  driveFileId: string;
}

export async function uploadResumeToJobFolder(opts: ResumeUploadOptions): Promise<ResumeUploadResult>
```

## API route key details

- Path: `POST /api/hr/recruitment/jobs/[id]/resume-upload`
- Validates: `application/pdf`, `application/msword`, `.docx` MIME; ≤ 2 MB
- Fetches job to get `job.title` and `job.job_code` for folder naming
- Validates `job.status === 'open'` before accepting upload
- No public Drive permission set (resumes = PII)
- Returns: `{ url, driveFileId, filename: file.name, sizeBytes: file.size }`

## Wizard state threading

```
StepUploadResume.onNext(url, filename, sizeBytes, driveFileId)
  → ApplyWizard state: [resumeUrl, resumeFilename, resumeSizeBytes, driveFileId]
    → handleSubmit() passes drive_file_id to /apply route
      → hr_job_applications.drive_file_id stored in DB
```

## Security decisions

- **No `permissions.create`** — resume files contain PII (name, phone, work history)
- **`driveFileId` stored in DB** — enables future authenticated proxy download route
- **Proxy route not yet built** — planned: `GET /api/hr/recruitment/applications/[id]/resume` checks `hr.recruitment.view`, fetches via service account, streams bytes
- **RLS INSERT policy**: `WITH CHECK (applicant_user_id = auth.uid() AND status = 'pending' AND reviewed_by IS NULL)`

## What NOT to copy from this example

- The `hr-resumes` Supabase Storage bucket + policies created in the initial migration — those are unused (Drive replaced Storage) but left in place harmlessly
- The OOB OAuth flow attempts (`get-auth-url.js`, `exchange-token.js`) — use the localhost redirect flow (`get-drive-token-local.js` pattern) from the start
