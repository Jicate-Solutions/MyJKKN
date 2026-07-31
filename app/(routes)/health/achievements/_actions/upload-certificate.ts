'use server';

// app/(routes)/health/achievements/_actions/upload-certificate.ts
// ============================================================================
// Attach a certificate scan to ONE achievement — for a caller who is allowed to
// attach it to THAT achievement, and for nobody else.
//
// WHAT WAS WRONG (round 2 of PR #2650, found by adversarial review)
//   The previous cut of this action AUTHENTICATED and never AUTHORIZED. Its only
//   check was `if (!user) return …` — and it then wrote with the service-role
//   client, deliberately bypassing the storage RLS that refuses learner uploads.
//   Net effect: any of the 7,225 authenticated profiles on the platform could
//   write files into the institution's cdc-docs bucket. Size and MIME were
//   capped; nothing established that the caller had any business uploading at
//   all. Reaching for the service-role client to get past a policy that was
//   doing its job is what turned a refused upload into an open one.
//
// THE GATE NOW (established BEFORE any privileged write)
//   The caller must be one of:
//     * the LEARNER who owns the achievement (profiles.learner_id = the row's
//       learner_id), or
//     * the IQAC / accreditation side — user_has_permission(
//       'accreditation.certificates.manage'), the same key that verifies a row,
//       or
//     * the standard is_super_admin() / is_admin() bypass.
//   Signed-in alone is NOT authorization. Every decision runs on the cookie-bound
//   session client, so the identity is auth.uid() and never anything the caller
//   sent. The only argument the caller supplies is the id of the ROW being
//   attached to; the row then decides whose rule applies.
//
// THE PATH IS DERIVED, NEVER ACCEPTED
//   sports-achievement-certificates/<row.learner_id>/<achievementId>/<ts>-<name>
//   Every segment comes from the authorized row, not from the client. The
//   original filename is the only client-influenced part and is reduced to
//   [A-Za-z0-9._-], so it cannot introduce a '/' and cannot become a bare '..'
//   segment (it is always prefixed with a timestamp). upsert:false, so an upload
//   can never overwrite an existing object — one learner cannot land on, or
//   clobber, another learner's path.
//
// WHY THE SERVICE-ROLE CLIENT IS STILL HERE — AND HOW IT RETIRES
//   The right shape is the session client plus a storage policy that lets a
//   learner write only their own path. That policy is written, in
//   supabase/migrations/20260808105500_health_sports_certificate_visibility.sql
//   (cdc_docs_write_sports_certificate + fn_may_attach_learner_certificate) —
//   but migrations in this repo are Director-gated FILES that merge and deploy
//   never apply. Measured on production: cdc_docs_write is
//   WITH CHECK (bucket_id = 'cdc-docs' AND is_cdc_staff()), so a learner session
//   uploading today is refused outright ("new row violates row-level security
//   policy"). Session-client-only would therefore ship a dead button for exactly
//   the people this feature is for.
//   So this action ATTEMPTS THE SESSION CLIENT FIRST and only falls back to the
//   service-role client when storage refuses it — after the gate above has
//   already passed. The day the Director applies the migration, the first attempt
//   starts succeeding and the privileged path stops being taken at all.
//
// A VERIFIED ROW IS TAMPER-EVIDENT (round 4)
//   The gate above establishes WHO may attach. It said nothing about WHEN, and
//   that was the remaining hole: once past it this action wrote certificate_url
//   unconditionally, with no `verified` check anywhere. So a learner could
//   attach a SECOND file to a row the IQAC side had already ticked, and the tick
//   would stand over a document no reviewer ever opened. The whole value of that
//   tick is that an external accreditation reviewer can trust it, so a silent
//   swap underneath it is the one failure that makes the evidence worthless.
//
//   Two different answers, because the two callers are different:
//     * NOT the IQAC side (i.e. the owning learner) attaching to an
//       ALREADY-VERIFIED row  ->  REFUSED outright. A learner has no business
//       changing evidence after it has been reviewed; the honest route is to ask
//       IQAC to un-verify. Refusing keeps the reviewer's decision intact, which
//       silently resetting the tick would not — that would hand the learner a
//       way to clear an inconvenient verification whenever they liked, and it
//       would withdraw the row's NAAC 8.3 mapping as a side effect.
//     * The IQAC side replacing the file  ->  ALLOWED, and the verification is
//       RESET to false with verified_by cleared, so the new document has to be
//       re-reviewed. A tick means "a reviewer looked at THIS document"; it
//       cannot outlive the document.
//
//   The reset is written here explicitly rather than left to the database,
//   because the matching trigger lives in the Director-gated migration
//   20260808110100 and is not applied yet — without this the tick would survive
//   an IQAC replacement until someone applies it. Once applied,
//   trg_hsa_unverify_on_certificate_change enforces the same invariant for ANY
//   writer including the service-role client, so this becomes the friendly
//   message and the trigger becomes the guarantee.
//
// WHY A PATH AND NOT A SIGNED URL
//   certificate_url holds the storage PATH. The first cut stored a ONE-YEAR
//   signed URL, which is a bearer token: whoever held the string opened the
//   document. A path cannot be redeemed on its own, and it does not expire — so
//   the evidence outlives a five-year NAAC cycle while each viewing does not.
//   Links are minted per view, for five minutes, by _actions/certificate-link.ts
//   after re-checking the D7 visibility rule.
//
//   HONEST STATUS, NOT A PROMISE: a path is inert only once the row and the
//   bucket stop handing it out. Both of those doors are closed by the SAME
//   UNAPPLIED migration. Until a Director applies it, production still carries
//   health_sports_achievements_public = (verified = true) and cdc_docs_read =
//   (bucket_id = 'cdc-docs' AND auth.uid() IS NOT NULL) — re-read live on
//   2026-07-30 — so any signed-in caller can still read a verified row and list
//   the bucket. Merging this PR does NOT deliver the restricted visibility; it
//   removes the bearer token and ships the gate, and the migration completes it.
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const STORAGE_BUCKET = 'cdc-docs';
const PATH_PREFIX = 'sports-achievement-certificates';
const MAX_BYTES = 5 * 1024 * 1024;
const ATTACH_PERMISSION = 'accreditation.certificates.manage';
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

