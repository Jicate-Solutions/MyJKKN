#!/usr/bin/env python3
"""Merge per-PR hydration files into one prs.json for the ship wave.

One GraphQL call for 100+ PRs x files x checks 504s at GitHub (seen 2026-09-05), so the
wave fetches a light list, then `gh pr view` per PR in parallel. A PR whose hydration
failed keeps an EMPTY file list, which classify() holds as HELD (unknown risk = held).
Usage: hydrate.py <run dir>   (reads light.json + pr/*.json, writes prs.json)
"""
import glob
import json
import sys

d = sys.argv[1]
light = json.load(open(f"{d}/light.json"))
extra = {}
for f in glob.glob(f"{d}/pr/*.json"):
    try:
        x = json.load(open(f))
        extra[x["number"]] = x
    except Exception:
        pass
failed = 0
for p in light:
    x = extra.get(p["number"], {})
    p["files"] = x.get("files", [])
    p["statusCheckRollup"] = x.get("statusCheckRollup", [])
    # quiet rule (Director 2026-09-05 23:40): only a real push restarts the "author may still be typing"
    # wait. updatedAt also moves on a CI re-run or a comment — #3164 waited 30 min for a re-run tonight.
    p["headCommittedAt"] = ((x.get("commits") or [{}])[-1] or {}).get("committedDate", "")
    if x.get("hydrate_failed") or p["number"] not in extra:
        failed += 1
        p["files"] = []
json.dump(light, open(f"{d}/prs.json", "w"))
print(f"  hydrated {len(light) - failed}/{len(light)} PRs" + (f" — {failed} unreadable → HELD" if failed else ""))
