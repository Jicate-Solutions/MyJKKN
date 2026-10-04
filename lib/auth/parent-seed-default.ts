/**
 * The starting password every parent account is seeded with
 * (scripts/seed-parent-accounts.mjs) until an admin resets it. It is a
 * published default, not a secret: the Parent User Data panel pre-fills it in
 * the Reset dialog. Used by the show-password route to tell "still on the
 * seed default" from "changed by parent".
 */
export const PARENT_SEED_DEFAULT_PASSWORD = 'JKKN@100';
