---
name: w12-desk
description: The W12 ship-wave desk — puts the wave's open questions (a freeze, HELD PRs waiting for a number, a policy proposal, a stale draft group) in front of the Director as AskUserQuestion taps and writes each tap back with v5-w12-desk.sh; and delivers the wave's stale-draft reminders to the Claude tab that opened the draft, by SendMessage. Use on '/w12-desk', 'desk', 'what is waiting on me', 'anything waiting', 'w12 questions', or every tick of '/loop 10m /w12-desk'. Never runs the wave, never merges — it only answers questions the wave already wrote.
---

# /w12-desk — the wave asks, you tap, the desk writes it back

The ship wave (`scripts/ship-wave/ship-wave.sh`) writes a question file whenever it needs a human:
`$STATE/questions/<id>.json` with a plain title, a short body, and numbered options whose `writes` are
the WHOLE effect of choosing them. This skill is the hands that carry those questions to the Director's
phone and carry the answer back. Spec: `scripts/ship-wave/HUMAN-IN-THE-LOOP.md` §A2.

Director 2026-09-10: "Use always AskUserQuestionTool when you need me." So: no prose summaries of the
options, no "shall I…" in chat — the question goes through AskUserQuestion, exactly as the wave wrote it.

## One pass (run every tick)

0. **Reminders for stale drafts (Lane E).** Run: `~/.config/obsidian/v5-w12-desk.sh nudges`
   It prints one line per reminder the wave has queued: `<request>|<tab name>|live|dead|unknown|<message>`
   (everything after the fourth `|` is the message). Director 2026-09-11: "Message the tab: the phone desk tab
   sends the reminder to the Claude tab that started the change. If that tab is closed, skip straight to asking
   you at 7 days." For each line:
   - `live` → **SendMessage** to `<tab name>` with `<message>`, word-for-word. Then
     `~/.config/obsidian/v5-w12-desk.sh nudge-mark <request> delivered "" "<tab name>"`.
     If SendMessage refuses the name (no such agent, or several share it and it wants a ref), run
     `nudge-mark <request> tab-closed "<its error, verbatim>"` instead — never guess another tab.
   - `dead` or `unknown` → `~/.config/obsidian/v5-w12-desk.sh nudge-mark <request> tab-closed <dead|unknown>`.
   Print one receipt line each: `reminder <request> → sent to <tab name>` or `reminder <request> → tab closed`.
   No output from `nudges` → say nothing and go on. This step never asks the Director anything: a closed tab
   simply means the wave asks him at 7 days.

1. Run: `~/.config/obsidian/v5-w12-desk.sh pending`
   It prints a JSON array of open questions (unanswered, unexpired), oldest first. Anything on stderr
   starting `desk: invalid question` or `desk: skipped question` is a file the wave (or a hand) wrote badly —
   repeat that line in chat verbatim and move on; you cannot ask it. One bad file never hides the others.
2. If the array is empty: print exactly `desk: nothing pending` and stop. (The loop reschedules you.)
3. Otherwise ask with the **AskUserQuestion** tool — up to **4 questions per pass** (the oldest 4; the rest
   wait for the next tick). For each question:
   - `header` = the `kind` capitalised (`Freeze`, `Held`, `Policy`, `Deploy`).
   - `question` = the file's `title`, then a blank line, then its `body` — verbatim.
   - `options` = the file's options, **label and description word-for-word**. Put the option at index
     `recommended` FIRST and append ` (Recommended)` to its label. Keep the other options in file order.
     Keep a note of which file index each displayed option came from — you answer by FILE index.
   - `multiSelect` = false.
