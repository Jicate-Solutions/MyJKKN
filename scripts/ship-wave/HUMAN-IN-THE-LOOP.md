# W12 ship wave — human in the loop, by phone (spec v1, 2026-09-10)

Decided by the Director in two interviews (2026-09-10 05:55 and 06:40). Every rule here traces to one of
his answers, quoted. Nothing here widens what the wave may do on its own; it changes HOW it waits.

## The problem this fixes
114 runs · 35 merges · frozen 18 of the last 41 h. Every freeze was correct and every freeze waited for a
human who was on a phone, not at a terminal. While frozen, humans hand-merged 10 PRs that then skipped the
batched deploy, the migration apply and the sweep, and sat unshipped 12 h. 14 drafts are parked on questions
nobody asked him. The loop is autonomous until it needs a human, then dead until one finds a terminal.

## A. Questions reach the Director; answers come back (his words: "Use always AskUserQuestionTool when you need me")

### A1. The wave writes questions
`$STATE/questions/<id>.json` — one file per open question. `<id>` = `q-<YYYYmmdd-HHMMSS>-<slug>`.
```json
{ "id": "q-20260910-064500-freeze-2bp01", "asked_at": "2026-09-10T06:45:00+05:30",
  "kind": "freeze|held|policy|deploy",
  "class": "<ledger_class of the trigger, or held/policy>",
  "title": "one plain-English line, ≤110 chars, 10th-grade reading level, no jargon",
  "body": "2–4 short sentences: what happened, what it costs, what each choice does",
  "options": [ { "label": "≤40 chars", "description": "one sentence, what happens if chosen",
                 "writes": [ {"op": "append", "file": "approve-held", "value": "3410"},
                             {"op": "unfreeze"},
                             {"op": "append", "file": "allow-destructive", "value": "20260906213000"},
                             {"op": "ratify", "value": "P3"},
                             {"op": "append", "file": "advisory-checks", "value": "SDK multi-agent review"},
                             {"op": "noop"} ] } ],
  "recommended": 0,
  "expires_after_h": 48 }
```
`writes` is the WHOLE contract: the desk applies exactly these ops, nothing else. Allowed ops: `append <file> <value>`
(files: approve-held, allow-destructive, advisory-checks — the wave's existing knobs), `unfreeze`, `ratify P<n>`,
`noop`. NO op may delete data, run SQL, merge, or touch git. A question with any other op is invalid and is
reported, not applied.

A helper `ask_director <kind> <class> <title> <body> <options-json>` in a NEW file `desk-questions.sh`
(sourced by ship-wave.sh after policy-learning.sh) writes the file, de-duplicates (same kind+class+title open →
do not write again; refresh `asked_at`), and appends one line to `$STATE/questions.log`.

Triggers (each writes ONE question):
- every `freeze()` call → kind=freeze, options always include "Lift the stop" (`unfreeze`) and "Keep it stopped"
  (`noop`); class-specific extra options where the remedy is a knob (e.g. destructive statement → "Allow this
  one migration" appends its version to allow-destructive; advisory check → append to advisory-checks).
- the HELD list at the end of a sweep, when ≥1 HELD PR is READY and not already asked → kind=held, ONE question
  per burst listing up to 5 PRs as options, each option `append approve-held <n>`; plus "Approve all listed"
  (multiple appends) and "None today" (`noop`). Re-asked only when the set changes.
- a new policy proposal (D) → kind=policy, options "Make this a rule" (`ratify P<n>`) / "Not yet" (`noop`).

### A2. The desk asks, by AskUserQuestion, and writes the answer back
A Claude Code skill `/w12-desk` (file: `~/.claude/skills/w12-desk/SKILL.md`, plus a small
`~/.config/obsidian/v5-w12-desk.sh` helper for the file plumbing). Run as `/loop 10m /w12-desk` in a tab that
stays live on the Director's phone account. One pass:
1. `v5-w12-desk.sh pending` → JSON list of open questions (unanswered, unexpired), oldest first.
2. If none: print one line "desk: nothing pending" and stop (the loop reschedules).
3. Else ask with **AskUserQuestion**, up to 4 questions per burst, options exactly as written, `recommended`
   first with "(Recommended)". The header is `kind` capitalised. Never add options. Never rephrase `writes`.
4. For each answer: `v5-w12-desk.sh answer <id> <option-index>` applies that option's `writes` (and ONLY those),
   moves the file to `$STATE/questions/answered/<id>.json` with `answered_at`, `chosen`, `applied[]`, and
   appends to `questions.log`. An "Other" free-text answer is stored verbatim as `chosen:"other"`, applies
   NOTHING, and is surfaced in the next wave receipt for a human to read.
5. Print a one-line receipt per answer: "#3410 → approve-held ✓".
The desk never reads or writes anything outside `$STATE/questions/` and the three knob files + `--unfreeze` +
`--ratify`. It never runs the wave. It never merges.

### A3. Phone visibility without the tab
Every pass, `v5-w12-desk.sh mirror` rewrites a `## W12 desk — waiting on you` section in
`/Users/omm/Vaults/Claude Setup/Fleet/Claude Fleet.md` (synced to the phone) listing open questions as plain
text with their numbered options — so he can see what is waiting even if the desk tab is not in front of him.
When nothing is pending the section says "nothing waiting". Only that section is touched.

## B. While it waits, it keeps doing the safe work (his words: "Keep doing the safe work, hold the risky")

Freeze gets a CLASS. `freeze()` derives it with `ledger_class` and writes it as the 3rd tab-separated field of
the FROZEN line. Two classes:

| class | when | what still runs | what waits |
|---|---|---|---|
| **soft** (a human decision is needed; production is NOT broken) — peer/Director hold, unresolvable conflict verdict, `files on jicate/main match` ref race, a policy question, advisory-only red | LOW + NORMAL merges · deploy · migration apply of ADDITIVE migrations · sweep · unblock lanes | HELD merges (need his number anyway) · the specific frozen item |
| **hard** (production or main is broken, or a merged migration cannot apply) — deploy ERROR · migration APPLY failed · DRY-RUN failed · destructive statement awaiting allow · GATE ERROR · migration gap | nothing that merges or ships · sweep/report only (today's behaviour) | everything |

Why "destructive awaiting allow" is HARD: the PR's code is already on main; deploying main would ship code
whose schema does not exist yet. That is the #1516 failure shape. It stays hard until the allow arrives (A1
asks for it) or the Director lifts the stop.

Implementation: the single `frozen` flag at ship-wave.sh:410 becomes `frozen` + `freeze_class`. Each gate
(unblock_lanes 430 · merge 484/511 · apply+deploy 516 · sweep) checks `hard` where it used to check `frozen`;
the merge gate additionally excludes HELD whenever any freeze is on. `--unfreeze` clears both. The receipt and
the HTML banner show the class and, for soft, "merging LOW/NORMAL, holding HELD".

## C. A stop blocks NEW merges, not shipping of what is already on main (his words: "Stopped means no NEW merges — shipping still runs")

During a **soft** freeze, the deploy step runs for commits already on main — including hand-merged ones — with
the full apply + verify + sweep. Mechanism: the deploy step today runs only if `merged>0 || migrations-pending`;
add a third trigger: `main HEAD != last-deployed sha` (read from the last READY production deployment's
`meta.githubCommitSha` via the Vercel API, fallback: the wave's own `last-deployed` marker written after every
READY). During a **hard** freeze nothing ships — production is broken, and the receipt says so in one line.
When someone hand-merges during any freeze, the next run's receipt lists those PRs under "merged by hand while
stopped" so the Director sees who routed around the wave.

## D. Repeated decisions become rules he approves once (his words: "propose after 2 identical decisions, I approve each rule once")

`policy-learning.sh` already has propose (`policy_proposals`) and ratify (`policy_ratify`), decided 2026-09-06.
Extend, do not replace:
- **Resolution memory.** When the desk applies an answer to a `freeze` question, `v5-w12-desk.sh` appends a
  ledger record `{"outcome":"resolved","class":<class>,"chosen":<label>,"writes":<ops>}`. `ledger_record` exists.
- **Threshold 2.** `policy_proposals` gains: for each freeze `class`, if the Director has resolved it the SAME
  way (same `writes` shape, ignoring the value) ≥2 times, emit proposal `P<n> AUTO_<CLASS>_<ACTION>` with the
  two dated resolutions as evidence. Threshold is a constant `PROPOSE_AFTER=2` at the top of the file.
- **Never destructive.** A hard-coded `NEVER_RULE` list of categories whose proposals are never generated:
  anything whose message matched `DROP|TRUNCATE|DELETE FROM|destructive|APPLY failed|deploy ERROR`. Comment
  quotes the Director: "Anything that deletes or drops data can never become a rule — that stays yours every
  single time."
- **Ratify by tap.** Each new proposal → `ask_director policy …` (A1). `ratify P<n>` is the write. The rule
  flag then exists (`$STATE/policy/<RULE>`) and the wave's gates already consult `policy_active`.
- Existing P1 (AUTO_APPROVE_ADDITIVE_MIGRATIONS) is re-emitted as a question once, so it finally reaches him.

## Proof each builder must ship (bash, in `scripts/ship-wave/tests/`)
- A: `test-desk-questions.sh` — write a freeze question; `pending` lists it; `answer` with option 0 applies
  exactly its writes (assert file contents) and moves the file; an invalid op is refused and reported; "other"
  applies nothing; de-dup does not write twice; `mirror` rewrites only its own section (assert the rest of a
  fixture Fleet.md is byte-identical).
- B+C: `test-freeze-classes.sh` — a fake `$STATE` + stubbed gh/curl: (1) soft freeze → LOW/NORMAL merge path
  reached, HELD path not, deploy path reached; (2) hard freeze → no merge, no deploy; (3) soft freeze + main
  ahead of last-deployed → deploy triggered with zero merges this round; (4) `--unfreeze` clears class too;
  (5) a message from each ledger class lands in the right table row.
- D: `test-policy-threshold.sh` — two identical resolutions → exactly one proposal; one → none; a destructive
  class with 10 identical resolutions → none; ratify writes the flag and `policy_active` sees it.
Each test prints PASS/FAIL per case and exits non-zero on any FAIL. `bash -n` on every touched file.

## Non-goals (say so in the PR)
- Minting a dedicated desk tab (the skill runs in any live tab; a `v5-claude-setup-w12desk01` tab is a follow-up).
- Telegram delivery (plugin restart pending; the Fleet-note mirror covers phone visibility meanwhile).
- Changing the goal metric ("zero open" stays, by his answer).
- Closing the 3 superseded PRs (his answer: leave them).

## Amendments from the build (2026-09-10 08:10) — craft decisions, not new Director decisions

**A1/A2 — AskUserQuestion allows 2–4 options per question and up to 4 questions per call.** The HELD burst as
first written (5 PRs + "Approve all" + "None today" = 7 options) cannot be asked. Amended: the wave writes ONE
question PER ready HELD PR — title "Approve #<n>? <PR title ≤60>", options "Approve #<n>" (append approve-held <n>)
and "Not now" (noop). The desk asks up to 4 per pass, oldest first; a burst of 10 takes three passes. De-dup key
(kind+class+title) then naturally contains the PR number. "Re-asked only when the set changes" falls out: a PR
already asked and answered "Not now" is not re-asked until its head sha changes (put the short sha in `class`).

**D — learned-proposal titles must be unique per proposal.** The plain-English template made every title
identical, so ask_director's de-dup collapsed distinct proposals into one question (verifier NEW-10). Amended
template: "Rule P<n>: you've answered the same way <N> times — make it a rule?" — P<n> keeps it unique, the rest
stays plain. `class` for a policy question = the proposal key (sha1 prefix), never the raw ledger slug.

**D — NEVER_RULE must be a single shared source of truth with B's classify_freeze.** D must not keep its own
HARD_CLASS list (verifier NEW-9: B has 14 hard rows, D refused 4). D sources ship-wave's `classify_freeze` (or a
tiny `freeze-classes.sh` both source) and refuses to propose any rule whose action is `unfreeze` on a class that
function calls hard, or whose writes touch `allow-destructive` — compared case-insensitively after trimming
(verifier NEW-2: "Allow-Destructive" bypassed an exact-match set). `append.file` must be one of exactly the three
knob names (NEW-3: any non-empty file name was accepted, including "../frozen").

**Integration order (one integrator, after all three slices hold):** rebase A and D onto B's ship-wave.sh; add A's
source line after policy-learning.sh; wire the three triggers in ship-wave.sh (freeze() → question; per-PR HELD
questions after the READY list; policy_emit_questions after policy_proposals); route "Other" answers into the
receipt ("Director wrote: …"); run every test file; then ONE PR, Draft, on top of #3392.

## E. Stale draft PRs — Lane E (Director 2026-09-11 12:34)

> **Amended 2026-09-11 22:3x** — see "E amendments" at the end of this section: the 3-day nudge now goes to the Claude
> tab that opened the draft (not a GitHub comment), drafts of one build get one question, and an unanswered question
> comes back weekly. Where the two disagree, the amendments win.

His ruling, verbatim: **"nudge at 3 days, ask me at 7"** — a Draft PR untouched for 3 days gets ONE comment nudging
its author; at 7 days untouched the wave asks the Director (Close / Keep / Nudge again); the wave NEVER closes a
draft on its own. Lives in `unblock-lanes.sh` (`lane_stale_drafts`, called at the end of `unblock_lanes`, so it runs
whenever the lanes run — soft freeze included, hard freeze not).

- **Untouched** = the PR's `updatedAt` from `gh pr view --json updatedAt,isDraft`, drafts only (`isDraft == true`),
  taken from the sweep's `plan.json` `draft` list. Days, not hours: `DRAFT_NUDGE_D=3`, `DRAFT_ASK_D=7`.
- **The nudge** is one plain sentence by `gh pr comment`, once per silence. The comment itself moves `updatedAt`; the
  lane remembers its own bump so it never reads as the author's reply. Anything else that moves `updatedAt` (more
  than 5 minutes after the nudge) is activity: the count resets to zero and the cycle starts over.