export interface UploadCertificateResult {
  ok: boolean;
  error?: string;
}

/**
 * May the current caller attach a certificate to this achievement? Owner, the
 * IQAC / accreditation side, or the admin bypass — evaluated on the session
 * client so every answer is about auth.uid().
 *
 * Returns WHICH branch admitted them, not just whether one did: replacing the
 * evidence on an already-verified row is allowed for the accreditation side and
 * refused for the learner, so the caller of this helper needs to tell them
 * apart.
 */
async function mayAttachToAchievement(
  learnerId: string,
): Promise<{ may: boolean; isAccreditation: boolean }> {
  const denied = { may: false, isAccreditation: false };

  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user || !learnerId) return denied;

  const [{ data: isSuperAdmin }, { data: isAdmin }] = await Promise.all([
    session.rpc('is_super_admin'),
    session.rpc('is_admin'),
  ]);
  if (Boolean(isSuperAdmin) || Boolean(isAdmin)) {
    return { may: true, isAccreditation: true };
  }

  // The permission is read before the ownership check, not after: an IQAC
  // officer who also happens to own the row must still be recognised as the
  // accreditation side, or an ownership match would shadow their key.
  const { data: hasPerm } = await session.rpc('user_has_permission', {
    permission_name: ATTACH_PERMISSION,
  });
  if (Boolean(hasPerm)) return { may: true, isAccreditation: true };

  const { data: profile } = await (session as any)
    .from('profiles')
    .select('learner_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.learner_id && profile.learner_id === learnerId) {
    return { may: true, isAccreditation: false };
  }

  return denied;
}

