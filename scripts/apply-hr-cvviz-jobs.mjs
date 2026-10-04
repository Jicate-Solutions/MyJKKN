// CVViZ → MyJKKN migration, Phase 1: load every CVViZ job into hr_cvviz_jobs.
// Spec: specs/cvviz-to-myjkkn-recruitment-migration-2026-10-01.md
// Table: supabase/migrations/20270521090000_hr_cvviz_jobs_archive.sql (apply it first)
//
// Input is the read-only CVViZ export (never committed — it holds PII):
//   <data>/masters.json          jobsList (candidate counts)
//   <data>/job_details.json      jobDetails / jobStages / jobNotes
//   <data>/mapping_draft.json    reviewed department → institution map
//   <data>/myjkkn_inst_dept.json MyJKKN institutions (code → id)
//
// Upsert on cvviz_job_id, so re-running after the department map is corrected
// just refreshes the placement columns.
//
// Usage:
//   node scripts/apply-hr-cvviz-jobs.mjs --data <dir>                  # dry-run (default): build rows, print summary, write nothing
//   node scripts/apply-hr-cvviz-jobs.mjs --data <dir> --institution CNR  # limit to one institution code (batch)
//   node scripts/apply-hr-cvviz-jobs.mjs --data <dir> --apply          # upsert
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes('--apply');
const DATA = arg('--data');
const ONLY = arg('--institution');
const BATCH = 50;
if (!DATA) { console.error('Missing --data <dir>'); process.exit(1); }

// ── env ──────────────────────────────────────────────────────────────────────
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const load = (f) => JSON.parse(readFileSync(path.join(DATA, f), 'utf8'));
const masters = load('masters.json');
const { jobDetails, jobStages, jobNotes } = load('job_details.json');
const mapping = load('mapping_draft.json');
const { institutions } = load('myjkkn_inst_dept.json');

const STATUS = { 3: 'Pending Approval', 5: 'In Progress', 9: 'Cancelled', 10: 'Closed', 11: 'Archived' };
const CLOSE_REASON = Object.fromEntries((masters.shell?.jobCloseReasons ?? []).map((r) => [String(r.value), r.label]));

// ── department map (columns per scratchpad build_mapping.py) ─────────────────
// [cvvizDeptId, name, jobs, apps, active, code, instNames, institutionId, deptName, departmentId, score, note, reviewer, reviewerOk]
const casSelf = institutions.find((i) => i.counselling_code === 'CAS' && /self/i.test(i.name));
const idByCode = {};
for (const i of institutions) {
  if (i.counselling_code && i.counselling_code !== 'CAS') idByCode[i.counselling_code] = i.id;
}
const deptMap = new Map();
for (const r of mapping.departments) {
  const [cvvizDeptId, , , , , code, , institutionId, , departmentId, , note] = r;
  let instId = institutionId || idByCode[code] || null;
  let status = 'auto';
  let mapNote = note || null;
  if (code === 'CAS' && !institutionId) {
    // Self vs Aided undecided. Park on CAS Self: role_has_institution_access is
    // CAS-sibling-aware, so Aided users see it too until the reviewer decides.
    instId = casSelf?.id ?? null;
    status = 'pending';
    mapNote = 'CAS Self/Aided pending — provisionally CAS Self';
  }
  if (!code) status = 'pending';
  deptMap.set(Number(cvvizDeptId), { code: code || null, instId, deptId: departmentId || null, status, mapNote });
}

// ── helpers ──────────────────────────────────────────────────────────────────
const ts = (v) => {
  if (!v) return null;
  const d = new Date(String(v).replace(/\s*\(.*\)$/, ''));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const exp = (v, sentinel) => (v === null || v === undefined || v < 0 || v === sentinel ? null : v);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const int = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : parseInt(v, 10));
// updatedBy is sometimes a name, sometimes a CVViZ user id ("5532") — resolve ids.
const userById = new Map((masters.users ?? []).map((u) => [String(u.id), u.name]));
const userName = (v) => (!v ? null : /^\d+$/.test(String(v)) ? (userById.get(String(v)) ?? `CVViZ user ${v}`) : v);
const totals = new Map(masters.jobsList.map((j) => [j.id, j.candidateCounts?.total ?? 0]));

