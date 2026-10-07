#!/usr/bin/env node
// Mutation controls for the "records and roles of people with admin powers"
// lane (migration 20271007170139 and the routes that enforce the same rules).
//
// Each entry removes or weakens ONE rule in a copy of the real file, the
// matching tests run, and at least one test must fail. A mutant that passes
// every test is a rule nothing proves. Files are restored byte for byte after
// every run (and on Ctrl-C); the script refuses to start on uncommitted edits
// to the files it mutates.
//
// The migration's drift check compares the body fingerprints of the functions
// it replaces with the ones it installs. A mutated body would make the second
// (re-run) apply abort, so the runner rewrites those fingerprints in the
// mutated copy, the same way the file's header documents them. The drift
// tests themselves are never weakened.
//
// Needs the local PostgreSQL 16 the pg test uses. Never connects anywhere else.
// Run:  node supabase/tests/staff-admin-powers/run-mutations.mjs [--only <id-prefix>]

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIG = 'supabase/migrations/20271007170139_staff_admin_records_super_admin_only.sql';
const PG = ['__tests__/staff/staff-admin-records-super-admin-only.pg.test.ts'];
const SETUP = 'supabase/setup/02_functions.sql';
const TS = [
  '__tests__/staff/staff-admin-powers-learner-paths.test.ts',
  '__tests__/staff/staff-admin-powers-small-writers.test.ts',
  '__tests__/staff/staff-admin-powers-write-paths.test.ts',
  '__tests__/staff/staff-form-changed-fields.test.ts',
  '__tests__/staff/staff-form-edit-sends-changed-fields.test.tsx',
  '__tests__/staff/staff-id-route-admin-records.test.ts',
  '__tests__/staff/staff-service-update-college-sync.test.ts',
  '__tests__/staff/learner-college-email-service-role-paths.test.ts',
  '__tests__/learners/profile-change-request-editable-fields.test.ts',
  '__tests__/learners/learner-edit-college-email-prelink.test.ts',
  '__tests__/learners/complete-onboarding-existing-account.test.ts',
  '__tests__/learners/enquiry-import-college-email.test.ts',
  '__tests__/courses/resend-credentials-email-backfill.test.ts',
  '__tests__/users/roles-create-scoped-trusted-names.test.ts',
];

