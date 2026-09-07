#!/bin/bash
# hydrate-one.sh <pr-number> — fetch one PR's files + check runs (3 tries) into $OUT/<n>.json.
# Called by ship-wave.sh via xargs -P 8; a failed fetch writes an empty file list so the
# classifier HOLDS the PR (unknown risk = held) instead of guessing.
n="$1"
for t in 1 2 3; do
  gh pr view "$n" --repo "$REPO" --json number,files,statusCheckRollup,commits > "$OUT/$n.json" 2>/dev/null && exit 0
  sleep $((t * 3))
done
printf '{"number":%s,"files":[],"statusCheckRollup":[],"hydrate_failed":true}' "$n" > "$OUT/$n.json"
