# Public Careers API — external job applications (design)

Date: 2026-09-21 · Status: approved in chat, pending spec review

## Problem

HR publishes jobs in MyJKKN (`hr_recruitment_jobs`), but the only way to apply is
`/hr/recruitment/submit`, which requires a MyJKKN login. External candidates on
jkkn.ac.in cannot see or apply for jobs.

Evidence (prod, 2026-09-21):
- 33 jobs are `open`; only 1 has `is_public = true`.
- All 57 `hr_job_applications` rows were keyed by 3 logged-in users; only 2 use the
  submitter's own email. No candidate has ever applied directly.
- The job form already has a "Public on /careers" toggle and code comments reference a
  public `/careers` page, but no page or public API was ever built — `is_public` is a
  dead flag.
- `anon` has no RLS path to either table (all policies require an authenticated user).

The downstream pipeline already works and is unchanged by this design:
application (pending → reviewed → shortlisted) → **promote** →
`hr_recruitment_candidates` → approval chain → interview → offer → onboarding.

## Decisions (from the user)

| Question | Decision |
|---|---|
| Consumer | jkkn.ac.in and its subdomains, all Next.js/React |
| Integration | **JSON API only** — the website builds its own listing and apply UI |
| Visibility | Only jobs HR marks **Public** (`is_public = true`) |
| Notifications | In-app notification to that college's HR **and** confirmation email to applicant |

## Architecture

```
jkkn.ac.in (browser) ──GET  /api/public/careers/jobs ─────────────┐
                     ──GET  /api/public/careers/jobs/[id] ────────┤  MyJKKN (service role,
                     ──POST /api/public/careers/jobs/[id]/apply ──┘  explicit column whitelist)
                                         │
                                         ├─ Google Drive: HR Recruitment/<job>/<resume>  (private)
                                         ├─ INSERT hr_job_applications (source='external_website')
                                         └─ after(): in-app notification → college HR screeners
                                                     Resend confirmation email → applicant
```

No login, no API key: a key shipped to a browser is public, so it adds no security.
Controls are: CORS origin allowlist, honeypot, per-IP rate limit, (job, email)
uniqueness, file magic-byte check, and a strict server-side field whitelist.

The apply POST **must be called from the applicant's browser**, not proxied through the
website's server — otherwise every applicant shares the website server's IP and the
per-IP limit blocks everyone. The listing GETs may be called server-side (ISR/SSR).

## API contract

Base: `https://<myjkkn-host>/api/public/careers`

### `GET /jobs`
Query: `institution_id?` (uuid), `q?` (title search, ≤100 chars), `job_type?`
(`full_time|part_time|contract|internship|freelance`).

Visible = `is_public AND status = 'open' AND (closes_at IS NULL OR closes_at > now())`.

Response `200`, `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`:
```json
{
  "data": [PublicJob],
  "institutions": [{ "id": "uuid", "name": "JKKN College of Pharmacy", "open_jobs": 3 }]
}
```

`PublicJob` (the ONLY fields ever returned):
```
id, job_code, title, role_category, job_type, description,
institution { id, name }, department { id, name } | null,
city, state, country,
education_level, min_experience_years, max_experience_years,
qualifications: string[], skills: string[],          // from requirements jsonb
positions_open, posted_at, closes_at,
salary: { min, max, currency, duration } | null      // null unless display_salary
```
Never returned: `hr_organization_id`, `created_by`, `positions_filled`, `status`,
`is_public`, raw `requirements`, salary when `display_salary = false`.

### `GET /jobs/[id]`
`200 { data: PublicJob }` or `404` when not visible (not public / not open / expired /
malformed id). Same cache headers.

### `POST /jobs/[id]/apply`
`multipart/form-data`:

| field | rule |
|---|---|
| `first_name`, `last_name` | required, trimmed, ≤100 |
| `email` | required, valid, lower-cased, ≤200 |
| `phone` | required, 10–15 digits after stripping `+ -()` and spaces |
| `qualification` | required, ≤200 |
| `experience_months` | required integer 0–720 |
| `current_job_title`, `current_company` | optional, ≤150 |
| `current_job_duration_months` | optional integer 0–720 |
| `worked_cities` | optional, comma-separated, ≤10 items × 60 chars |
| `resume` | required file, ≤2 MB, PDF/DOC/DOCX by **magic bytes** (`%PDF`, `D0CF11E0`, `PK\x03\x04`) |
| `consent` | required, must be `true` |
| `utm_source` | optional, ≤100 |
| `company_fax` | honeypot — must be empty (same trap as the CDC employer form; `website` autofills) |

Processing order (cheap and least-trusting first, Drive upload last; revised after
the 2026-09-22 deep review):
1. Origin allowlist → `403`.
2. `Content-Length` > resume cap + 256 KB → `413` (before the body is read).
3. Coarse per-IP limit, 30 requests / hour → `429`.
4. Read body. Honeypot filled → `201` with a fake reference, nothing persisted, hit logged.
5. Validate fields + file → `400 { error, fields: { name: message } }`.
6. Drive not configured → `503`.
7. Strict limits — 5 accepted / IP / hour and 3 / (job, email) / hour — counted only
   here, so a typo never burns a slot → `429`.
8. Job visible? else `404`.
9. Duplicate (job, lower(email), any source) → **`201` with the EXISTING row's reference,
   nothing written, no email.** Indistinguishable from a fresh accept, so the endpoint
   can't be used to probe whether a named person applied.
10. Upload resume to Drive (existing `uploadResumeToJobFolder`).
11. INSERT. On `23505` (lost a concurrent-submit race) delete the Drive file and answer
    as in 9. On any other error keep the file (the row may have committed) and `500`.
12. `201 { reference: "<job_code>-<first 8 of application id>" }`.
13. `after()`: notify HR, email applicant — each step capped at 20 s, outcome recorded on
    the row; never affects the response.

### CORS
Allowed origins: `https://jkkn.ac.in`, `https://*.jkkn.ac.in` (single label), plus
`PUBLIC_CAREERS_EXTRA_ORIGINS` (comma-separated, e.g. `http://localhost:3000`).
Reflect the matched origin, `Vary: Origin`, methods `GET, POST, OPTIONS`, header
`Content-Type`, no credentials. Disallowed origin: no CORS headers (browser blocks);
`POST` from a disallowed `Origin` additionally returns `403`. Every route handles
`OPTIONS`.

`proxy.ts`: add `'/api/public/careers/'` to `PUBLIC_PATH_PREFIXES`.

## Data changes (one migration)

`hr_job_applications`:
- `source text NOT NULL DEFAULT 'internal' CHECK (source IN ('internal','external_website'))`
- `consent_at timestamptz`
- `utm_source text`
- `confirmation_email_sent_at timestamptz`, `confirmation_email_error text`
- `CREATE UNIQUE INDEX … ON hr_job_applications (job_id, lower(email)) WHERE source = 'external_website'`
  — partial, because prod already holds one internal duplicate (job `91f6a2b9…`, same
  email twice, keyed by HR) and internal re-keying must stay possible. The route's
  step-5 pre-check still looks across **all** sources, so a candidate HR already keyed in
  gets the neutral duplicate `201` rather than a second row; the partial index only closes the
  concurrent-submit race among website rows.

New RPC `hr_recruitment_application_recipient_ids(p_institution_id uuid) RETURNS SETOF uuid`,
SECURITY DEFINER, `search_path = public`, EXECUTE granted to `service_role` only:
- active, login-enabled, non-super-admin profiles holding `hr.recruitment.edit` via
  `user_roles`→`custom_roles` OR legacy `profiles.role`→`custom_roles`,
- AND with access to the institution: home institution, CAS sibling (non-blank
  `counselling_code`), or active `user_institution_access` grant;
- if that set is empty → fall back to holders whose role has `institution_scope = 'all'`.

Recipients are a subset of the users who can read the application under RLS, so a
notification never points at a row the recipient cannot open. Prod coverage today:
every college with jobs has 1–2 scoped screeners; Main Office has 0 and uses the
fallback (5 all-scope HR editors).

