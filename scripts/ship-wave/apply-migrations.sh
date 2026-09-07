#!/bin/bash
# scripts/ship-wave/apply-migrations.sh — W12 stage 3b: apply merged migrations to production, one file at a
# time, through the Supabase Management API. Sourced by ship-wave.sh; defines apply_migrations() for it.
#
# WHY NOT THE GITHUB WORKFLOW (the 2026-09-05 14:41 freeze): "Apply Supabase migrations" runs `supabase db push`,
# which refuses because prod's supabase_migrations.schema_migrations holds 1,616 versions that are not files in
# the repo (out-of-band applies). Its 09-03 "success" was a swallowed `|| true`. It can never apply anything.
# The per-file Management-API path below is the one proven since 2026-06-14 (memory: myjkkn-prod-db-apply).
#
# PER VERSION — every failure freezes the wave, so the previous deploy stays live and nothing half-ships:
#   1 resolve the file on jicate/main (exactly one match)   5 apply    BEGIN; <file>; COMMIT;
#   2 already in schema_migrations? → "skipped (in history)" 6 record   insert into schema_migrations(version,name)
#   3 destructive statement (comments stripped) → refuse    7 reload   select pg_notify('pgrst','reload schema')
#   4 dry-run  BEGIN; <file>; ROLLBACK;  → response must be []   8 verify   a second history read must return the row
# Only additive SQL runs unattended (step 3 is a hard refusal, not a warning). Runs BEFORE the deploy hook so live
# code never meets a missing column. DRY_RUN=1 stops after step 4 and reports "migration step failed" so nothing
# deploys — the local test switch. MYJKKN_PROD_REF overrides the project (tests point it at staging).
# The Director fires the wave; this stage is the only actor that touches the production database.

PROD_REF="${MYJKKN_PROD_REF:-kvizhngldtiuufknvehv}"                 # "MyJKKN (boobal)" — what www.jkkn.ai uses
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
MGMT_URL="https://api.supabase.com/v1/projects/$PROD_REF/database/query"

mgmt_sql() {  # $1 = file whose whole content is the SQL → prints the JSON response (never prints the token)
  local tok; tok=$(cat "$TOKEN_FILE" 2>/dev/null) || { echo '{"message":"no access token at '"$TOKEN_FILE"'"}'; return 1; }
  jq -n --rawfile sql "$1" '{query:$sql}' | curl -sS -A "curl/8.7.1" -X POST "$MGMT_URL" \
    -H "Authorization: Bearer $tok" -H "Content-Type: application/json" --data-binary @- 2>&1
}
mgmt_q() {  # $1 = one SQL statement → JSON response
  local f; f=$(mktemp); printf '%s' "$1" > "$f"; mgmt_sql "$f"; local rc=$?; rm -f "$f"; return $rc
}
resp_error() {  # $1 = JSON response → prints the error text if any; prints nothing when the call was clean
  python3 -c '
import json, sys
raw = sys.stdin.read()
try: d = json.loads(raw)
except Exception: print("non-JSON response: " + raw[:200].replace("\n", " ")); sys.exit()
if isinstance(d, dict) and d.get("message"): print(str(d["message"])[:300].replace("\n", " "))' <<<"$1"
}
in_history() {  # $1 = version → 0 recorded in prod history · 1 not recorded · 2 the query itself failed
  local r; r=$(mgmt_q "select version from supabase_migrations.schema_migrations where version='$1'") || return 2
  [ -n "$(resp_error "$r")" ] && return 2
  python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin) else 1)' <<<"$r"
}

