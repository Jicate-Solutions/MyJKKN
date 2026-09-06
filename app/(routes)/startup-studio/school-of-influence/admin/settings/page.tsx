// ===========================================================================
// /startup-studio/school-of-influence/admin/settings
// School of Influence — Director controls (spec §7, section S2)
// ===========================================================================
// Edits the `soi.*` rows in `platform_policies` at scope_type='cohort', either
// programme-wide (the value every batch inherits) or for one batch. Both halves
// of that ladder are seeded and resolved by section S1
// (PR #2679, feat/soi-config-substrate) — this page is only the write side.
//
// REUSES the existing policy infrastructure rather than restating it:
//   * PolicyPageShell (lib/admin/policy-shell) — gate + header + explainer, the
//     same wrapper the counselor / lead-stages policy pages use.
//   * CascadePreview (components/shared/cascade-preview) — the confirm-with-
//     consequences panel, opened before every save.
//   * The five widget components shared with the PDE Clinical Reasoning and
//     RCLTP policy editors, dispatched on each row's own `ui_widget`.
//
// Two policy-shell primitives were considered and deliberately NOT used:
//   * CascadeStepList is Shape A — CRUD over ORDERED rule rows with scope
//     precedence between them. These settings are independent of one another;
//     there is no first-match-wins ordering to render.
//   * SettingsPanel is Shape B and closer, but it takes a STATIC field schema
//     declared in TypeScript. The requirement here is the opposite: be generic
//     over `ui_widget` / `ui_options` / `ui_consequence` / `ui_cascade` so a
//     policy row added in SQL needs no code change. It also has no multi-select
//     control, no per-row draft/publish, and no way to express "inherited from
//     the programme default" versus "set for this batch" — the distinction this
//     screen exists to make.
//
// PERMISSION: `startup_studio.school_of_influence.configure`, registered in
// lib/constants/permissions.ts so Role Management can actually grant it, and
// mapped in MENU_PERMISSIONS so the nav chip and the page gate agree. Super
// admins bypass both. A denial renders an explicit message naming who to
// contact — never a silent redirect (CLAUDE.md rule 27).
// ===========================================================================

import { PolicyPageShell } from '@/lib/admin/policy-shell';

import { SoiSettingsEditor } from './_components/soi-settings-editor';

export const navMeta = {
  label: 'School of Influencer Settings',
  icon: 'SlidersHorizontal',
} as const;

const DENIED = (
  <div className="space-y-3 rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
    <p className="font-medium text-foreground">
      You do not have access to the School of Influencer settings.
    </p>
    <p>
      These settings decide who may apply to the programme, how big a batch can get,
      what happens when one fills up, and when someone who has gone quiet is reminded
      or removed. Changing them changes the programme for every applicant and member,
      so the controls are limited to the Startup Studio programme owners.
    </p>
    <p>
      If you need to change something here, ask a super administrator, or the Startup
      Studio programme owner, to grant you{' '}
      <code>startup_studio.school_of_influence.configure</code> in Role Management.
    </p>
  </div>
);

export default function SchoolOfInfluenceSettingsPage() {
  return (
    <PolicyPageShell
      title="School of Influencer — Settings"
      permissionKey="startup_studio.school_of_influence.configure"
      permissionDeniedMessage={DENIED}
      explainer={
        <div className="space-y-2">
          <p>
            Everything below is a live setting, not a code change. Save one and it is in
            force straight away — no deploy, no developer.
          </p>
          <p>
            Each setting exists at two levels. The{' '}
            <strong className="text-foreground">programme-wide</strong> value is what
            every batch follows. Pick a batch from the list to give just that batch its
            own value; the rest keep following the programme-wide one until you change
            it. A batch can always be put back on the default.
          </p>
          <p>
            Before anything is saved you are shown, in plain English, what the setting
            does and what else moves as a result. Nothing is written until you confirm on
            that panel.
          </p>
        </div>
      }
    >
      <SoiSettingsEditor />
    </PolicyPageShell>
  );
}
