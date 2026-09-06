# ID Cards Module

**Created:** 2026-07-24
**Status:** Live (Phase 2)
**Audience:** Registrars, module admins, and the ops team member who looks after the office print station.

---

## What this module is

The ID Cards module turns a learner record in MyJKKN into a physical plastic ID card, printed on the card printer at the office. A registrar designs the card once (template + printer policy), then printing any card — for one learner or a whole batch — is a couple of clicks. Everything in between (rendering the card image, talking to the printer) is automatic.

**In-app pages** (left sidebar → Admin → ID Cards):

| Page | Route | What it does |
|---|---|---|
| Printer Policy | `/admin/id-cards/policy` | Ribbon type, single/double-sided, print agent URL |
| Template | `/admin/id-cards/template` | Field mappings + photo fallback chain |
| Print Queue | `/admin/id-cards/print-queue` | Live job list, auto-refreshes every 5 seconds |

A role-aware walkthrough for registrars lives in the unified in-app guide (`/guide?module=id-cards`, or the ? Help button on any ID Cards page).

---

## Architecture in plain words

Three pieces, in a straight line:

```
MyJKKN (cloud)                 Office computer (Windows)         Printer (office)
┌──────────────────┐   poll    ┌───────────────────────┐  USB   ┌────────────────┐
│ Print queue       │ ◄──────── │ JKKN Print Bridge     │ ─────► │ Evolis         │
│ (id_card_print_   │  every    │ (Windows service,     │        │ Primacy 2      │
│  jobs table + API)│  5 sec    │  polls for jobs)      │        │ card printer   │
└──────────────────┘           └───────────────────────┘        └────────────────┘
```

1. **MyJKKN queue** — when a registrar presses print, MyJKKN creates a row in `id_card_print_jobs` (one job = one card for one person) and renders the card image from the template.
2. **Windows bridge** — a small program running as a Windows service on the office computer. It asks MyJKKN "any cards to print?" **every 5 seconds**, downloads any job that is ready, and hands it to the printer.
3. **Evolis Primacy 2** — the physical card printer at the office. It prints the card using the ribbon and side settings from the printer policy.

The bridge polls outward (office → cloud), so no inbound firewall holes are needed at the office. If the office computer is off, jobs simply wait in the queue and print when it comes back.

### Batch printing by cohort (added 2026-07-24)

**Admin → ID Cards → Batch Print** queues cards for a whole cohort in one go — no per-page checkbox selection:

- **Freshers batch** — pick institution + admission year (newest pre-selected). Selects **all matching** learners, not just a visible page.
- **Class / section** — pick institution + class/program (+ optional section). School classes (LKG, GRADE 3, … at Nattraja Vidhyalya CBSE / JKKN Matric HSS) are program rows, so class-wise school printing uses the same picker.
- A **"Which learners?"** choice controls lifecycle statuses (default: active only; admission-week option includes admitted/account-created).
- Learners **without an activated account are excluded up front** and reported — the confirm step's card count and ribbon estimate reflect real printable cards.
- The confirm dialog shows **ribbon panels used + estimated print time** (~15 s/card); batches of 50+ get a ribbon-stock warning (a full YMCKO ribbon ≈ 300 cards).
- Jobs enqueue **grouped by class/program in roll-number order**, so the printed stack comes out ready to hand out. Progress is visible on the Print Queue page.

---

## Job statuses — and how failures surface to the registrar

Every job on the Print Queue page shows one of five statuses (DB values in parentheses):

| Status badge | DB value | Meaning |
|---|---|---|
| Pending | `pending` | Waiting in the queue; nothing has picked it up yet. Can still be **cancelled**. |
| Rendering | `rendering` | MyJKKN is preparing the card image from the template. |
| Sent to printer | `sent_to_agent` | The bridge picked it up and handed it to the printer. |
| Printed | `printed` | Done — the card came out of the printer. |
| Failed | `failed` | Something went wrong; the reason is stored on the job. |

**How a failure reaches the registrar:** a failed job turns **red on the Print Queue page** (which auto-refreshes every 5 seconds), and its **result message** says why — the bridge writes the reason into the job's `result` column when it reports back. The registrar reads the message, fixes the physical cause, and presses **Retry** on the job. No failure is silent, and nothing needs to be dug out of server logs for the everyday cases.

Common failure causes, in order of likelihood:

1. **Print station unreachable** — the office computer is off, or the bridge service stopped.
2. **Ribbon out** — replace the ribbon cartridge; make sure the printer policy's ribbon type still matches.
3. **Card feeder empty** — load blank cards.

Jobs stuck on **Sent to printer** (not failed, just not finishing) usually mean the printer or bridge machine lost power mid-job — check the office hardware first, then retry.

