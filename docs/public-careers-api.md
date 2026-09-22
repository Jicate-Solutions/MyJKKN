# Public Careers API — guide for the jkkn.ac.in website team

MyJKKN exposes public job postings and accepts applications from the JKKN websites
without any login or API key. Three endpoints, JSON in/out, CORS-enabled for
`https://jkkn.ac.in` and every `https://<sub>.jkkn.ac.in`.

Base URL: `https://<myjkkn-host>/api/public/careers` (ask HR/IT for the production host).

Only jobs HR has marked **Show on website (jkkn.ac.in)** with status **Open** appear.

## 1. List jobs

```
GET /jobs?institution_id=<uuid>&q=<text>&job_type=<type>
```

| param | optional | notes |
|---|---|---|
| `institution_id` | yes | one college only (ids come from `institutions` in the response) |
| `q` | yes | title search, ≤100 chars |
| `job_type` | yes | `full_time` · `part_time` · `contract` · `internship` · `freelance` |

Response `200` (cache it on your side, e.g. `next: { revalidate: 300 }`):

```json
{
  "data": [ PublicJob, … ],
  "institutions": [ { "id": "uuid", "name": "JKKN College of Pharmacy", "open_jobs": 3 } ]
}
```

`PublicJob`:

```json
{
  "id": "uuid",
  "job_code": "JOB-001",
  "title": "Pharmacology Facilitator",
  "role_category": "teaching_faculty",
  "job_type": "full_time",
  "description": "…",
  "institution": { "id": "uuid", "name": "JKKN College of Pharmacy" },
  "department": { "id": "uuid", "name": "Pharmaceutics" },
  "city": "Komarapalayam", "state": "Tamil Nadu", "country": "India",
  "education_level": "masters",
  "min_experience_years": 1, "max_experience_years": 5,
  "qualifications": ["M.Pharm"], "skills": ["…"],
  "positions_open": 2,
  "posted_at": "2026-09-01T00:00:00Z", "closes_at": null,
  "salary": { "min": 30000, "max": 50000, "currency": "INR", "duration": "per_month" }
}
```

`salary` is `null` unless HR chose to display it. `department` may be `null`.

This endpoint is safe to call from your server (ISR/SSR) or the browser.

## 2. One job

```
GET /jobs/{id}
```

`200 { "data": PublicJob }` or `404` when the job is not public / not open / expired.

## 3. Apply

```
POST /jobs/{id}/apply        Content-Type: multipart/form-data
```

**Call this from the applicant's browser, not from your server.** The endpoint
limits applications per IP address; a server-side call would make every applicant
share one IP and get blocked after five.

| field | required | rule |
|---|---|---|
| `first_name`, `last_name` | yes | ≤100 chars |
| `email` | yes | valid email |
| `phone` | yes | 10–15 digits (spaces, `+`, `-`, `()` allowed) |
| `qualification` | yes | ≤200 chars |
| `experience_months` | yes | whole number 0–720 |
| `resume` | yes | file, ≤2 MB, PDF / DOC / DOCX (checked by content, not just extension) |
| `consent` | yes | must be the string `true` |
| `current_job_title`, `current_company` | no | ≤150 chars |
| `current_job_duration_months` | no | whole number 0–720 |
| `worked_cities` | no | comma-separated, up to 10 |
| `utm_source` | no | ≤100 chars — send `window.location.hostname` so HR sees which site referred them |
| `company_fax` | **must be empty** | honeypot; render it hidden (`tabIndex={-1} autoComplete="off"`) and never fill it |

Responses:

| status | body | meaning |
|---|---|---|
| `201` | `{ "reference": "JOB-001-AB12CD34" }` | accepted; show the reference. A repeat application from the same email returns the SAME reference and sends no second email — deliberately indistinguishable, so nobody can probe who has applied. |
| `400` | `{ "error", "fields": { "email": "…" } }` | validation — show `fields` next to inputs |
| `403` | `{ "error" }` | origin not allowed (wrong domain) |
| `404` | `{ "error" }` | job no longer open |
| `413` | `{ "error" }` | body over ~2.25 MB (resume must be under 2 MB) |
| `429` | `{ "error" }` | too many applications: 5 accepted / IP / hour, 3 / (job, email) / hour, 30 requests / IP / hour |
| `500`, `503` | `{ "error" }` | show the message, let them retry |

The applicant receives a confirmation email; the college's HR team gets an in-app
notification and reviews the application in MyJKKN.

## Next.js example

```tsx
const MYJKKN = process.env.NEXT_PUBLIC_MYJKKN_URL; // e.g. https://my.jkkn.ac.in

// Listing (server component / ISR)
const res = await fetch(`${MYJKKN}/api/public/careers/jobs?institution_id=${collegeId}`, {
  next: { revalidate: 300 },
});
const { data: jobs, institutions } = await res.json();

// Apply (client component — must run in the browser)
async function apply(jobId: string, form: HTMLFormElement) {
  const fd = new FormData(form); // inputs named exactly as the field table; <input type="file" name="resume">
  fd.set('consent', (form.elements.namedItem('consent') as HTMLInputElement).checked ? 'true' : 'false');
  fd.set('utm_source', window.location.hostname);
  // Do NOT set Content-Type yourself — the browser adds the multipart boundary.
  const res = await fetch(`${MYJKKN}/api/public/careers/jobs/${jobId}/apply`, { method: 'POST', body: fd });
  const body = await res.json();
  if (res.status === 201) return { ok: true, reference: body.reference };
  return { ok: false, status: res.status, error: body.error, fields: body.fields ?? {} };
}

// Honeypot — keep it out of sight and out of the tab order:
// <input name="company_fax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
```

## Local development

Set `PUBLIC_CAREERS_EXTRA_ORIGINS=http://localhost:3000` (comma-separated list) on the
MyJKKN side to allow a dev origin. Not needed in production.