- **The ask** goes through §A1 `ask_director` as `kind=held`, `class=stale-draft #<n>`, options exactly **Close /
  Keep / Nudge again**, recommended = Keep (the one that changes nothing), `expires_after_h` = 7 days. It fires
  only when idle ≥ 7 days AND the nudge is ≥ 4 days old, so a draft first seen at 30 days idle still gets its
  author four days to answer the nudge. Every option's `writes` is `noop`: the desk applies nothing and its op
  allowlist is unchanged (that list is policy). The ANSWER is the signal — the lane reads the desk's own
  `$STATE/questions/answered/<id>.json` (`chosen`) on the next tick.
  - **Close** → the wave runs `gh pr close <n> --comment …` (branch kept), once; the PR is dropped from the lane.
  - **Keep** → the lane is silent on that PR for `DRAFT_KEEP_D=7` more days, then the cycle restarts from a nudge.
  - **Nudge again** → one more comment now; the Director is asked again in 7 days if it stays silent.
  - "Other" free text applies nothing (§A2.4) and is read as Keep.
- **plan mode** prints "would nudge / would ask / would close" and writes nothing.

State files introduced (all under `$STATE`): `stale-drafts/<n>` — one marker per PR,
`<date>\t<stage>\t<a>\t<b>\t<epoch>` with stage ∈ `nudged` (a = updatedAt before the nudge, b = after it, epoch = when),
`asked` (a = question id, b = updatedAt at ask time), `keep` (a = quiet-until epoch), `closed` (a = question id).
Ledger records: `unblocked` with class `lane e nudge | ask | keep | nudge again | close`.