// { id, find, replace, nth? }: `find` matches with any run of whitespace
// standing for any run of whitespace; it must match exactly once unless `nth`
// (0-based) picks an occurrence. `survives` marks a known equivalent mutant,
// with the reason; it is reported, never counted as caught.
const SQL = [
  // 0. drift check
  { id: 'drift.check', find: `IF NOT ((v.body_md5, v.definer, v.config) = (r.main_md5`, replace: `IF false AND NOT ((v.body_md5, v.definer, v.config) = (r.main_md5` },
  // 1. sync_staff_to_profiles
  { id: 'sync.relink-ignores-case', find: `OR lower(btrim(NEW.institution_email)) IS DISTINCT FROM lower(btrim(OLD.institution_email));`, replace: `OR NEW.institution_email IS DISTINCT FROM OLD.institution_email;` },
  { id: 'sync.unlinked-admin-email-untouched', find: `IF NOT relinked AND OLD.profile_id IS NULL AND public.fn_staff_link_has_admin_powers(NULL, NEW.institution_email) THEN`, replace: `IF false THEN` },
  { id: 'sync.full-copy-only-on-relink', find: `IF relinked THEN`, replace: `IF true THEN` },
  { id: 'sync.role-only-when-changed', find: `THEN NEW.role_key ELSE role END`, nth: 1, replace: `THEN NEW.role_key ELSE NEW.role_key END` },
  // round 15: production's rule, carried into the relink branch
  { id: 'sync.relink-role-only-when-changed', find: `THEN NEW.role_key ELSE role END`, nth: 0, replace: `THEN NEW.role_key ELSE NEW.role_key END` },
  { id: 'sync.relink-role-change-written', find: `v_role_changed := NEW.role_key IS DISTINCT FROM OLD.role_key;`, replace: `v_role_changed := false;` },
  { id: 'sync.new-row-role-written', find: `v_role_changed BOOLEAN := TG_OP = 'INSERT';`, replace: `v_role_changed BOOLEAN := false;` },
  { id: 'sync.college-only-when-changed', find: `THEN NEW.institution_id ELSE institution_id END`, replace: `THEN NEW.institution_id ELSE NEW.institution_id END` },
  { id: 'sync.active-only-when-changed', find: `ELSE is_active END,`, replace: `ELSE NEW.is_active END,` },
  { id: 'sync.login-only-when-changed', find: `ELSE is_login_disabled END,`, replace: `ELSE (NEW.login_enabled = false) END,` },
  { id: 'sync.unlinked-found-by-email-still-copies', find: `ELSIF (OLD.profile_id IS NULL OR existing_profile_id = OLD.profile_id)`, replace: `ELSIF (existing_profile_id = OLD.profile_id)` },
  { id: 'sync.phone-copied', find: `THEN NEW.phone ELSE phone_number END`, replace: `THEN phone_number ELSE phone_number END` },
  // 2. helpers
  { id: 'priv.trusted-names', find: `SELECT lower(btrim(coalesce(p_role_key, ''))) IN ('admin', 'administrator', 'super_admin')`, replace: `SELECT false` },
  { id: 'priv.flag', find: `WHERE r.role_key = p_role_key AND r.is_privileged);`, replace: `WHERE r.role_key = p_role_key AND false);` },
  { id: 'roleid.privileged', find: `WHERE r.id = p_role_id AND public.fn_staff_role_key_is_privileged(r.role_key)`, replace: `WHERE r.id = p_role_id AND false` },
  { id: 'link.super-flag', find: `AND ( coalesce(p.is_super_admin, false)`, replace: `AND ( false` },
  { id: 'link.profile-role', find: `OR public.fn_role_key_confers_admin_powers(p.role)`, replace: `OR false` },
  // round 15: the holder side reads the no-admin-powers list at every site
  { id: 'confers.profile-role', find: `OR public.fn_role_key_confers_admin_powers(p.role)`, replace: `OR public.fn_staff_role_key_is_privileged(p.role)` },
  { id: 'confers.user-roles', find: `AND public.fn_role_key_confers_admin_powers(r.role_key))`, replace: `AND public.fn_staff_role_key_is_privileged(r.role_key))` },
  { id: 'confers.persons-records', find: `WHERE public.fn_role_key_confers_admin_powers(s.role_key) AND (s.profile_id = p.id`, replace: `WHERE public.fn_staff_role_key_is_privileged(s.role_key) AND (s.profile_id = p.id` },
  { id: 'confers.unlinked-record', find: `WHERE public.fn_role_key_confers_admin_powers(s.role_key) AND nullif(btrim(p_institution_email), '') IS NOT NULL`, replace: `WHERE public.fn_staff_role_key_is_privileged(s.role_key) AND nullif(btrim(p_institution_email), '') IS NOT NULL` },
  { id: 'confers.record-own-role', find: `-- the staff record's own role public.fn_role_key_confers_admin_powers(s.role_key)`, replace: `-- the staff record's own role\n             public.fn_staff_role_key_is_privileged(s.role_key)` },
  { id: 'confers.privileged-first', find: `SELECT public.fn_staff_role_key_is_privileged(p_role_key) AND (`, replace: `SELECT true AND (` },
  { id: 'confers.trusted-names-win', find: `AND ( lower(btrim(coalesce(p_role_key, ''))) IN ('admin', 'administrator', 'super_admin') OR NOT EXISTS (`, replace: `AND ( false OR NOT EXISTS (` },
  { id: 'confers.list-read', find: `AND pp.value ? p_role_key));`, replace: `AND false));` },
  { id: 'confers.global-only', find: `AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND coalesce(pp.is_active, true)`, replace: `AND coalesce(pp.is_active, true)` },
  { id: 'confers.active-only', find: `AND coalesce(pp.is_active, true) AND jsonb_typeof`, replace: `AND true AND jsonb_typeof` },
  { id: 'confers.seed-guest', find: `'["guest"]'::jsonb`, replace: `'[]'::jsonb` },
  { id: 'policyguard.signed-in', find: `IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_super_admin(), false) THEN`, replace: `IF false THEN` },
  { id: 'policyguard.super-admin-passes', find: `IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_super_admin(), false) THEN`, replace: `IF auth.uid() IS NOT NULL THEN` },
  { id: 'policyguard.insert-and-update', find: `(TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = 'roles.without_admin_powers')`, replace: `(false)` },
  { id: 'policyguard.delete-and-update', find: `OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = 'roles.without_admin_powers')`, replace: `OR false` },
  { id: 'policyguard.other-rows-untouched', find: `RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; -- Any signed-in caller`, replace: `NULL; END IF; -- Any signed-in caller` },
  { id: 'link.user-roles', find: `WHERE ur.user_id = p.id`, replace: `WHERE false AND ur.user_id = p.id` },
  { id: 'link.persons-records', find: `AND (s.profile_id = p.id`, replace: `AND false AND (s.profile_id = p.id` },
  { id: 'link.email-any-case', find: `AND (lower(btrim(p.email)) = lower(btrim(p_institution_email))`, replace: `AND (p.email = p_institution_email` },
  { id: 'link.profile-email-trimmed', find: `AND (lower(btrim(p.email)) = lower(btrim(p_institution_email))`, replace: `AND (lower(p.email) = lower(btrim(p_institution_email))` },
  { id: 'link.record-on-sign-in-email', find: `OR lower(btrim(s.institution_email)) IN ( SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = p.id)`, replace: `OR false` },
  { id: 'link.sign-in-email', find: `WHERE lower(btrim(u.email)) = lower(btrim(p_institution_email))`, replace: `WHERE false` },
  { id: 'link.unlinked-admin-record', find: `AND nullif(btrim(p_institution_email), '') IS NOT NULL AND lower(btrim(s.institution_email)) = lower(btrim(p_institution_email))`, replace: `AND false` },
  { id: 'record.own-role', find: `-- the staff record's own role public.fn_role_key_confers_admin_powers(s.role_key)`, replace: `-- the staff record's own role\n             false` },
  { id: 'record.link', find: `OR public.fn_staff_link_has_admin_powers(s.profile_id, s.institution_email)`, replace: `OR false` },
  { id: 'callers.profile-link', find: `AND ( p_profile_id = auth.uid()`, replace: `AND ( false` },
  { id: 'callers.sign-in-email', find: `WHERE u.id = auth.uid() AND lower(btrim(u.email)) IN`, replace: `WHERE false AND lower(btrim(u.email)) IN` },
  { id: 'callers.profile-email', find: `WHERE pr.id = auth.uid() AND lower(btrim(pr.email)) IN`, replace: `WHERE false AND lower(btrim(pr.email)) IN` },
  // 3. staff guard
  { id: 'guard.super-admin-passes', find: `IF auth.uid() IS NULL OR public.is_super_admin() THEN`, replace: `IF auth.uid() IS NULL THEN` },
  { id: 'guard.definer-flows-pass', find: `IF current_user IN ('authenticated', 'anon') THEN`, replace: `IF true THEN` },
  { id: 'guard.delete-admin-record', find: `IF TG_OP = 'DELETE' THEN IF public.fn_staff_record_has_admin_powers(OLD.id) THEN`, replace: `IF TG_OP = 'DELETE' THEN IF false THEN` },
  { id: 'guard.edit-admin-record', find: `IF v_new IS DISTINCT FROM v_old AND public.fn_staff_record_has_admin_powers(OLD.id) THEN`, replace: `IF false THEN` },
  { id: 'guard.small-fields-allowed', find: `'profile_picture', 'phone', 'emergency_contact_phone',`, replace: `'emergency_contact_phone',` },
  { id: 'guard.blank-is-null-old', find: `WHERE value NOT IN ('null'::jsonb, '""'::jsonb);`, nth: 0, replace: `WHERE value <> 'null'::jsonb;` },
  { id: 'guard.blank-is-null-new', find: `WHERE value NOT IN ('null'::jsonb, '""'::jsonb);`, nth: 1, replace: `WHERE value <> 'null'::jsonb;` },
  { id: 'guard.insert-own-account', find: `IF public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN`, nth: 0, replace: `IF false THEN` },
  { id: 'guard.insert-own-personal-email', find: `IF public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN`, nth: 0, replace: `IF public.fn_staff_record_is_callers(NEW.profile_id, NULL, NEW.institution_email) THEN` },
  { id: 'guard.insert-points-at-admin', find: `IF public.fn_staff_link_has_admin_powers(NEW.profile_id, NEW.institution_email) THEN`, nth: 0, replace: `IF false THEN` },
  { id: 'guard.relink-ignores-case', find: `OR lower(btrim(NEW.institution_email)) IS DISTINCT FROM lower(btrim(OLD.institution_email)) OR lower(btrim(NEW.email))`, replace: `OR NEW.institution_email IS DISTINCT FROM OLD.institution_email OR lower(btrim(NEW.email))` },
  { id: 'guard.relink-own-account', find: `IF public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN`, nth: 1, replace: `IF false THEN` },
  { id: 'guard.relink-own-personal-email', find: `IF public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN`, nth: 1, replace: `IF public.fn_staff_record_is_callers(NEW.profile_id, NULL, NEW.institution_email) THEN` },
  { id: 'guard.relink-on-personal-email', find: `OR lower(btrim(NEW.email)) IS DISTINCT FROM lower(btrim(OLD.email)) THEN`, replace: `THEN` },
  { id: 'guard.move-own-record-away', find: `IF public.fn_staff_record_is_callers(OLD.profile_id, OLD.email, OLD.institution_email) THEN`, replace: `IF false THEN` },
  { id: 'guard.relink-points-at-admin', find: `IF public.fn_staff_link_has_admin_powers(NEW.profile_id, NEW.institution_email) THEN`, nth: 1, replace: `IF false THEN` },
  { id: 'guard.rename-cascade-exemption', find: `IF NOT EXISTS (SELECT 1 FROM public.custom_roles r WHERE r.role_key = OLD.role_key)`, replace: `IF false` },
  { id: 'guard.own-record-role-old', find: `IF public.fn_staff_record_is_callers(OLD.profile_id, OLD.email, OLD.institution_email) OR`, replace: `IF false OR` },
  { id: 'guard.own-record-role-new', find: `OR public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN`, replace: `OR false THEN` },
  { id: 'guard.role-change-permission', find: `IF NOT coalesce(public.user_has_permission('staff.role.change'), false) THEN`, replace: `IF false THEN` },
  { id: 'guard.privileged-taken-away', find: `IF public.fn_role_key_confers_admin_powers(OLD.role_key) THEN`, replace: `IF false THEN` },
  { id: 'guard.taken-away-is-holder-side', find: `IF public.fn_role_key_confers_admin_powers(OLD.role_key) THEN`, replace: `IF public.fn_staff_role_key_is_privileged(OLD.role_key) THEN` },
  { id: 'guard.privileged-given', find: `END IF; IF public.fn_staff_role_key_is_privileged(NEW.role_key) THEN`, replace: `END IF; IF false THEN` },
  { id: 'guard.privileged-on-create', find: `ELSIF public.fn_staff_role_key_is_privileged(NEW.role_key) THEN`, replace: `ELSIF false THEN` },
  // 4. profiles guard
  { id: 'profiles.super-admin-passes', find: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN`, nth: 0, replace: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') THEN` },
  { id: 'profiles.definer-flows-pass', find: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN`, nth: 0, replace: `IF auth.uid() IS NULL OR public.is_super_admin() THEN` },
  { id: 'profiles.delete', find: `IF TG_OP = 'DELETE' THEN IF public.fn_staff_link_has_admin_powers(OLD.id, NULL) THEN`, replace: `IF TG_OP = 'DELETE' THEN IF false THEN` },
  { id: 'profiles.insert-admin-email', find: `IF public.fn_staff_link_has_admin_powers(NULL, NEW.email) THEN`, nth: 0, replace: `IF false THEN` },
  { id: 'profiles.insert-staff-email', find: `IF public.fn_email_on_staff_record(NEW.email) THEN`, nth: 0, replace: `IF false THEN` },
  { id: 'profiles.own-email', find: `IF OLD.id = auth.uid() THEN`, replace: `IF false THEN` },
  { id: 'profiles.update-admin-email', find: `IF public.fn_staff_link_has_admin_powers(NULL, NEW.email) THEN`, nth: 1, replace: `IF false THEN` },
  { id: 'profiles.update-staff-email', find: `IF public.fn_email_on_staff_record(NEW.email) THEN`, nth: 1, replace: `IF false THEN` },
  { id: 'profiles.insert-super-flag', find: `IF coalesce(NEW.is_super_admin, false) OR public.fn_staff_role_key_is_privileged(NEW.role::text) THEN`, replace: `IF public.fn_staff_role_key_is_privileged(NEW.role::text) THEN` },
  { id: 'profiles.insert-privileged-role', find: `IF coalesce(NEW.is_super_admin, false) OR public.fn_staff_role_key_is_privileged(NEW.role::text) THEN`, replace: `IF coalesce(NEW.is_super_admin, false) THEN` },
  { id: 'profiles.own-college-or-learner', find: `IF OLD.id = auth.uid() AND (NEW.institution_id, NEW.learner_id)`, replace: `IF false AND (NEW.institution_id, NEW.learner_id)` },
  { id: 'profiles.own-college', find: `AND (NEW.institution_id, NEW.learner_id) IS DISTINCT FROM`, replace: `AND (OLD.institution_id, NEW.learner_id) IS DISTINCT FROM` },
  { id: 'profiles.own-learner-link', find: `AND (NEW.institution_id, NEW.learner_id) IS DISTINCT FROM`, replace: `AND (NEW.institution_id, OLD.learner_id) IS DISTINCT FROM` },
  { id: 'profiles.update-super-flag', find: `IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN`, replace: `IF false THEN` },
  { id: 'profiles.own-role', find: `IF OLD.id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN`, replace: `IF false THEN` },
  { id: 'profiles.cols-role-active', find: `IF (NEW.role, NEW.is_active,`, replace: `IF (OLD.role, OLD.is_active,` },
  { id: 'profiles.cols-login-college-email', find: `NEW.is_login_disabled, NEW.institution_id, NEW.email, NEW.learner_id`, replace: `OLD.is_login_disabled, OLD.institution_id, OLD.email, NEW.learner_id` },
  { id: 'profiles.cols-learner-external', find: `NEW.learner_id, NEW.is_external_participant) IS DISTINCT FROM`, replace: `OLD.learner_id, OLD.is_external_participant) IS DISTINCT FROM` },
  { id: 'profiles.update-gives-privileged', find: `IF (NEW.role IS DISTINCT FROM OLD.role AND public.fn_staff_role_key_is_privileged(NEW.role::text)) OR public.fn_staff_link_has_admin_powers(OLD.id, NULL) THEN`, replace: `IF public.fn_staff_link_has_admin_powers(OLD.id, NULL) THEN` },
  { id: 'profiles.update-of-admin', find: `AND public.fn_staff_role_key_is_privileged(NEW.role::text)) OR public.fn_staff_link_has_admin_powers(OLD.id, NULL) THEN`, replace: `AND public.fn_staff_role_key_is_privileged(NEW.role::text)) OR false THEN` },
  { id: 'profiles.unchanged-role-is-not-given', find: `(NEW.role IS DISTINCT FROM OLD.role AND public.fn_staff_role_key_is_privileged(NEW.role::text))`, replace: `(public.fn_staff_role_key_is_privileged(NEW.role::text))` },
  // 4. user_roles guard
  { id: 'userroles.super-admin-passes', find: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN`, nth: 1, replace: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') THEN` },
  { id: 'userroles.own-old', find: `v_touches := OLD.user_id = auth.uid();`, replace: `v_touches := false;` },
  { id: 'userroles.own-new', find: `v_touches := NEW.user_id = auth.uid();`, replace: `v_touches := false;` },
  { id: 'userroles.holder-old', find: `v_touches := public.fn_staff_link_has_admin_powers(OLD.user_id, NULL);`, replace: `v_touches := false;` },
  { id: 'userroles.privileged-role', find: `v_touches := public.fn_custom_role_is_privileged(NEW.role_id) OR`, replace: `v_touches := false OR` },
  { id: 'userroles.holder-new', find: `OR public.fn_staff_link_has_admin_powers(NEW.user_id, NULL);`, replace: `OR false;` },
  // 5. mirror and pre-registration
  { id: 'mirror.own', find: `IF NOT is_super_admin() AND p_profile_id = auth.uid() THEN`, replace: `IF false THEN` },
  { id: 'mirror.admin-target', find: `AND (fn_staff_link_has_admin_powers(p_profile_id, NULL) OR fn_staff_role_key_is_privileged(p_role_key)) THEN`, replace: `AND (false OR fn_staff_role_key_is_privileged(p_role_key)) THEN` },
  { id: 'mirror.privileged-role', find: `AND (fn_staff_link_has_admin_powers(p_profile_id, NULL) OR fn_staff_role_key_is_privileged(p_role_key)) THEN`, replace: `AND (fn_staff_link_has_admin_powers(p_profile_id, NULL) OR false) THEN` },
  { id: 'prereg.privileged-role', find: `IF NOT is_super_admin() AND fn_staff_role_key_is_privileged(profile_role) THEN`, replace: `IF false THEN` },
  { id: 'prereg.admin-email', find: `IF NOT is_super_admin() AND fn_staff_link_has_admin_powers(NULL, profile_email) THEN`, replace: `IF false THEN` },
  { id: 'prereg.exists-any-case', find: `WHERE lower(email) = lower(btrim(profile_email))`, replace: `WHERE email = profile_email` },
  // 6. identity refusal
  { id: 'identity.who-may-ask', find: `OR NOT (public.is_super_admin() OR public.is_admin() OR coalesce(public.user_has_permission('staff.edit'), false) OR coalesce(public.user_has_permission('staff.create'), false)) THEN`, replace: `OR false THEN` },
  { id: 'identity.same-people-is-no-change', find: `IF v_before @> v_after AND v_after @> v_before THEN`, replace: `IF false THEN` },
  { id: 'identity.self', find: `IF auth.uid() = ANY (v_before || v_after) THEN`, replace: `IF false THEN` },
  { id: 'identity.director', find: `IF v_listed THEN`, replace: `IF false THEN` },
  { id: 'identity.salary', find: `IF v_waiting THEN`, replace: `IF false THEN` },
  { id: 'identity.after-sign-in-email', find: `SELECT u.id FROM auth.users u WHERE lower(btrim(u.email)) IN (lower(btrim(p_email))`, replace: `SELECT u.id FROM auth.users u WHERE false AND lower(btrim(u.email)) IN (lower(btrim(p_email))` },
  { id: 'identity.after-profile-email', find: `SELECT pr.id FROM public.profiles pr WHERE lower(btrim(pr.email)) IN (lower(btrim(p_email))`, replace: `SELECT pr.id FROM public.profiles pr WHERE false AND lower(btrim(pr.email)) IN (lower(btrim(p_email))` },
  { id: 'identity.before-sign-in-email', find: `SELECT u.id FROM auth.users u WHERE lower(btrim(u.email)) IN (lower(btrim(v_row.email))`, replace: `SELECT u.id FROM auth.users u WHERE false AND lower(btrim(u.email)) IN (lower(btrim(v_row.email))` },
  // 7. learner email sync
  { id: 'learner.admin-email-refused', find: `IF public.fn_staff_link_has_admin_powers(NULL, new_email) THEN`, replace: `IF false THEN` },
  { id: 'learner.transfer-to-admin', find: `IF public.fn_staff_link_has_admin_powers(conflicting_profile_id, NULL) THEN`, replace: `IF false THEN`,
    survives: 'defence in depth, unreachable with the current check order: the conflicting profile is found by lower(btrim(email)) = new_email, which learner.admin-email-refused has already judged', kind: 'DEFENCE' },
  { id: 'learner.transfer-from-admin', find: `IF public.fn_staff_link_has_admin_powers(existing_profile_id, NULL) THEN`, nth: 0, replace: `IF false THEN` },
  { id: 'learner.linked-admin', find: `IF public.fn_staff_link_has_admin_powers(existing_profile_id, NULL) THEN`, nth: 1, replace: `IF false THEN` },
  { id: 'learner.orphan-admin', find: `IF public.fn_staff_link_has_admin_powers(existing_profile_id, NULL) THEN`, nth: 2, replace: `IF false THEN`,
    survives: 'defence in depth, unreachable with the current check order: the orphan profile is found by lower(btrim(email)) = new_email, which learner.admin-email-refused has already judged', kind: 'DEFENCE' },
  { id: 'learner.conflict-any-case', find: `WHERE lower(btrim(email)) = lower(btrim(new_email)) AND id != existing_profile_id`, replace: `WHERE email = new_email AND id != existing_profile_id` },
  { id: 'learner.orphan-any-case', find: `WHERE lower(btrim(email)) = lower(btrim(new_email)) AND learner_id IS NULL`, replace: `WHERE email = new_email AND learner_id IS NULL` },
  // 8. custom_roles guard and its helpers
  { id: 'roles.super-admin-passes', find: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN`, nth: 2, replace: `IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') THEN` },
  { id: 'roles.insert-flagged', find: `IF coalesce(NEW.is_privileged, false) OR public.fn_staff_role_key_is_privileged(NEW.role_key) THEN`, replace: `IF public.fn_staff_role_key_is_privileged(NEW.role_key) THEN` },
  { id: 'roles.insert-trusted-name', find: `IF coalesce(NEW.is_privileged, false) OR public.fn_staff_role_key_is_privileged(NEW.role_key) THEN`, replace: `IF coalesce(NEW.is_privileged, false) THEN` },
  { id: 'roles.old-flagged', find: `IF coalesce(OLD.is_privileged, false) OR public.fn_staff_role_key_is_privileged(OLD.role_key) THEN`, replace: `IF public.fn_staff_role_key_is_privileged(OLD.role_key) THEN`,
    survives: 'equivalent: fn_staff_role_key_is_privileged(OLD.role_key) reads the same is_privileged flag from the row being changed' },
  { id: 'roles.old-trusted-name', find: `IF coalesce(OLD.is_privileged, false) OR public.fn_staff_role_key_is_privileged(OLD.role_key) THEN`, replace: `IF coalesce(OLD.is_privileged, false) THEN` },
  { id: 'roles.caller-holds', find: `IF public.fn_caller_holds_role(OLD.id, OLD.role_key) THEN`, replace: `IF false THEN` },
  { id: 'roles.held-by-admin', find: `AND public.fn_role_held_by_admin_powers(OLD.id, OLD.role_key) THEN`, replace: `AND false THEN` },
  { id: 'roles.held-by-admin-on-delete', find: `IF (TG_OP = 'DELETE' OR NEW.role_key IS DISTINCT FROM OLD.role_key)`, replace: `IF (TG_OP = 'UPDATE' AND NEW.role_key IS DISTINCT FROM OLD.role_key)` },
  { id: 'roles.held-by-admin-on-rename', find: `IF (TG_OP = 'DELETE' OR NEW.role_key IS DISTINCT FROM OLD.role_key)`, replace: `IF (TG_OP = 'DELETE')` },
  { id: 'roles.flag-change', find: `IF NEW.is_privileged IS DISTINCT FROM OLD.is_privileged`, replace: `IF false` },
  { id: 'roles.rename-into-trusted', find: `OR public.fn_staff_role_key_is_privileged(NEW.role_key) THEN RAISE EXCEPTION 'Only a super admin can change a role`, nth: 1, replace: `OR false THEN RAISE EXCEPTION 'Only a super admin can change a role` },
  { id: 'holds.user-roles', find: `WHERE ur.user_id = auth.uid() AND ur.role_id = p_role_id`, replace: `WHERE false` },
  { id: 'holds.profile-role', find: `WHERE pr.id = auth.uid() AND pr.role = p_role_key`, replace: `WHERE false` },
  { id: 'held.records', find: `AND public.fn_staff_record_has_admin_powers(s.id))`, replace: `AND false)` },
  { id: 'held.user-roles', find: `AND public.fn_staff_link_has_admin_powers(ur.user_id, NULL))`, replace: `AND false)` },
  { id: 'held.profile-role', find: `AND public.fn_staff_link_has_admin_powers(pr.id, NULL));`, replace: `AND false);` },
  { id: 'staffemail.institution', find: `WHERE lower(btrim(s.institution_email)) = lower(btrim(p_email))`, replace: `WHERE false` },
  { id: 'staffemail.personal', find: `OR lower(btrim(s.email)) = lower(btrim(p_email)));`, replace: `OR false);` },
  // 9. course email backfill
  { id: 'backfill.who', find: `IF NOT (is_super_admin() OR coalesce(user_has_permission('courses.applications.decide'), false)) THEN`, replace: `IF false THEN` },
  { id: 'backfill.own-profile', find: `IF p_profile_id = auth.uid() THEN`, replace: `IF false THEN` },
  { id: 'backfill.super-admin-only-bypass', find: `IF NOT is_super_admin() THEN IF fn_staff_link_has_admin_powers(p_profile_id, NULL) THEN`, replace: `IF auth.uid() IS NOT NULL THEN IF fn_staff_link_has_admin_powers(p_profile_id, NULL) THEN` },
  { id: 'backfill.admin-target', find: `IF NOT is_super_admin() THEN IF fn_staff_link_has_admin_powers(p_profile_id, NULL) THEN`, replace: `IF NOT is_super_admin() THEN IF false THEN` },
  { id: 'backfill.admin-email', find: `IF fn_staff_link_has_admin_powers(NULL, v_email) THEN`, replace: `IF false THEN` },
  { id: 'backfill.staff-email', find: `IF fn_email_on_staff_record(v_email) THEN`, replace: `IF false THEN` },
  { id: 'backfill.other-profile', find: `AND lower(btrim(pr.email)) = v_email)`, replace: `AND false)` },
  { id: 'backfill.other-sign-in', find: `AND lower(btrim(u.email)) = v_email)`, replace: `AND false)` },
  // round 11
  { id: 'guard.own-college', find: `IF NEW.institution_id IS DISTINCT FROM OLD.institution_id AND (`, replace: `IF false AND (` },
  { id: 'guard.own-college-old', find: `AND (public.fn_staff_record_is_callers(OLD.profile_id, OLD.email, OLD.institution_email)`, replace: `AND (false` },
  { id: 'guard.own-college-new', find: `OR public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email)) THEN`, replace: `OR false) THEN` },
  { id: 'prereg.college-the-caller-may-reach', find: `IF profile_institution_id IS NOT NULL AND NOT public.role_has_institution_access(profile_institution_id) THEN`, replace: `IF false THEN` },
  { id: 'prereg.staff-email', find: `IF NOT is_super_admin() AND fn_email_on_staff_record(profile_email) THEN`, replace: `IF false THEN` },
  { id: 'learnerref.self-spares-super-admin', find: `IF auth.uid() IS NOT NULL AND NOT v_super AND (`, replace: `IF auth.uid() IS NOT NULL AND (` },
  { id: 'learnerref.asks-taken', find: `v_reason := public.fn_learner_email_taken(p_email, p_learner_id);`, replace: `v_reason := NULL;` },
  { id: 'learnerref.only-learner-writers-ask', find: `IF auth.uid() IS NOT NULL AND NOT ( v_super OR public.is_admin()`, replace: `IF false AND NOT ( v_super OR public.is_admin()` },
  { id: 'learnerref.the-learner-may-ask', find: `OR (p_learner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.learner_id = p_learner_id))) THEN`, replace: `) THEN` },
  { id: 'learnerref.permissions-all', find: `'all']) k`, replace: `'learners.none']) k` },
  { id: 'learnerref.onboarding-desk', find: `'learners.onboarding.edit', `, replace: `` },
  { id: 'learnerref.one-word-for-others', find: `IF v_reason IS NOT NULL AND auth.uid() IS NOT NULL AND NOT v_super THEN`, replace: `IF false THEN` },
  // round 12: the learner email sync refuses for every caller
  { id: 'learner.taken-checked', find: `CASE public.fn_learner_email_taken(new_email, NEW.id)`, replace: `CASE NULL::text` },
  { id: 'learner.taken-team-member', find: `WHEN 'team_member' THEN`, replace: `WHEN 'never_a' THEN` },
  { id: 'learner.taken-other-account', find: `WHEN 'other_account' THEN`, replace: `WHEN 'never_b' THEN` },
  { id: 'learnerref.self-sign-in', find: `WHERE u.id = auth.uid() AND lower(btrim(u.email)) = lower(btrim(p_email))`, replace: `WHERE false` },
  { id: 'learnerref.self-profile', find: `WHERE pr.id = auth.uid() AND lower(btrim(pr.email)) = lower(btrim(p_email))`, replace: `WHERE false` },
  { id: 'learnerref.team-member', find: `WHEN public.fn_email_on_staff_record(p_email) THEN 'team_member'`, replace: `WHEN false THEN 'team_member'` },
  { id: 'learnerref.other-account', find: `AND coalesce(pr.role::text, '') NOT IN ('student', 'guest')`, replace: `AND false` },
  { id: 'learnerref.guest-waits', find: `NOT IN ('student', 'guest')) THEN 'other_account'`, replace: `NOT IN ('student')) THEN 'other_account'` },
  { id: 'learnerref.this-learners-own', find: `AND NOT coalesce(pr.learner_id = p_learner_id, false)`, replace: `AND true` },
  // the setup copy must match the migration (a copy written as LANGUAGE sql over
  // a plpgsql body slipped through round 12)
  { id: 'setup.copy-matches', file: SETUP, find: `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$ DECLARE v_reason text;`, replace: `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$ DECLARE v_reason text;` },
  // 10. old bulk fixers
  { id: 'fixers.revoke', find: `EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', f);`, replace: `NULL;` },
  { id: 'fixers.service-role-grant', find: `EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);`, replace: `NULL;` },
].map((m) => ({ file: MIG, ...m, suite: 'pg' }));

