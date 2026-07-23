# Learner Promotion — optional Department & Program targeting

**Date:** 2026-06-30
**Area:** `/learners/profiles/promotion` (Semester/Section Promotion tab)
**Status:** Approved design

## Problem

The promotion form only lets you change **Semester**, **Section**, and (optionally) **Academic Year**. Institution / Degree / Department / Program are shown as *"Unchanged"*. Sometimes a promotion also needs to move learners to a **different department and program** (e.g. a stream/branch change at year rollover). Department and Program must be **optional** — blank means "leave as-is".

## Decisions (confirmed with user)

1. **Keep the same-source rule.** All selected learners must still share the same current institution / degree / department / program. The form then optionally retargets them *all* to one new department/program + semester/section. No mixed-source convergence.
2. **Blank = unchanged.** Leaving Department/Program blank does not touch those fields on the learner records.

## Scope of change (3 files)

Everything below the form is already in place — `UpdateLearnerProfileDto` has `department_id?`/`program_id?`, `updateLearnerProfile` already writes them (the edit form uses the same path), and RLS already permits the update. **No DTO, RLS, migration, permission, or page changes.**

### 1. `app/(routes)/learners/profiles/_components/semester-promotion-form.tsx`

- New state: `departmentId`, `programId` (target overrides; `''` = unchanged).
- New data hooks:
  - `useDepartments({ institution_id, degree_id })` — scoped to the cohort's shared institution + degree.
  - `usePrograms({ institution_id, department_id: effectiveDepartmentId })` — scoped to the **effective** department.
- **Effective-value model** (drives the cascade):
  - `effectiveDepartmentId = departmentId || validationResult.departmentId`
  - `effectiveProgramId = programId || validationResult.programId`
  - Semester hook switches to `program_id: effectiveProgramId` (was `validationResult.programId`).
- **Cascade resets:** target Department change → clear `programId`, `semesterId`, `sectionId`; target Program change → clear `semesterId`, `sectionId`. (semester→section reset already exists.)
- **Submit guard (`handlePromote`):** if a target Department is selected but no Program, block with toast *"Select a program for the new department."* (A program belongs to a department; writing a new `department_id` while keeping the old department's `program_id` would be inconsistent.) Semester + Section remain required.
- **Confirm dialog:** Department / Program rows show the green target name when retargeted, else "Unchanged" (mirrors the existing Academic Year row).
- **Activity log metadata:** include `department_id`/`program_id` when set.

### 2. `hooks/use-learner-profiles.ts` — `usePromoteLearners`

Add optional `departmentId?` / `programId?` to the mutation input type and pass them to the service.

### 3. `lib/services/learner-profile-service.ts` — `bulkPromoteLearners`

Add `departmentId?` / `programId?` params (before `onProgress`; the hook is the only caller). When present, set them on `updateData` using the same conditional pattern as `academic_year_id`.

## Out of scope

Status Promotion tab, mixed-source promotion, Institution/Degree retargeting, any backend/RLS work.

## Verification

- `mcp__ide__getDiagnostics` clean on the 3 touched files.
- Manual: select a same-program cohort → Department/Program default to "Keep current"; picking a new Department re-scopes Program then Semester; submitting writes the new dept/program/semester/section; leaving them blank reproduces today's behavior exactly.