Proof: `tests/test-lane-e.sh` — stubbed `gh` (no network), real `lane_stale_drafts`, real desk answer path: 2 days →
nothing; 3 days → exactly one comment and a second tick does not comment again; 7 days → one question with the three
options and a second tick does not re-ask; Keep → silent; Close → the close is invoked once and the PR is dropped;
Nudge again → one more comment; author activity resets; the wave's own bump does not; plan mode writes nothing.

### E amendments — reminders go to the tab, one question per group, weekly re-ask (Director 2026-09-11 22:3x, by phone)

His four interview answers, verbatim:
1. **"Message the tab: the phone desk tab sends the reminder to the Claude tab that started the change. If that tab is
   closed, skip straight to asking you at 7 days."**
2. **"One question per group: one question names every part. One tap decides them all, so you never close part 1 and
   leave parts 2 to 5 stuck."**
3. **"Ask again next week: the question comes back once a week. Nothing is ever closed without your tap."**
4. **"Keep = quiet for one week"** (already built; now for the whole group).

They replace, in the section above: the 3-day `gh pr comment` (nobody reads those, and every draft was opened by the
Director's own Claude tabs), the per-PR question, and the de-dup wording. Everything else in §E stands — never an
auto-close, every `writes` is `noop`, the answer file is the signal, plan mode writes nothing.

- **Groups.** Drafts that belong together are ONE group: one reminder, one question, one marker. Two drafts belong
  together when they share any of (transitively): **family** — the same build name before `Lane <X>` / `Slice <X>` in
  the title, same scope ("feat(onemark): Wave 3 Lane S3 / Lane A / …"); **chain** — `PR k/N` with the same N, same scope
  and the same opening session; **spec** — the same FIRST `specs/<name>.md` path in the body (only the first: later
  mentions are often references to other documents, and a reference must not pull an unrelated draft into a tap that
  closes it). A lone draft's group id is its PR number; a group's is `g-<slug>` of its strongest shared key
  (chain > family > spec). Idle = days since the NEWEST `updatedAt` in the group. A push, a comment or a new part
  joining resets the whole group; a part leaving the drafts (merged, closed, marked ready) does not.
- **The 3-day reminder** is a request, not a comment: `$STATE/nudges/<group>.json` with the PR numbers and titles, the
  claude.ai session id(s) parsed from the PR bodies (`https://claude.ai/code/session_<id>` — a bare link, a markdown
  link, or a `Claude-Session:` trailer; the first link in a body is the tab that opened it), `first_seen`,
  `requested_at`, `status: pending` and the one plain `message` to send. The wave runs under launchd and cannot message
  a tab; the desk tab can. Every `/w12-desk` pass starts with `v5-w12-desk.sh nudges`, which runs
  `desk/desk-nudge-targets.sh` and prints `<request>|<tab name>|live|dead|unknown|<message>` per pending request.
  **How a draft finds its tab**, from the fleet's existing records only (read-only, nothing new is kept): the session
  id `X` is claude.ai row `cse_X`; `v5-row-status.json` joins that row to its tab key when it is the tab's current row;
  otherwise the transcripts named by `v5-tab-sessions/<u8>` (field 1) are searched for `"bridgeSessionId":"cse_X"` (a
  restarted tab keeps its old ids there — the proof `v5-ghost-sweep.sh` uses); the name comes from the name spine
  `v5-tab-names/<u8>`; live = a tmux session `v5-…-<u8>` exists (matched by key, not vault slug). Several sessions in one
  group are tried most-parts-first; the first live tab wins. `live` → the desk sends the line with **SendMessage** and
  runs `nudge-mark <request> delivered`; `dead`, `unknown`, or a name SendMessage refuses → `nudge-mark <request>
  tab-closed`. The desk's reach grows by exactly this: it reads `$STATE/nudges/`, changes a request's `status` from
  `pending`, and sends that one line to that one tab. It still never comments on a PR, closes one, or merges.
- **The ask** (unchanged trigger, amended gate): idle ≥ 7 days AND either the request says `tab-closed` (nobody can
  answer — straight to the question) or the reminder is ≥ 4 days old (from `delivered_at`, else `requested_at`, so a
  desk that never ran still gets the Director asked). ONE question per group, `kind=held`,
  `class=stale-draft #<n>` (lone) or `stale-drafts <group>`; the body lists every PR in the group; options
  **Close / Keep / Nudge again** for a lone draft, **Close all / Keep all / Nudge again** for a group; recommended = Keep.
  - **Close / Close all** → the wave closes every PR the question listed that is still an open draft, each with a
    comment, branches kept; a failed close is retried next tick without closing the others twice.
  - **Keep / Keep all** (and free text) → the whole group is silent for 7 days, then the cycle restarts.
  - **Nudge again** → a fresh reminder request (same `first_seen`); asked again 7 days later if it stays silent.
- **Weekly re-ask.** `expires_after_h` = 168 (`DRAFT_REASK_D=7`). Unanswered at expiry, the lane asks again — the same
  question file, refreshed by `ask_director`'s de-dup (title carries no date or day count) — once a week, forever,
  unless the group moved since it was asked (then the cycle starts over). Never an auto-close.

State files: `nudges/<group>.json` as above (`status` ∈ pending · delivered · tab-closed · withdrawn — withdrawn when the
draft moved before the desk sent it). `stale-drafts/<group>` — one marker per group,
`<date>\t<stage>\t<a>\t<b>\t<epoch>\t<members>\t<closed>`: `nudged` (a = last activity epoch), `asked` (a = question id,
b = last activity at ask, members = what the question lists, closed = PRs already closed on a Close), `keep` (a =
quiet-until), `closed` (a = question id). Ledger categories: `lane e nudge | ask | ask again | keep | nudge again | close`.

Proof: `tests/test-lane-e-amendments.sh` (and `tests/test-lane-e.sh`, updated) — stubbed `gh`, tmux and SendMessage;
temp copies of the mapping files; real `lane_stale_drafts`, real `desk-nudge-targets.sh` through `v5-w12-desk.sh`, real
desk answers: no `gh pr comment` at 3 days; one request per group; the session id from the trailer, bare-link and
markdown forms; live/dead/unknown resolution incl. a restarted tab and a renamed vault; 8 OneMark-style titles → one
group → one question; a `PR k/5` chain → one group; an unanswered question re-asked once per week; Keep silences the
whole group; Close closes every listed PR once; a tab-closed request reaches the question at 7 days.