4. For each answer:
   - a listed option → `~/.config/obsidian/v5-w12-desk.sh answer <id> <file-index>`
   - the free-text "Other" → `~/.config/obsidian/v5-w12-desk.sh answer <id> other "<his text, verbatim>"`
     (this stores the text and applies nothing; the next wave receipt surfaces it for a human).
   The script's exit code: 0 applied · 3 refused (an op outside the allowlist, a value that is not one PR
   number / one 14-digit version / one plain check name, or an id that is not `q-YYYYmmdd-HHMMSS-<slug>` —
   say so, verbatim; a question file that is a symlink, has 1 or 5+ options, or an option with an empty `writes`
   list is refused the same way — it is reported, never asked) · 4 partly failed (read the lines marked ✗ back to
   him — a "Lift the stop" answered after a DIFFERENT freeze landed is refused with "the stop has changed since
   you were asked — nothing lifted"; the wave writes a fresh question for the stop that is on now, ask that one
   next pass; a refused or failed freeze answer is recorded on the ledger as `refused`, never as `resolved`) ·
   5 expired — the moment passed, nothing applied (only a human at a terminal may override with
   `DESK_ALLOW_EXPIRED=1`; the desk never sets it) · 2 usage / no such question / already answered (another
   desk process claimed it first — nothing was applied twice).
   Pass the id exactly as `pending` printed it — never a path (`answered/…`, `../…`): the script refuses those.
5. Run: `~/.config/obsidian/v5-w12-desk.sh mirror` — rewrites the `## W12 desk — waiting on you`
   section of the Fleet note so the phone shows what is still open even without this tab.
6. Print one receipt line per answer, copied from the script's output, e.g. `q-…-held → append approve-held 3410 ✓`.
   The ✓/✗ is the op's result (its return code), not a word in the value — `append advisory-checks SDK review
   FAILED gate ✓` means the check name WAS added. Nothing else. No summary, no advice, no next steps.
   "Lift the stop" lifts ONLY the FROZEN line that question was about: when the receipt reads
   `unfreeze (lifted 1 line(s); 1 still on — a HARD stop is still in force …)`, read it back as written — an earlier
   hard stop is still holding the wave, and shipping stays blocked until that stop's own question is answered.

## What the desk never does

- **Never runs the wave.** No `ship-wave.sh go`, no `--goal`, no deploy hook. The wave's own launchd tick
  reads the knobs you appended on its next run.
- **Never merges** a PR, closes one, comments on one, or touches git.
- **Never messages a tab** except with the reminder line `nudges` printed, to the one tab it named, once — and never
  on its own idea. A reminder is not a question: it does not go to the Director.
- **Never invents an option.** If a question seems to be missing the right choice, the Director picks
  "Other" and types it; you store it. You do not add an option and you do not act on the free text.
- **Never rephrases `writes`.** The option's effect is the file's `writes` list, applied by the script.
  You do not translate a label into a different action, and you never append to `approve-held`,
  `allow-destructive` or `advisory-checks`, remove `FROZEN` (or any line of it), or ratify a policy by hand.
- **Never asks twice in one pass** and never re-asks a question the script has already moved to
  `questions/answered/`. Answering an already-answered id again is harmless: the script finds no open file
  and exits 2 without applying anything.
- Reads and writes nothing outside `$STATE/questions/` and `$STATE/nudges/` except through `v5-w12-desk.sh`.

## INSTALL

```
mkdir -p ~/.claude/skills/w12-desk
cp <ship-policy checkout>/scripts/ship-wave/desk/SKILL.md ~/.claude/skills/w12-desk/SKILL.md
ln -sf <ship-policy checkout>/scripts/ship-wave/desk/v5-w12-desk.sh ~/.config/obsidian/v5-w12-desk.sh
```
`<ship-policy checkout>` is the copy the live wave executes from (`/Users/omm/PROJECTS/MyJKKN-wt-ship-policy`).
Then, in a tab that stays live on the Director's phone account (the account his Claude app is signed
into — a phone lists only that account's rows), start the loop:

```
/loop 10m /w12-desk
```

Ten minutes is the ceiling on how long a question waits once he is looking; the wave itself ticks every
two hours, so an answer typed at minute 9 is still ahead of the next run. Do not run two desk loops on
two accounts — the second would re-ask what the first already moved.