// ── build rows ───────────────────────────────────────────────────────────────
const rows = [];
const missing = [];
for (const [id, j] of Object.entries(jobDetails)) {
  if (!j) { missing.push(id); continue; }
  const place = deptMap.get(Number(j.department?.id)) ?? { code: null, instId: null, deptId: null, status: 'pending', mapNote: 'No CVViZ department' };
  if (ONLY && place.code !== ONLY) continue;
  rows.push({
    cvviz_job_id: j.id,
    job_code: j.jobCode || null,
    title: (j.title || '').trim() || '(untitled)',
    status_code: j.status,
    status_label: STATUS[j.status] ?? `Status ${j.status}`,
    approval_status: j.approvalStatus ?? null,
    approval_group_id: j.approvalGroupId ?? null,
    current_stage: j.currentStage ?? null,
    is_deleted: !!j.isDeleted,
    is_draft: !!j.isDraft,
    cvviz_department_id: j.department?.id ?? null,
    cvviz_department_name: j.department?.name ?? null,
    job_function: j.jobFunction?.name ?? null,
    industry: j.industry?.name ?? null,
    employer_type: j.employerType?.name ?? null,
    job_type: j.jobType || null,
    education_level: j.educationLevel || null,
    qualifications: j.qualifications ?? [],
    skills: j.skills ?? [],
    min_experience_years: exp(j.minExperience),
    max_experience_years: exp(j.maxExperience, 99),
    salary_min: num(j.salary?.min),
    salary_max: num(j.salary?.max),
    salary_currency: j.salary?.currency ?? null,
    salary_interval: j.salary?.interval ?? null,
    country: j.country || null,
    state: j.state || null,
    city: j.city || null,
    zip_code: j.zipCode || null,
    is_remote: !!j.isRemote,
    description_html: j.description || null,
    parsed_skills: j.parsedSkills || null,
    validity_days: int(j.jobValidity),
    resume_mandatory: j.resumeMandatory ?? null,
    show_resume_upload: j.showResumeUpload ?? null,
    show_salary_on_career_page: j.showSalaryOnCareerPage ?? null,
    include_prescreening: j.includePrescreening ?? null,
    feedback_type: j.feedbackType ?? null,
    feedback_criteria: j.feedbackCriteria ?? [],
    benchmark_data: j.benchmarkData ?? [],
    career_page_url: j.careerPageUrl || null,
    assigned_recruiters: j.assignedRecruiters ?? [],
    hiring_manager: j.hiringManager ?? null,
    approvers: j.approvers ?? [],
    screening_questions: j.screeningQuestions ?? [],
    publication: j.publication ?? null,
    share_url: j.shareUrl || null,
    stage_counts: jobStages?.[id] ?? null,
    candidate_total: totals.get(j.id) ?? jobStages?.[id]?.total ?? 0,
    job_notes: jobNotes?.[id] ?? [],
    created_by_cvviz_id: j.createdById ?? null,
    created_by_name: j.createdBy || null,
    updated_by_name: userName(j.updatedBy),
    cvviz_created_at: ts(j.createdAt),
    cvviz_updated_at: ts(j.updatedAt),
    last_evaluated_at: ts(j.lastEvaluatedAt),
    closed_at: ts(j.closedAt),
    close_reason: j.closeReason && j.closeReason !== '0' ? (CLOSE_REASON[j.closeReason] ?? j.closeReason) : null,
    institution_code: place.code,
    institution_id: place.instId,
    department_id: place.deptId,
    mapping_status: place.status,
    mapping_note: place.mapNote,
    raw: j,
    updated_at: new Date().toISOString(),
  });
}

// ── summary ──────────────────────────────────────────────────────────────────
const count = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}${ONLY ? ` institution=${ONLY}` : ''}: ${rows.length} jobs`);
console.log('by institution :', count((r) => r.institution_code ?? 'UNMAPPED'));
console.log('by status      :', count((r) => r.status_label));
console.log('by mapping     :', count((r) => r.mapping_status));
console.log('deleted in CVViZ:', rows.filter((r) => r.is_deleted).length, '| drafts:', rows.filter((r) => r.is_draft).length);
console.log('with department_id:', rows.filter((r) => r.department_id).length, '| no institution_id:', rows.filter((r) => !r.institution_id).length);
console.log('bad dates      :', rows.filter((r) => !r.cvviz_created_at).length, '| missing details:', missing.length);
if (!APPLY) { console.log('\nDry-run only. Re-run with --apply to write.'); process.exit(0); }

// ── write ────────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

let written = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await db.from('hr_cvviz_jobs').upsert(chunk, { onConflict: 'cvviz_job_id' });
  if (error) {
    console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
    process.exit(1);
  }
  written += chunk.length;
  process.stdout.write(`\rupserted ${written}/${rows.length}`);
}
const { count: total, error: cErr } = await db.from('hr_cvviz_jobs').select('*', { count: 'exact', head: true });
console.log(`\nDone. hr_cvviz_jobs now has ${cErr ? '?' : total} rows.`);
