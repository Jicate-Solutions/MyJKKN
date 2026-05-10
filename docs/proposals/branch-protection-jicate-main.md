---
created: 2026-05-10
type: proposal
status: awaiting-director-decision
project: MyJKKN
audience: director
tags:
  - process
  - github
  - branch-protection
---

# Proposal: Branch Protection on `jicate/main`

> **For:** Director (single-toggle decision)
> **Repo:** Jicate-Solutions/MyJKKN
> **Date:** 2026-05-10
> **One-line ask:** Turn on five GitHub safety toggles on the `main` branch so a broken change cannot land without warning.

---

## What happened

On 2026-05-08, PR #730 merged a UI change that depended on database setup from two earlier PRs (#644 and #715) — but those earlier PRs had not yet merged. Within minutes, `main` could no longer build. Production stayed live on the previous deploy, but no new work could ship for **14 hours** until PR #768 stubbed the missing piece. The fix took 30 seconds; finding it took a day. Nothing stood between the merge button and a broken `main`.

---

## What I am proposing

Turn on five GitHub branch-protection rules on the `main` branch. In plain English:

- **Require a pull request before merging** — no direct push to `main`. We already follow this; the toggle enforces it.
- **Require the build check to pass** — every pull request runs an automated build (a status check, the same one Vercel runs). The merge button stays disabled until that build succeeds. *This is the rule that would have caught PR #730.*
- **Require the branch to be up to date** — the pull request must include the latest changes from `main` before it merges, so two PRs cannot collide.
- **Require linear history** — no merge commits. Matches our current squash-merge convention.
- **Block force pushes** — nobody can rewrite history on `main`, even by accident.

---

## What changes day-to-day

- Every PR waits 5–10 minutes for the build check before the merge button turns green.
- A PR that breaks the build cannot be merged until it is fixed (today, it can be merged anyway).
- If two PRs touch the same area, the second one has to refresh from `main` before merging.

Review, deploy, and release process stay the same.

---

## Trade-offs

| Pro | Con |
|-----|-----|
| Catches build-breaking PRs before they land. | Adds 5–10 minutes of waiting per PR. |
| Stops the "two PRs collided on `main`" bug. | Emergency hotfixes that skip the build now need an explicit override. |
| Removes the "I forgot to rebase" footgun. | Slower merges on a high-PR day. |
| Free — no new tooling, no new vendor. | One-time team adjustment to the new wait. |

The biggest trade-off is the wait. On a normal day it is invisible — review happens while the build runs in parallel. On a hot day with five PRs queued, the wait can feel slow. The bypass below covers emergencies.

---

## Bypass for emergencies

Repository administrators can bypass these rules — for example, if the build system itself is down and a hotfix has to land. Every bypass is logged in GitHub's audit trail. Standard escape hatch, should stay rare.

---

## Rollout plan

- **Day 0** — Announce in the team channel: "Turning on branch protection on `main` next Monday. Here is what changes."
- **Day 1** — Enable in *soft-warning mode*: the build check appears on PRs but does not block merging yet. People see what the new check looks like without friction.
- **Day 7** — If no problems surface, flip to *required*. The build check now blocks merging on failure.
- **Anytime** — Director can turn the whole thing off in one click in GitHub Settings.

---

## What we keep doing

This proposal is purely additive. The existing practices stay exactly as they are:

- The `⚠️ NEVER auto-merge` footer on every PR description.
- Director review on multi-tenant or destructive changes.
- The `visual-proof-skip` label for documentation-only PRs.
- The pre-merge localhost screenshot + post-deploy production screenshot bookend.
- The `/myjkkn-chain` and `/deploy-myjkkn` skill chains.

---

## Director action required

One trip through GitHub settings, ~60 seconds:

> **Settings → Branches → Branch protection rules → Add rule**
>
> - Branch name pattern: `main`
> - Toggle on: *Require a pull request before merging*
> - Toggle on: *Require status checks to pass before merging* → search for and select `build`
> - Toggle on: *Require branches to be up to date before merging*
> - Toggle on: *Require linear history*
> - Toggle on: *Do not allow bypassing the above settings* (for non-admins)
>
> *[screenshot of GitHub branch protection page here]*
>
> Click **Save changes**.

To revert: same screen, click **Delete** on the rule. Takes 5 seconds.

---

## Summary

PR #730 cost 14 hours of blocked merges because nothing checked the build before it landed. Five GitHub toggles make that a non-event. Cost is 5–10 minutes of wait per PR. Reversible in one click.

Awaiting director sign-off.