No RLS changes; public routes use the service-role client.

## Code units

| File | Responsibility |
|---|---|
| `lib/services/hr/public-careers/public-job.ts` | `PublicJob` type, `toPublicJob(row)` whitelist mapper, `PUBLIC_JOB_SELECT`, `isJobVisible(row, now)` |
| `lib/services/hr/public-careers/apply-validation.ts` | `parseApplyForm(FormData)` → `{ ok, value } \| { ok:false, fields }`; `sniffResumeType(bytes)` |
| `lib/services/hr/public-careers/cors.ts` | `resolveAllowedOrigin(origin, extra)`, `corsHeaders(origin)` |
| `lib/services/hr/public-careers/rate-limit.ts` | per-IP in-memory limiter (5/h) |
| `lib/services/hr/public-careers/public-careers-service.ts` | `listPublicJobs`, `getPublicJob`, `submitExternalApplication` (steps 3–8) |
| `lib/services/hr/public-careers/after-apply.ts` | `notifyHrOfApplication`, `sendApplicantConfirmation` (Resend; records sent_at / error) |
| `lib/hr/recruitment/application-confirmation-email.ts` | pure HTML/text template |
| `app/api/public/careers/jobs/route.ts` | GET + OPTIONS |
| `app/api/public/careers/jobs/[id]/route.ts` | GET + OPTIONS |
| `app/api/public/careers/jobs/[id]/apply/route.ts` | POST + OPTIONS (`runtime = 'nodejs'`) |
| `types/hr-recruitment.ts` | add `source`, `consent_at`, `utm_source`, email fields to `HRJobApplication` |
| HR UI (applications section, workspace candidates tab, application detail) | "Website" source badge + source filter; null-safe `applicant_user_id` |
| Job create/edit forms + `/hr/recruitment/jobs` | relabel "Public on /careers" → "Show on website (jkkn.ac.in)"; hint that only public jobs appear |
| `docs/public-careers-api.md` | contract + a Next.js fetch/FormData example for the website team |

The internal `/hr/recruitment/submit` flow is untouched; its rows keep
`source = 'internal'` via the column default.

## Error handling

- Public responses never echo DB/Drive errors; log with a `[public/careers]` prefix and
  return a generic `500 "Something went wrong. Please try again."`.
- Drive not configured → `503`.
- `after()` tasks catch everything; email failure is written to
  `confirmation_email_error`, notification failure is logged.

## Testing

- Unit (vitest): `toPublicJob` never leaks non-whitelisted keys and nulls salary when
  `display_salary=false`; `isJobVisible` (public/open/expiry); `parseApplyForm` each rule;
  `sniffResumeType` (real PDF/DOCX/DOC headers vs renamed `.exe`/text); `resolveAllowedOrigin`
  (`jkkn.ac.in`, `x.jkkn.ac.in`, rejects `evil-jkkn.ac.in`, `jkkn.ac.in.evil.com`,
  `a.b.jkkn.ac.in`, `http://jkkn.ac.in`); rate limiter window.
- Route tests: honeypot → 201 nothing written; duplicate → neutral 201; closed → 404;
  oversize → 413; disallowed origin POST → 403; strict limit ignores validation failures.
- DB: recipient RPC returns no user outside the job's institution scope and ≥1 user for
  every institution with an open public job.
- Live: from `http://localhost:3000` (extra origin) list jobs, apply with a real PDF to a
  test job in JKKN Testing Institution, confirm the row shows in HR Applications with the
  Website badge, the Testing-institution screeners got the bell, and the email was sent;
  then purge the test row via the existing purge path.

## Out of scope (v1)

Hosted `/careers` pages, iframe embed, applicant accounts/status tracking, CAPTCHA
(add Cloudflare Turnstile if spam appears), distributed rate limiting, email outbox with
retries.

## Rollout

HR must mark jobs Public for them to appear (1 of 33 today). Share
`docs/public-careers-api.md` with the website team.
