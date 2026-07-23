# Continuation Brief — JKKN MBA Teaching-Enterprise Initiative
_Generated 2026-07-22 20:20 via /cnext. Context was intact (full recall of the whole thread; all deliverables verified well-formed throughout)._

## TL;DR — where we are
This session designed a complete **"teaching enterprise" MBA model** for JKKN and captured it as **five standalone, self-contained HTML playbooks** in `/Users/omm/Downloads/JKKN-Playbooks/` (NOT in the git repo). The model: MBA learners are titled **Management Associates** who spend **1 hr/day in CEO Rounds + 2 hrs posted in a real JKKN department + the rest in learning studios**, are charged with **improving JKKN's own administration and systems**, and earn a **performance-linked stipend** once they prove competency. All content uses full **JKKN terminology** (learners / learning facilitators / team members / learning pathway / learning assessments). Everything is decided EXCEPT one open reconciliation (see OPEN DECISIONS).

## The five deliverables (all verified well-formed HTML, theme-aware, standalone)
- `index.html` — cover linking all four, with the shared objective + "how the four connect"
- `mba-r2026-playbook.html` — **14 parts** (the master doc: review + implementation + posting menu + stipend model)
- `ceo-rounds-rangarajan.html` — **6 parts** (CEO Rangarajan's daily 60-min war-room playbook)
- `cbo-playbook-mohanraj.html` — 9 parts (JICATE-NIF CBO business-development playbook)
- `mba-build-spec.html` — 7 parts (what to build in MyJKKN + the learning-views build backlog)

## VERIFY CURRENT STATE (run first, read-only)
```bash
ls -la /Users/omm/Downloads/JKKN-Playbooks/*.html          # 5 files should exist
# well-formedness re-check (should all print OK):
cd /Users/omm/Downloads/JKKN-Playbooks && for f in *.html; do python3 - "$f" <<'PY'
import sys
from html.parser import HTMLParser
class V(HTMLParser):
    def __init__(s): super().__init__(); s.st=[]; s.void={'meta','br','hr','img','link','input','area','base','col','embed','source','track','wbr'}
    def handle_starttag(s,t,a):
        if t not in s.void: s.st.append(t)
    def handle_endtag(s,t):
        if t in s.void: return
        if s.st and s.st[-1]==t: s.st.pop()
        elif t in s.st:
            while s.st and s.st.pop()!=t: pass
p=V(); p.feed(open(sys.argv[1]).read()); print(sys.argv[1], 'OK' if not p.st else p.st)
PY
done
# Tier-1 target tables (for the #1 task) — confirm live + columns:
#   admission_leads (~21,455 rows), invoices/payments (billing), events/event_registrations
# Supabase Mgmt API pattern used all session (read-only):
#   TOKEN=$(cat ~/.supabase/access-token); POST https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query  {"query":"..."}
```
Memory file with FULL detail: `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_mba_r2026_curriculum_review_playbook.md` (and `project_jicate_cbo_playbook_mohanraj.md`). READ THESE FIRST.

## KEY DECISIONS (all locked this session unless flagged OPEN)
- **Title:** learners = **Management Associate** — Senior (2nd-yr MBA), Junior (1st-yr MBA + final-yr BBA). NOT "trainee" (JKKN banned word). Juniors shadow/assist; Seniors co-lead/lead.
- **Daily rhythm:** 1 hr CEO Rounds + 2 hr department posting + rest in learning studios.
- **Who starts:** current 2nd-years now (R-2025 batch, 46 learners, verified in prod tagged R-2025 under JKKN College of Engineering & Technology). Inside their existing CIA components.
- **Data mandate:** don't just analyse existing data — BUILD purpose-specific info FOR Associates to improve JKKN's own administration/systems. Associates = administration-improvement task force feeding CEO's OKR-cascade + SOP mandates.
- **Data keys:** learning facilitators set up de-identified views; Associates read-only. Never touch base tables or PII.
- **Build order:** all three at once (data views + Improvement Board + CEO Rounds log), all departments (rolling wave as each is de-identified), graded from day one, Improvement Board run jointly by facilitators + CEO office.
- **Two jobs per posting:** (1) improve the function → Improvement Board; (2) drive MyJKKN digital ADOPTION + digitisation + AI-sensitisation + SOP docs in that department (solves "built it but nobody uses it").
- **Stipend model:** trigger = proven-skill milestone on Verified Skills Record; eligible = Seniors + exceptional Juniors; funded from a SHARE OF VALUE CREATED; performance-linked; value measured AUTOMATICALLY from MyJKKN system numbers; anti-gaming = only pay for impact that STILL HOLDS months later; pay follows current impact each term.
- **Edge rules:** fix could break live system → Associates PROPOSE ONLY (team members review/test/apply). Urgent finding → fast-track same day. Dept not ready → learning facilitator clears the way first. Same idea → best execution wins credit. Embarrassing finding → report quietly up-chain, fix-not-blame. Good idea → JKKN implements + full credit + may join build + product-worthy → JICATE/NIF.
- **CEO = Rangarajan Raghavachari** (real profile captured): 10,000+ hrs global trainer, GM HR/People-Excellence @ TVS, transformation-CEO who built an innovation centre in 6 months, lean+consumer-behaviour consulting. Facilitation is his native craft → daily Rounds ≈ zero prep. CPTO is his partner (people/capability lane).
- **NLB = former name of NIF** (current). JICATE Solutions = PRIVATE company independent of the colleges, on JKKN campus.
- **Terminology:** full JKKN branding applied; ONE deliberate exception = "Assignment" inside a verbatim Anna University methodology quote. Kept: CIA, Board of Studies, credits, course codes, R-2025/R-2026.

## OPEN DECISIONS (must resolve — not yet in the docs)
1. **Academics-vs-pay reconciliation (BLOCKER on finalising the playbook).** User's stipend edge-answer "trust them to balance study" CONFLICTS with the earlier LOCKED rule "academics always win — posting auto-pauses in exam windows, no exceptions." Two coherent readings to choose between:
   - (a) Posting + stipend still auto-pause in exam windows; "trust them" governs only normal weeks. (Protects the academics-first promise.)
   - (b) Relax the auto-pause entirely; Associates manage their own time incl. exams.
   → Ask the user which, then finalise in ONE edit to `mba-r2026-playbook.html` (add the chosen line near the stipend-model callout in Part 14 + the policy table).
2. **Stipend fine print:** exact competency-milestone that unlocks pay, and the **attribution rule** for splitting "value created" when multiple people contributed to one saving (automatic measurement can't attribute or capture qualitative value on its own).
3. **"and wrc"** — an unparsed fragment from a user message earlier; never clarified. Ask what it meant.

## WHAT NEEDS TO HAPPEN (user-ranked; rank 1 = start here)
1. **[P0 — START HERE] Build the Tier-1 de-identified learning views + `mba_learner_analyst` role** against production. SHOW SQL FIRST, then impersonation-test as the role before go-live (confirm no PII column reachable). Tier-1 = `learning_admission_funnel` / `learning_conversion_gaps` / `learning_channel_roi` (admissions), `learning_fee_aging` / `learning_collection_rate` / `learning_defaulter_risk` (finance), `learning_event_attendance` / `learning_event_feedback` / `learning_event_budget_actual` (events). Improvement-ORIENTED (surface what to fix, not just what exists). Role: read-only on views only, REVOKE from anon+PUBLIC, GRANT authenticated. See build-spec Part 7 for the full tiered backlog + columns-to-exclude. (medium)
2. **[P0] Build the Improvement Board + CEO Rounds log** — the other two of "all three at once." Build on existing patterns: `learners-council/issues` / bug_reports for the Board; meetings pattern for the log. Bake in the edge rules (propose-only, urgent fast-track, quiet-reporting). (medium)
3. **[P0] Settle academics-vs-pay** (OPEN DECISION #1) — 1-answer unblock; finalise the playbook. (small)
4. **[P1] Define stipend rules** (OPEN DECISION #2) — competency-milestone + value-attribution rule; then add a "value ledger / impact-measurement" build item to the build spec. (small-medium)
5. **[P2] Also pending:** map adoption-drive starter checklist per department into the Improvement Board; clarify "wrc"; optional PDF render of the playbooks for circulation; 2nd-year data cleanup (58 MBA learner records have no batch/regulation set).

## CRITICAL REMINDERS
- **Playbooks are in `~/Downloads/JKKN-Playbooks/`, NOT the repo.** Editing pattern all session: Edit tool on exact strings, then re-run the well-formedness python check. macOS `sed` has NO `\b` — use python for word-boundary replacements.
- **Any build against production = SHOW SQL FIRST** (show-SQL-first discipline), new RPCs/roles must `REVOKE FROM anon, PUBLIC`, and impersonation-test authz before trusting it (known systemic is_admin() RLS leak in this platform).
- **Rule: Associates PROPOSE, team members APPLY.** No "apply to live system" button for Associates.
- Supabase prod ref = `kvizhngldtiuufknvehv`; Mgmt token at `~/.supabase/access-token`; query via `POST /v1/projects/<ref>/database/query`.