// Route and service checks: every `await refuseX(` call in the lane's routes is
// skipped (`null && refuseX(`), and every super admin test answers no
// (`false && callerIsSuperAdmin(`). Generated from the files below, numbered by
// occurrence, so a new check is mutated without editing this list.
const ROUTE_FILES = [
  'app/api/staff/[id]/route.ts',
  'app/api/staff/route.ts',
  'app/api/staff/create-missing-profiles/route.ts',
  'app/api/learners/create-missing-profiles/route.ts',
  'app/api/users/route.ts',
  'app/api/users/[id]/route.ts',
  'app/api/users/[id]/roles/route.ts',
  'app/api/users/[id]/role/route.ts',
  'app/api/users/[id]/toggle-status/route.ts',
  'app/api/users/bulk-role-update/route.ts',
  'app/api/users/roles/assign/route.ts',
  'app/api/users/roles/create-scoped/route.ts',
  'app/api/users/manage-auth/route.ts',
  'lib/api/hr/recruitment/candidates/handlers/onboard-to-staff.ts',
  'lib/services/staff/bulk-staff-edit-service.ts',
  'lib/services/bulk-learner-upload-service.ts',
  'lib/services/bulk-learner-edit-service.ts',
];
const GENERATED = ROUTE_FILES.flatMap((file) => {
  const src = readFileSync(path.join(REPO, file), 'utf8');
  const out = [];
  for (const [re, make] of [
    [/await (refuse\w+)\(/g, (fn) => `null && ${fn}(`],
    [/await (callerIsSuperAdmin)\(/g, (fn) => `false && ${fn}(`],
  ]) {
    const seen = {};
    for (const m of src.matchAll(re)) {
      const k = m[1];
      const n = (seen[k] = (seen[k] ?? -1) + 1);
      out.push({ id: `${file.replace(/^(app\/api|lib)\//, '').replace(/\/route\.ts$|\.ts$/, '')}:${k}#${n}`, file, find: m[0], literal: true, nth: n, replace: make(k), suite: 'ts' });
    }
  }
  return out;
});

const MANUAL_TS = [
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.ask-yes-means-refuse', find: `return data === true ? { status: 403, error: message } : null;`, replace: `return null;` },
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.ask-fails-closed', find: `return { status: 500, error: CHECK_FAILED_MESSAGE };`, nth: 0, replace: `return null;` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.guard4-checks-each-row', find: `refuseIfLinksToAdmin(sessionClient, null, row.data.college_email ?? null, ADMIN_ROLE_MESSAGE)`, replace: `Promise.resolve(null)` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.guard4-for-super-admins-too', find: `const candidates = validRows`, replace: `const candidates = (await sessionClient.rpc('is_super_admin', {})).data === true ? [] : validRows` },
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.learner-email-answer-refuses', find: `return typeof data === 'string' ? { status: 403, error: LEARNER_EMAIL_MESSAGES[data] ?? CHECK_FAILED_MESSAGE } : null;`, replace: `return null;` },
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.learner-email-fails-closed', find: `console.error('[staff-admin-powers] fn_learner_email_refusal failed:', error); return { status: 500, error: CHECK_FAILED_MESSAGE };`, replace: `return null;` },
  { file: 'lib/services/bulk-learner-edit-service.ts', id: 'learner-edit.email-checked', find: `typeof updateData.college_email === 'string' &&`, replace: `false &&` },
  { file: 'lib/services/bulk-learner-edit-service.ts', id: 'learner-edit.unchanged-email-not-asked', find: `.trim().toLowerCase() !== String((learnerCheck`, replace: `.trim().toLowerCase() !== 'x' + String((learnerCheck` },
  { file: 'lib/services/bulk-learner-edit-service.ts', id: 'learner-edit.fails-closed', find: `: { status: 500, error: 'Could not check the college email. Nothing was changed for this row.' };`, replace: `: null;` },
  { file: 'app/api/staff/[id]/route.ts', id: 'staff-patch.own-college-message', find: `refuseIfCallersRecord(supabase, staffRecord, OWN_COLLEGE_MESSAGE)`, replace: `refuseIfCallersRecord(supabase, staffRecord)` },
  { file: 'types/learner-profile-change.ts', id: 'change-request.editable-list', find: `(key) => !(EDITABLE_PROFILE_FIELDS as readonly string[]).includes(key)`, replace: `() => false` },
  { file: 'app/api/learner-profile/change-requests/route.ts', id: 'change-request.route-refuses', find: `if (disallowed.length > 0) {`, replace: `if (false) {` },
  { file: 'lib/services/learner-profile-change-service.ts', id: 'change-request.create-refuses', find: `if (disallowed.length > 0) {`, nth: 0, replace: `if (false) {` },
  { file: 'lib/services/learner-profile-change-service.ts', id: 'change-request.approve-refuses', find: `if (disallowed.length > 0) {`, nth: 1, replace: `if (false) {` },
  { file: 'lib/services/learner-profile-service.ts', id: 'learner-edit.refuses-before-prelink', find: `if (emailRefusal) {`, replace: `if (false) {` },
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.learner-emails-report-row', find: `if (refusal) out.push({ row: r.row, error: refusal.error });`, replace: `` },
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.learner-emails-admin-first', find: `(await refuseIfLinksToAdmin(client, null, r.email, ADMIN_ROLE_MESSAGE)) ??`, replace: `null ??` },
  { file: 'app/api/learners/enquiries/import/route.ts', id: 'enquiry-import.checks-emails', find: `if (emailRefusals.length > 0) {`, replace: `if (false) {` },
  { file: 'app/api/learners/complete-onboarding/route.ts', id: 'onboarding.refuses-taken-email', find: `if (adminCheck.data === true || takenCheck.data) {`, replace: `if (false) {` },
  { file: 'app/api/learners/complete-onboarding/route.ts', id: 'onboarding.refuses-admin-email', find: `if (adminCheck.data === true || takenCheck.data) {`, replace: `if (takenCheck.data) {` },
  { file: 'app/api/learners/complete-onboarding/route.ts', id: 'onboarding.fails-closed', find: `if (adminCheck.error || takenCheck.error) {`, replace: `if (false) {` },
  { file: 'app/api/learners/complete-onboarding/route.ts', id: 'onboarding.reuses-only-orphans', find: `if (ownedError || ownedProfile) {`, replace: `if (ownedError) {` },
  { file: 'lib/services/staff/staff-admin-powers.ts', id: 'helpers.learner-email-one-word-message', find: `refused: 'This college email cannot be a learner`, replace: `refused_x: 'This college email cannot be a learner` },
  { file: 'lib/learners/profile-change-diff.ts', id: 'change-diff.editable-only', find: `if (!editable.includes(key)) continue;`, replace: `` },
  { file: 'lib/services/learner-profile-service.ts', id: 'learner-edit.only-changed-email-checked', find: `if (dto.college_email && collegeEmailChanged) {`, replace: `if (dto.college_email) {` },
  { file: 'lib/services/learner-profile-service.ts', id: 'learner-edit.change-ignores-case', find: `String(dto.college_email).trim().toLowerCase() !==`, replace: `String(dto.college_email) !==` },
  { file: 'app/(routes)/staff/list/_components/staff-form.tsx', id: 'staff-form.extended-profile-not-dirty-on-load', find: `shouldDirty: !isEditing || form.getFieldState('category_id').isDirty`, replace: `shouldDirty: true` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.existing-learner-keeps-email', find: `: alreadyLinked(String(row.data.college_email ?? '').trim().toLowerCase())`, replace: `: false` },
  // round 15: the skip holds only when the email's profiles are this learner's
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.skip-only-when-linked', find: `return !!learnerId && linked.length > 0 && linked.every((id) => id === learnerId);`, replace: `return !!learnerId;` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.skip-needs-a-profile', find: `return !!learnerId && linked.length > 0 && linked.every((id) => id === learnerId);`, replace: `return !!learnerId && linked.every((id) => id === learnerId);` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.skip-needs-every-profile', find: `return !!learnerId && linked.length > 0 && linked.every((id) => id === learnerId);`, replace: `return !!learnerId && linked.some((id) => id === learnerId);` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.own-email-never-skipped', find: `if (userId && p.id === userId) ownEmails.add(key);`, replace: `` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.own-email-super-admin-passes', find: `&& !uploaderIsSuperAdmin`, replace: `` },
  { file: 'lib/services/bulk-learner-upload-service.ts', id: 'learner-upload.refusal-names-the-learner', find: `existingLearnerIds.get(String(row.data.college_email ?? '').trim().toLowerCase()) ?? null))`, replace: `null))` },
  { file: 'lib/services/staff/staff-service.ts', id: 'staff-service.college-by-profile-id', find: `.eq('id', linkedProfileId);`, replace: `.eq('email', institutionEmail);` },
  { file: 'lib/services/staff/staff-service.ts', id: 'staff-service.college-only-on-real-move', find: `data.institution_id !== currentStaff.institution_id &&`, replace: `true &&` },
  { file: 'app/api/courses/enrollments/[id]/resend-credentials/route.ts', id: 'resend.user-client', find: `await supabase.rpc( 'fn_course_backfill_participant_email'`, replace: `await admin.rpc( 'fn_course_backfill_participant_email'` },
  { file: 'app/api/courses/enrollments/[id]/resend-credentials/route.ts', id: 'resend.refusal-stops', find: `if (backfillError.code === 'P0001' || backfillError.code === '42501') {`, replace: `if (false) {` },
  { file: 'app/(routes)/staff/list/_components/staff-form-changed-fields.ts', id: 'form.changed-fields-only', find: `if (!isDirty(value)) continue;`, replace: `` },
  { file: 'app/(routes)/staff/list/_components/staff-form-changed-fields.ts', id: 'form.college-move-sends-department', find: `institution_id: ['institution_id', 'department_id']`, replace: `institution_id: ['institution_id']` },
].map((m) => ({ ...m, suite: 'ts' }));

const ALL = [...SQL, ...GENERATED, ...MANUAL_TS];

// ---------------------------------------------------------------------------
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const list = only ? ALL.filter((m) => m.id.startsWith(only)) : ALL;

const files = [...new Set(list.map((m) => m.file))];
try {
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...files], { cwd: REPO });
} catch {
  console.error('Refusing to start: uncommitted edits in a file this script mutates. Commit first.');
  process.exit(2);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = (m) => new RegExp(m.literal ? escape(m.find) : escape(m.find).replace(/\s+/g, '\\s+'), 'g');

function mutate(src, m) {
  const hits = [...src.matchAll(pattern(m))];
  if (m.nth === undefined && hits.length !== 1) throw new Error(`${m.id}: find matched ${hits.length} times, expected 1`);
  const hit = hits[m.nth ?? 0];
  if (!hit) throw new Error(`${m.id}: occurrence ${m.nth} not found (${hits.length} matches)`);
  return src.slice(0, hit.index) + m.replace + src.slice(hit.index + hit[0].length);
}

// Rewrite the "installs" fingerprints so the re-run apply accepts the mutant.
const REPLACED = ['sync_staff_to_profiles', 'fn_staff_guard_role_key', 'mirror_staff_role_to_user_roles',
  'create_preregistered_profile', 'sync_learner_email_to_profile', 'fn_course_backfill_participant_email'];
function refingerprint(sql) {
  for (const fn of REPLACED) {
    const body = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\bAS (\\$\\w*\\$)([\\s\\S]*?)\\1`))[2];
    const md5 = createHash('md5').update(body.replace(/\r/g, '').replace(/^[ \t\n]+|[ \t\n]+$/g, '')).digest('hex');
    sql = sql.replace(new RegExp(`(\\('public\\.${fn}\\([^']*',\\n\\s*'[0-9a-f]{32}'[^\\n]*\\n\\s*')[0-9a-f]{32}`), `$1${md5}`);
    // and the header's "installs" line, which the pg test also compares
    const start = sql.indexOf('The ones this file installs');
    const end = sql.indexOf('Read them with:', start);
    const at = sql.indexOf(`${fn}(`, start);
    if (at > start && at < end) {
      const k = sql.indexOf('body md5 ', at) + 'body md5 '.length;
      sql = sql.slice(0, k) + md5 + sql.slice(k + 32);
    }
  }
  return sql;
}

const work = mkdtempSync(path.join(tmpdir(), 'admin-powers-mut-'));
let child = null;
async function runSuite(suite, checkSetupCopy = false) {
  const out = path.join(work, 'r.json');
  rmSync(out, { force: true });
  await new Promise((resolve) => {
    child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...(suite === 'pg' ? PG : TS),
      '--reporter=json', `--outputFile=${out}`], {
      cwd: REPO, stdio: 'ignore',
      // a mutant of the migration alone must be caught by behaviour, not by the
      // setup copy now differing (the pg test skips that block when this is set)
      env: checkSetupCopy ? process.env : { ...process.env, STAFF_ADMIN_MUTATION_RUN: '1' },
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 600_000);
    child.on('exit', () => { clearTimeout(timer); child = null; resolve(); });
  });
  let r;
  try { r = JSON.parse(readFileSync(out, 'utf8')); } catch { return { failed: [], broken: 'no report' }; }
  const failed = r.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed')
    .map((a) => ({ name: a.fullName, msg: (a.failureMessages ?? []).join(' ').slice(0, 300) })));
  // A file that failed with no failing test (a beforeAll error leaves its
  // tests skipped) or that could not load.
  const fileErr = r.testResults
    .filter((f) => f.status === 'failed' && !f.assertionResults.some((a) => a.status === 'failed'))
    .map((f) => f.message || 'file failed with no failing test');
  // A mutant that breaks the file itself (setup fails) proves nothing.
  const broken = fileErr.length ? fileErr.join(' ').slice(0, 300)
    : failed.length && failed.every((f) => /failed on run|Local PostgreSQL|SyntaxError|Transform failed/.test(f.msg)) ? failed[0].msg : null;
  return { failed, broken };
}

const originals = new Map(files.map((f) => [f, readFileSync(path.join(REPO, f), 'utf8')]));
const restoreAll = () => { for (const [f, s] of originals) writeFileSync(path.join(REPO, f), s); };
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { child?.kill('SIGKILL'); restoreAll(); rmSync(work, { recursive: true, force: true }); process.exit(130); });
}

console.log(`baseline: pg + ts suites must pass on the real files`);
for (const s of new Set(list.map((m) => m.suite))) {
  const b = await runSuite(s);
  if (b.failed.length || b.broken) { console.error(`baseline ${s} is not green:`, b.broken ?? b.failed.map((f) => f.name)); restoreAll(); process.exit(2); }
}

const rows = [];
for (const m of list) {
  const orig = originals.get(m.file);
  let status, detail = '';
  try {
    let src = mutate(orig, m);
    if (m.file === MIG) src = refingerprint(src);
    writeFileSync(path.join(REPO, m.file), src);
    const r = await runSuite(m.suite, m.file === SETUP);
    if (r.broken) { status = 'BROKEN'; detail = r.broken; }
    else if (r.failed.length) { status = m.survives ? 'CAUGHT (marked unreachable)' : 'CAUGHT'; detail = r.failed[0].name; }
    else { status = m.survives ? (m.kind ?? 'EQUIVALENT') : 'SURVIVED'; detail = m.survives ?? ''; }
  } catch (e) {
    status = 'NOMATCH'; detail = String(e.message);
  } finally {
    writeFileSync(path.join(REPO, m.file), orig);
  }
  rows.push({ id: m.id, status, detail });
  console.log(`${status.padEnd(10)} ${m.id}${detail ? `  — ${detail.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
}
restoreAll();
rmSync(work, { recursive: true, force: true });
try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...files], { cwd: REPO }); }
catch { console.error('WARNING: a mutated file differs from HEAD after restore'); process.exit(3); }

const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n${count('CAUGHT')} caught, ${count('SURVIVED')} survived, ${count('EQUIVALENT')} equivalent, ${count('DEFENCE')} defence in depth (unreachable), ${count('UNTESTED')} untested (named), ${count('BROKEN')} broken, ${count('NOMATCH')} no match — of ${rows.length}`);
process.exit(count('SURVIVED') || count('BROKEN') || count('NOMATCH') ? 1 : 0);
