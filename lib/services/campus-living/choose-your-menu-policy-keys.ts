/**
 * Choose Your Menu policy-key constants (Choose Your Menu P0b, 2026-06-11).
 *
 * These 9 keys are the contract with the `mess.choose.*` platform_policies rows
 * seeded by the P0 substrate migration
 * (supabase/migrations/20260611230000_choose_your_menu_p0_substrate.sql).
 * Spec: specs/choose-your-menu-platform-spec-2026-06-11.md.
 *
 * "Choose Your Menu" is an OPTIONAL engagement layer over the org-wide default
 * mess menu (tier × gender), drawing from mess_menu_item_library (332 dishes).
 * Three modes — personalization (swap a meal), voting (thumbs up/down dishes),
 * and special-day (festival menu proposals) — each super-admin-toggleable per
 * tier via these config rows. The whole feature ships DARK
 * (master_enabled = false); the super-admin turns it on from the settings UI
 * with zero deploys — the next page load reflects every change because the RPCs
 * read these rows live.
 *
 * Keep these strings in sync with the migration — they are the source of truth
 * the runtime reads.
 */
export const CHOOSE_MENU_POLICY_KEYS = {
  /** Master kill-switch for the whole Choose Your Menu feature (boolean). */
  MASTER_ENABLED: 'mess.choose.master_enabled',
  /**
   * Mess plans whose residents can pre-pick meal alternatives (Mode A
   * personalization) — jsonb array of plan keys, e.g. ["premium"].
   * [] = personalization off.
   */
  PERSONALIZATION_ENABLED_TIERS: 'mess.choose.personalization.enabled_tiers',
  /** How many library alternatives offered per swappable meal (number). */
  PERSONALIZATION_OPTIONS_PER_MEAL: 'mess.choose.personalization.options_per_meal',
  /** Hours before a meal that a resident can still change their pick (number). */
  PERSONALIZATION_CUTOFF_HOURS: 'mess.choose.personalization.cutoff_hours',
  /**
   * Tiers whose residents can vote dishes up/down (Mode B voting) — jsonb
   * array of tier_key strings. [] = voting off.
   */
  VOTING_ENABLED_TIERS: 'mess.choose.voting.enabled_tiers',
  /** Special-day / festival menu proposals (Mode C) on/off (boolean). */
  SPECIAL_DAY_ENABLED: 'mess.choose.special_day.enabled',
  /**
   * Roles allowed to propose special-day menus — jsonb array of role strings,
   * e.g. ["warden","chief_warden"]. Read-only in P0b (editable in a later PR).
   */
  SPECIAL_DAY_PROPOSER_ROLES: 'mess.choose.special_day.proposer_roles',
  /**
   * Show residents the live tally on their own choices/votes — the return-arc
   * (boolean).
   */
  FEEDBACK_LIVE_COUNTS: 'mess.choose.feedback.live_counts',
  /**
   * Notify a resident when a dish they backed gets scheduled onto the menu
   * (boolean).
   */
  FEEDBACK_RECOGNITION: 'mess.choose.feedback.recognition',
} as const;

export type ChooseMenuPolicyKey =
  (typeof CHOOSE_MENU_POLICY_KEYS)[keyof typeof CHOOSE_MENU_POLICY_KEYS];

/**
 * The mess-plan ladder = mess_categories names (Classic | Premium), lowercased.
 * Director decision 2026-06-12: menu + engagement tiers follow the MESS PLAN a
 * resident pays for (mess_categories / learners_profiles.mess_category_id),
 * NOT the hostel room tier — a standard-room resident can buy the Premium mess.
 */
export const CHOOSE_MENU_TIERS = [
  { key: 'classic', label: 'Classic' },
  { key: 'premium', label: 'Premium' },
] as const;

export type ChooseMenuTierKey = (typeof CHOOSE_MENU_TIERS)[number]['key'];
