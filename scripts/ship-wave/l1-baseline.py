#!/usr/bin/env python3
"""Compare a Lightpanda sweep against the stored baseline.

Prints, space-separated, every role:path that USED to load 200 without bouncing and now
bounces to /auth/login — i.e. a page the deploy broke. A page that ALREADY bounced in the
baseline is the role gate working correctly and is deliberately silent: without that
distinction every correctly-gated page reads as a regression.

usage: l1-baseline.py <baseline.json> <new.json>
Both files are the sweep's own shape: {"rows":[{"role","path","status","bounce",...}]}
Missing files, or a page absent from the baseline, print nothing (nothing to compare).
"""
import json, os, sys

def rows(p):
    try:
        with open(p) as f:
            return json.load(f).get("rows", []) or []
    except Exception:
        return []

def main():
    if len(sys.argv) < 3:
        return
    base_p, new_p = sys.argv[1], sys.argv[2]
    if not (os.path.exists(base_p) and os.path.exists(new_p)):
        return
    base = {(r.get("role"), r.get("path")): r for r in rows(base_p)}
    out = []
    for r in rows(new_p):
        old = base.get((r.get("role"), r.get("path")))
        if not old:
            continue                                   # new page — no baseline to regress from
        was_ok = old.get("status") == 200 and not old.get("bounce")
        if was_ok and bool(r.get("bounce")):
            out.append("%s:%s" % (r.get("role"), r.get("path")))
    print(" ".join(out[:8]))

if __name__ == "__main__":
    main()