Duplicate protection: enqueueing a card for a person who already has an active job returns a clear "duplicate" message (HTTP 409) instead of quietly printing two cards.

---

## Ops pointers (for the team member at the office)

| Thing | Where |
|---|---|
| Bridge Windows service name | `JKKNPrintBridge` (on the **BIOMETRIC** box) |
| Bridge log file | `C:\jkkn-bridge\bridge-service.log` |
| Restart the bridge | Windows Services app → `JKKNPrintBridge` → Restart (or `net stop JKKNPrintBridge && net start JKKNPrintBridge` in an admin prompt) |
| First thing to check when jobs pile up as Pending | Is the BIOMETRIC box on, and is the service Running? |
| Second thing | Tail the log file — the bridge logs every poll, pickup, and printer response there. |

The bridge machine is the same Windows box that runs the biometric attendance sync — if that box is up, the bridge is normally up.

---

## License review (Evolis SDK)

The bridge drives the printer through the **Evolis SDK** (Python package `evolis`, SDK 9.4.1).

- The SDK's license terms live at **www2.evolis.com/sdk**, behind the Director's Evolis developer account — they are not published openly.
- The pip package metadata carries **no license field**, so the terms cannot be verified from the package itself.
- Until written confirmation is on file, treat production use as **provisionally allowed but unconfirmed** — the SDK is distributed by Evolis for driving Evolis printers, which is exactly our use, but that reading has not been confirmed by Evolis in writing.

**Action for the Director** — a ready-to-send ask (forward to Evolis support / the account contact at www2.evolis.com/sdk):

> Subject: Written confirmation — production use of Evolis SDK with Primacy 2
>
> Hello,
>
> We are JKKN Educational Institutions (Tamil Nadu, India). We own an Evolis Primacy 2 card printer and use the Evolis SDK (Python package `evolis`, version 9.4.1), downloaded under our developer account, inside an internal Windows service that receives ID card print jobs from our own campus management platform and sends them to the printer.
>
> Could you please confirm in writing that this internal, production use of the SDK — driving our own Evolis printer from our own software, with no redistribution of the SDK to third parties — is permitted under the SDK license terms?
>
> Thank you,
> [Name], JKKN Educational Institutions

File Evolis's reply alongside this doc when it arrives.

---

## CARRE — candidate evidence pointers (future human-run audit)

> **No scores are assigned here.** A CARRE audit requires a human interview with the people the module serves (registrars and the office ops team member) — scores autofilled from documents are invalid by the framework's own rules. This section only lists where an auditor would look, per dimension, when that interview happens.

| Dimension | Candidate evidence pointers |
|---|---|
| **Clarity** | Does the registrar know what each status means without asking? Evidence: the status badges + explainer text on `/admin/id-cards/print-queue`, the in-app guide lane (`/guide?module=id-cards`), and this doc's status table. Interview probe: "walk me through what you do when a job goes red." |
| **Appreciation** | Is the registrar's printing work visible to anyone (completed-cards count, acknowledgment), or does it disappear into the queue? Evidence: whether any surface shows printed-card volume per operator; likely a gap today. |
| **Recognition** | Is there any record tying successful card runs to the person who ran them? Evidence: `enqueued_by` on `id_card_print_jobs` exists — check whether anything user-facing ever reads it back. |
| **Respect** | Does the system respect the operator's time — e.g. does a failure tell them the actual cause (result message) or send them hunting? Evidence: failure-message quality in the `result` column vs. what the registrar reports actually helped. Duplicate-job protection (409) also belongs here — the system refuses to waste their cards. |
| **Empowerment** | Can the registrar fix problems without escalating — retry failed jobs, cancel pending ones, adjust the photo fallback chain themselves? Evidence: Retry/Cancel controls on the queue, self-service policy + template pages, vs. which situations still require calling the ops team member or a developer. |

When the audit runs, use the `/carre-audit` scaffolder so evidence is collected item-by-item into the `care_audits` system of record.

---

## Back side — designed and rendering; printing still front-only

<!-- Updated: 2026-07-25 — back-side rendering shipped DARK. -->
<!-- Updated: 2026-08-14 — no longer dark: two production templates now
     carry a back, and a back has been rendered and eyeballed. -->

The render engine composites a card **back**. It shipped dark on 2026-07-25 (no template had one), but **that is no longer true**: as of 2026-08-14 both active production templates carry a designed `back_layout_json`, and a back has been rendered and checked by eye for the first time — it composes correctly, with the portrait card rotated into the 1014x638 landscape canvas. What is still missing is the printing leg (see the gap note at the end of this section).

Read live from `id_card_templates` on 2026-08-14 — 3 rows, all of production:

```
active  back_layout_json       template
------  ---------------------  --------------------------------------------
yes     11 elements, portrait  Engineering Learner - Tall (2026)
yes     11 elements, portrait  Engineering Senior Learner (Facilitator)
                               - Tall (2026)
no      NULL                   DO NOT USE - E2E Test Template (2026-07-23)
```

While `back_layout_json` is `NULL` the back endpoint still answers **404 `back_not_configured`** — which is now only the inactive E2E row. Nothing about front rendering or printing changed because a template opted in.

**How it works**

- `GET /api/id-cards/templates/:id/render?profile_id=…&side=back[&format=png]` renders the back (same auth as the front). `side=front` (or omitting `side`) is the unchanged front path.
- The default back design prints, from the learner record (team members: from their team-member record): blood group, date of birth, guardian (father, else mother) with phone, permanent address, the person's own contact number, a centred **Code 39 barcode** of the learner's roll number (team members: their id code) with the number beneath, and a full-width green footer band reading `TAMIL NADU, INDIA` (overridable). Missing data simply omits that block — nothing is invented.
- The barcode is generated in-house (`lib/id-cards/barcode.ts`, dependency-free Code 39: A–Z, 0–9, dash, dot, space; 1:3 narrow/wide; start/stop asterisks).
- **What the two live backs actually use (2026-08-14):** neither of them uses that default design. Both switch every default block OFF — `show_blood_group`, `show_dob`, `show_guardian`, `show_address`, `show_contact` and `show_barcode` are all `false` — and draw the whole back from their 11 positioned `elements`: four label+value pairs (BLOOD GROUP, DATE OF BIRTH, ADDRESS, CONTACT) plus three fixed lines (the office phone numbers, `engg@jkkn.ac.in`, `www.engg.jkkn.ac.in`), over the `TAMIL NADU, INDIA` footer band. **So there is no barcode on the printed back today**, and no guardian line either. Both backs are `orientation: portrait`, matching their fronts.
- ⚠️ **Known defect — the address is cut short.** Element text is hard-truncated at 80 characters (`truncateForCard(value, 80)` in `lib/id-cards/render-card.tsx`). Learner addresses join five columns (street, taluk, district, state, PIN); measured live on 2026-08-14, **402 of the 787 active Engineering learners (51.1%)** exceed 80 characters and lose district, state and PIN off the end. A separate lane is fixing this. Until it ships, do not run a cohort batch on the back — see §3.5 of the ops runbooks.

**`back_layout_json` schema** (every key optional; `{}` = enabled with defaults):

| Key | Meaning |
|---|---|
| `background_color` | Hex background (default white) |
| `background_image` | Back artwork URL — must live in the `id-card-assets` bucket (same allowlist as the front); full-bleed artwork suppresses the footer band |
| `show_blood_group` `show_dob` `show_guardian` `show_address` `show_barcode` `show_contact` | Toggle the default blocks (all default `true`) |
| `footer_text` | Footer band text override |
| `elements` | Positioned extras (same element schema as the front, plus back fields `blood_group` `date_of_birth` `guardian` `address` `contact_phone` `barcode`). On the back, elements **overlay** the default design — this is how a template supplies its institution's contact / email / website lines; the code hardcodes no institution's contacts |

**Enabling it for a template**

Set `back_layout_json` to `{}` (or a fuller object) on that template — the back-design tab (`components/admin/id-cards/id-card-back-design-tab.tsx`: enable switch, back-artwork upload to `id-card-assets/back-backgrounds/…`, preview-with-my-data) is built but **not yet wired into the template page**; until it is, enabling is a deliberate data change.

**Explicit gap — printing is still front-only, and the bridge is the only thing left.** The Windows print bridge (`evolis_bridge.py`, still v0.3.1) downloads and prints **one front PNG per job**; it never requests `side=back`. Everything around it is ready: the printer has the dual-side module installed, the policy already says `id_card.printer.sides = 2`, and the pickup response `POST /api/id-cards/jobs/:id/pickup` already tells the bridge `has_back: boolean` (fail-soft to `false`) so it knows when a back exists. The remaining work is the bridge change plus a ribbon decision and one on-plastic flip-direction check — all three written up as a paste-and-run runbook in **§3 of `docs/modules/id-cards/2026-07-25-OPS-idcard-runbooks.md`**, executed by the Director at the Windows box.

---

## Related

- In-app guide lane: `/guide?module=id-cards` (registry: `lib/guide/registry.ts`, content: `lib/id-cards/guide/content.ts`)
- API: `POST /api/id-cards/jobs` (`{profile_id, template_id}` → 201, or 409 `duplicate_active_job`), bridge endpoints under `/api/id-cards/jobs/[id]/pickup` and `/api/id-cards/jobs/[id]/result`
- Permission keys: `id_cards.*` in `lib/constants/permissions.ts` (7 keys: templates view/create/edit/delete, jobs view/manage, my-cards view)