apply_one() {  # $1 = version → 0 applied · 3 skipped (in history) · 4 DRY_RUN stop · 1 failed (wave already frozen)
  local v="$1" path base file n err r
  # 1. the file comes from production main — never the local checkout, which is ~1600 commits behind
  path=$(git -C "$WT" ls-tree -r --name-only jicate/main -- supabase/migrations | grep "^supabase/migrations/${v}_")
  n=$(printf '%s' "$path" | grep -c .)
  if [ "$n" -ne 1 ]; then freeze "migration $v: $n files on jicate/main match (need exactly 1) $(printf '%s' "$path" | tr '\n' ' ' | cut -c1-120)"; return 1; fi
  base=$(basename "$path" .sql); file="$RUN_DIR/$base.sql"
  git -C "$WT" show "jicate/main:$path" > "$file" 2>/dev/null || { freeze "migration $v: cannot read $path from jicate/main"; return 1; }
  # 2. already applied? — 5 of 8 "pending" versions on 2026-09-05 had been applied by hand earlier
  in_history "$v"; case $? in
    0) say "  $v skipped (already in history)"; return 3;;
    2) freeze "migration $v: the history query failed (401 = stale access token, not a missing table)"; return 1;;
  esac
  # 3. additive only — comments AND quoted strings stripped first: #2806 says "truncate" in a remark, and
  #    20260905010000 checks has_table_privilege(…, 'TRUNCATE') as a security self-test — neither is a statement
  if sed -E "s/--.*\$//; s/'[^']*'//g" "$file" | grep -iqE '\b(DROP[[:space:]]+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE[[:space:]]+FROM)\b'; then
    # Director 2026-09-06 07:12: after review he can allow ONE version by writing it to $STATE/allow-destructive
    # (one per line). Consumed on apply and written to the ledger — never a standing permission. The wave stays
    # the only actor that touches production; the human stays the one who decides.
    if grep -qx "$v" "$STATE/allow-destructive" 2>/dev/null; then
      say "  $v: destructive statement ALLOWED by the Director after review (allow-destructive) — applying"
      type -t ledger_record >/dev/null 2>&1 && ledger_record resolved "destructive migration $v applied on an explicit allow" "allow-destructive"
      grep -vx "$v" "$STATE/allow-destructive" > "$STATE/allow-destructive.new"; mv "$STATE/allow-destructive.new" "$STATE/allow-destructive"
    else
      freeze "migration $v: destructive statement in $base — a human applies this one after review"; return 1
    fi
  fi
  # 4. dry-run inside a rolled-back transaction: catches a missing dependency without persisting anything
  { echo "BEGIN;"; cat "$file"; echo "ROLLBACK;"; } > "$file.dry"
  r=$(mgmt_sql "$file.dry"); err=$(resp_error "$r")
  if [ -n "$err" ]; then freeze "migration $v: DRY-RUN failed — $err"; return 1; fi
  say "  $v dry-run clean (BEGIN…ROLLBACK)"
  if [ -n "${DRY_RUN:-}" ]; then say "  $v DRY_RUN=1 — stopping before the real apply"; return 4; fi
  # 5. apply, atomically
  { echo "BEGIN;"; cat "$file"; echo "COMMIT;"; } > "$file.apply"
  r=$(mgmt_sql "$file.apply"); err=$(resp_error "$r")
  if [ -n "$err" ]; then freeze "migration $v: APPLY failed — $err"; return 1; fi
  # 6. record it, so the next sweep (and any human reading the history) sees it
  r=$(mgmt_q "insert into supabase_migrations.schema_migrations(version,name) values ('$v','$base')"); err=$(resp_error "$r")
  if [ -n "$err" ]; then freeze "migration $v: APPLIED but the history insert failed — $err (record it by hand, then --unfreeze)"; return 1; fi
  # 7. PostgREST learns about new tables / functions
  r=$(mgmt_q "select pg_notify('pgrst','reload schema')"); err=$(resp_error "$r")
  if [ -n "$err" ]; then say "  $v pgrst reload returned: $err (applied + recorded; reload by hand if the API misses it)"; fi
  # 8. verify with a second, independent read of the history
  in_history "$v" || { freeze "migration $v: applied + recorded, but the verify read did not find it"; return 1; }
  say "  ✓ $v applied + recorded + verified"; return 0
}

apply_migrations() {  # $1 = merged-files.txt → sets APPLY_RESULT; returns 0 ok / 1 frozen (or DRY_RUN stop)
  local expected pending v applied=0 skipped=0 rc
  RUN_DIR=$(dirname "$1")
  expected=$(grep -E '^supabase/migrations/[0-9]+_' "$1" | sed -E 's#^supabase/migrations/([0-9]+)_.*#\1#' | sort -u)
  # $STATE/migrations-pending = versions merged but not yet verified in prod history. Union this round's into it
  # so a failed or interrupted round never loses a version; each version leaves the file only on 0 or 3 below.
  { cat "$STATE/migrations-pending" 2>/dev/null; printf '%s\n' "$expected"; } | grep -E '^[0-9]{14}$' | sort -u > "$STATE/migrations-pending.new"
  mv "$STATE/migrations-pending.new" "$STATE/migrations-pending"
  pending=$(cat "$STATE/migrations-pending")
  if [ -z "$pending" ]; then rm -f "$STATE/migrations-pending"; APPLY_RESULT="no migration pending"; return 0; fi
  # Refresh jicate/main BEFORE resolving any file. apply_one reads the .sql out of the jicate/main ref,
  # and this stage runs seconds after the merge that added it — so the local ref is always one commit
  # stale here and the file is invisible. On 2026-09-05 22:32 that froze the wave on the very first
  # migration it ever tried to apply ("0 files on jicate/main match"), with the file plainly on main.
  git -C "$WT" fetch jicate main -q 2>/dev/null || say "  warn: could not refresh jicate/main — file resolution may be stale"
  say "  pending versions: $(printf '%s' "$pending" | tr '\n' ' ')  (project $PROD_REF)"
  for v in $pending; do
    apply_one "$v"; rc=$?
    case $rc in
      0|3) if [ $rc -eq 0 ]; then applied=$((applied+1)); else skipped=$((skipped+1)); fi
           grep -v "^$v\$" "$STATE/migrations-pending" > "$STATE/migrations-pending.new"; mv "$STATE/migrations-pending.new" "$STATE/migrations-pending";;
      4)   APPLY_RESULT="DRY_RUN=1 — stopped after the rollback dry-run ($applied applied, $skipped skipped before it)"; return 1;;
      *)   APPLY_RESULT="FAILED at $v ($applied applied, $skipped skipped before it)"; return 1;;
    esac
  done
  [ -s "$STATE/migrations-pending" ] || rm -f "$STATE/migrations-pending"
  APPLY_RESULT="applied + verified ($applied applied, $skipped skipped)"; say "  ✓ $APPLY_RESULT"; return 0
}