export async function uploadCertificate(
  formData: FormData,
): Promise<UploadCertificateResult> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const achievementId = String(formData.get('achievementId') ?? '').trim();
  if (!achievementId) {
    return { ok: false, error: 'An achievement id is required.' };
  }

  // The row first: it names the learner whose rule applies, and it is what the
  // path is derived from. Read privileged on purpose — an IQAC officer cannot
  // see somebody else's unverified row through their own session.
  const admin = createServiceRoleClient();
  const { data: row, error: readErr } = await (admin as any)
    .from('health_sports_achievements')
    .select('id, learner_id, verified')
    .eq('id', achievementId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, error: `Could not load the achievement: ${readErr.message}` };
  }
  if (!row) return { ok: false, error: 'That achievement no longer exists.' };

  const access = await mayAttachToAchievement(row.learner_id);
  if (!access.may) {
    return {
      ok: false,
      error:
        'You cannot attach a certificate to this achievement. Only the learner it belongs to, or the accreditation / IQAC team, can add evidence to it.',
    };
  }

  // Tamper-evidence, before a single byte is written. A row IQAC has already
  // ticked is reviewed evidence, not a draft.
  const wasVerified = Boolean(row.verified);
  if (wasVerified && !access.isAccreditation) {
    return {
      ok: false,
      error:
        'This achievement has already been verified by the accreditation / IQAC team, so its certificate cannot be replaced. Ask them to un-verify it first if the document needs to change.',
    };
  }

  // Duck-typed rather than `instanceof File` so this holds across runtimes.
  const file = formData.get('file') as {
    name?: string;
    size?: number;
    type?: string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  } | null;
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { ok: false, error: 'No file received.' };
  }
  if ((file.size ?? 0) === 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if ((file.size ?? 0) > MAX_BYTES) {
    return { ok: false, error: 'Certificate must be 5 MB or smaller.' };
  }
  if (!ALLOWED_MIME.includes(file.type ?? '')) {
    return { ok: false, error: 'Upload a PDF, JPG, PNG or WebP file.' };
  }

  const safeName = (file.name ?? 'certificate')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
  const path = `${PATH_PREFIX}/${row.learner_id}/${achievementId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const options = {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  };

  // Least privilege first. Once the storage policy in migration
  // 20260808110000 is applied, this succeeds and the fallback below is dead
  // code that never runs.
  const { error: sessionErr } = await session.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, options);

  if (sessionErr) {
    const { error: adminErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, options);
    if (adminErr) {
      return { ok: false, error: `Upload failed: ${adminErr.message}` };
    }
  }

  // The pointer is written here, not handed back to the browser: the caller has
  // already been authorized for this exact row, and nothing that lands in
  // certificate_url should have to travel through a client to get there.
  //
  // Reaching this line on a verified row means the caller IS the accreditation
  // side (the branch above refused everyone else), so the replacement stands —
  // but the tick does not survive it. Migration 20260808110100 makes the same
  // reset unbypassable in the database; until it is applied this is what keeps
  // a verified row honest.
  //
  // The reset is UNCONDITIONAL, deliberately, and not driven by the `verified`
  // this action read a moment ago. Reading it and then branching on it is a
  // time-of-check/time-of-use race: an IQAC officer verifying in the window
  // between the read and this write would leave the branch writing only
  // certificate_url, and the tick would survive over the swapped document —
  // exactly the failure the guard above exists to prevent, just harder to hit.
  // Writing false every time closes that window with no lock and no re-read: on
  // a row that was never verified it is a no-op (the column is already false),
  // and on one verified concurrently it does the right thing, because the tick
  // was made against a document that no longer exists. This is also precisely
  // what the trigger does once the migration is applied, so the two halves state
  // the same invariant rather than two nearly-identical ones.
  const { error: linkErr } = await (admin as any)
    .from('health_sports_achievements')
    .update({ certificate_url: path, verified: false, verified_by: null })
    .eq('id', achievementId);
  if (linkErr) {
    return {
      ok: false,
      error: `The file was stored but could not be attached: ${linkErr.message}`,
    };
  }

  return { ok: true };
}
