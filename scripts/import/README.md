# Website Faculty → MyJKKN Staff Import

One-time migration script that copies extended faculty profile fields from the institution website's standalone Supabase project into MyJKKN, so the website can stop running its own faculty admin and read everything from MyJKKN's API instead.

## Prerequisites

- The Phase 1 schema migrations are applied to MyJKKN (`staff` extended columns + `staff_import_unmatched` table).
- You have service-role access to BOTH Supabase projects:
  - Website (the source — currently `kyvfkyjmdbtyimtedkie.supabase.co`)
  - MyJKKN (the destination — read from `.env.local`)

## Setup

1. Copy the env template:

   ```bash
   cp .env.import.example .env.import
   ```

2. Open `.env.import` and fill in:
   - `WEBSITE_SUPABASE_URL` (e.g., `https://kyvfkyjmdbtyimtedkie.supabase.co`)
   - `WEBSITE_SUPABASE_SERVICE_ROLE_KEY` (find in Supabase dashboard → Project Settings → API)

3. Confirm `.env.local` has MyJKKN's `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (it should already).

`.env.import` is gitignored. Don't commit it.

## Run

```bash
# Dry run — prints matched/unmatched but writes NOTHING
npm run import:website-faculty:dry

# Real run — writes UPDATEs to staff and INSERTs to staff_import_unmatched
npm run import:website-faculty
```

Each run writes a per-run log to `scripts/import/runs/run-<timestamp>.log` (also gitignored). Read that log to audit what happened.

## What the script does

### Pass 1 — Faculty rows

For each row in the website's `faculty` table:

1. Look up MyJKKN `staff` by `lower(email)` match.
2. **Match found:** UPDATE the new extended fields (29 columns: slug, status, JSONB arrays, scholar URLs, markdown summaries, etc.). Existing personal data (name, phone, address) is **NOT** overwritten — the import is additive only.
3. **No match:** INSERT into `staff_import_unmatched` with the full source row + the reason "no email match in MyJKKN staff".
4. **No email on the website row:** skip with a log entry. (These rows can't be auto-matched and require manual handling.)

### Pass 2 — Faculty achievements

Then, fetch all rows from `faculty_achievements`, group by `faculty_name` (a free-text column on the website), and:

1. For each group, look up MyJKKN staff by `first_name + last_name` (best-effort split on the first space).
2. **Match:** append the group's achievements to `staff.achievements` JSONB (additive — does not replace existing achievements).
3. **No match:** INSERT into `staff_import_unmatched` with the group + reason "no staff found by full_name split".

If the website's `faculty_achievements` table doesn't exist (some installations may not have it), the script logs a warning and continues — Pass 2 is non-blocking.

## Reviewing unmatched rows

After a run, query the review table:

```sql
SELECT id, source_table, source_row->>'email' AS email,
       source_row->>'full_name' AS full_name,
       reason, created_at
FROM public.staff_import_unmatched
WHERE resolved = false
ORDER BY created_at DESC;
```

For each unresolved row, decide one of:

- **Create the missing staff in MyJKKN**, then re-run the import (rerun is idempotent — already-matched rows are UPDATEd to the same payload, no churn).
- **Edit an existing MyJKKN staff's email** to match the website row, then re-run.
- **Discard** if the row should not become a MyJKKN staff record:

  ```sql
  UPDATE public.staff_import_unmatched
     SET resolved = true,
         resolved_by = auth.uid(),
         resolved_at = now()
   WHERE id = '...';
  ```

## Idempotency

- Pass 1's UPDATE is idempotent — re-running with the same source data writes the same payload.
- Pass 2's append-merge is **NOT** idempotent — re-running will duplicate achievements in `staff.achievements`. Either truncate the array first, or only re-run Pass 2 after a fresh write.

A future improvement could deduplicate achievements by `(title, date)` — out of scope for v1.

## Cutover plan (suggested)

1. Run `:dry` against PROD MyJKKN. Review the log.
2. Resolve the worst unmatched cases manually.
3. Run live against PROD during a low-traffic window.
4. Spot-check a handful of faculty in MyJKKN — verify their extended fields match the website.
5. Update the institution website to read from MyJKKN's `/api/api-management/staff` endpoint.
6. After confirming the website renders correctly, retire the website's standalone faculty admin panel.

## Troubleshooting

- **"`.env.import` not found"** → you skipped the Setup step.
- **"WEBSITE_SUPABASE_URL ... must be set"** → `.env.import` exists but a key is empty.
- **Many "[unmatched]" lines in the log** → the website's email column has spelling/case drift from MyJKKN. Resolve via the SQL above.
- **"failed to fetch faculty_achievements"** → the website doesn't have this table. Pass 1 still ran; Pass 2 was skipped. Safe to ignore.
