#!/usr/bin/env python3
"""
JKKN terminology — DELTA + UI-SCOPE gate (advisory).

Wraps the canonical dictionary in .claude/skills/jkkn-terminologies (single
source of truth — CRITICAL_TERMS imported, never duplicated) and applies it to:
  - ONLY the lines this PR ADDS (delta-only — never the legacy backlog), and
  - ONLY lines that look like user-facing copy (a quoted string or JSX text),
    not identifiers/imports/comments — because `\\bstaff\\b` etc. otherwise
    match variable and route names, which is unactionable noise.

Enforces the CRITICAL ("zero-tolerance") tier only — the Director's chosen scope.
Advisory: prints a markdown report to stdout and ALWAYS exits 0. The workflow
posts it as a PR comment; it never blocks a merge.

Usage: check-terminology-delta.py <BASE_SHA> <HEAD_SHA>
"""
import re, subprocess, sys, importlib.util
from pathlib import Path

REPO = Path.cwd()
VALIDATOR = REPO / ".claude/skills/jkkn-terminologies/scripts/validate_terminology.py"

def load_critical_terms():
    """Import CRITICAL_TERMS from the canonical skill validator (single source)."""
    if not VALIDATOR.exists():
        print(f"::warning::terminology dictionary not found at {VALIDATOR} — skipping.", file=sys.stderr)
        return None
    spec = importlib.util.spec_from_file_location("jkkn_validator", VALIDATOR)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CRITICAL_TERMS

# Only these file types carry user-facing copy worth linting.
EXfP = (".tsx", ".jsx", ".ts", ".md", ".mdx")
# A line is "copy" if it has a quoted string or JSX text (>word<). Skips pure
# code/identifier lines, imports, and comments.
QUOTE_OR_JSX = re.compile(r"""["'`]|>[^<>]*[A-Za-z]{2,}[^<>]*<""")
SKIP_LINE = re.compile(r"""^\s*(import\s|//|/\*|\*\s|\*/)""")

def added_lines(base, head):
    """Yield (file, new_line_no, text) for lines this PR adds in copy-bearing files."""
    out = subprocess.run(
        ["git", "diff", "--unified=0", "--no-color", f"{base}...{head}", "--",
         "*.tsx", "*.jsx", "*.ts", "*.md", "*.mdx"],
        capture_output=True, text=True, check=False).stdout
    cur_file, new_no = None, 0
    for line in out.splitlines():
        if line.startswith("+++ b/"):
            cur_file = line[6:]
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            new_no = int(m.group(1)) if m else 0
        elif line.startswith("+") and not line.startswith("+++"):
            text = line[1:]
            if cur_file and cur_file.endswith(EXfP):
                yield cur_file, new_no, text
            new_no += 1
        elif not line.startswith("-"):
            new_no += 1

def main():
    if len(sys.argv) < 3:
        print("usage: check-terminology-delta.py <BASE_SHA> <HEAD_SHA>", file=sys.stderr); sys.exit(0)
    base, head = sys.argv[1], sys.argv[2]
    terms = load_critical_terms()
    if terms is None:
        sys.exit(0)
    compiled = [(re.compile(p, re.IGNORECASE), repl) for p, repl in terms.items()]

    hits = []
    for f, ln, text in added_lines(base, head):
        if SKIP_LINE.search(text) or not QUOTE_OR_JSX.search(text):
            continue
        for rx, repl in compiled:
            m = rx.search(text)
            if m:
                hits.append((f, ln, m.group(), repl, text.strip()[:100]))

    if not hits:
        print("")  # empty → workflow skips posting
        return

    seen, rows = set(), []
    for f, ln, term, repl, snippet in hits:
        key = (f, ln, term.lower())
        if key in seen: continue
        seen.add(key)
        rows.append(f"| `{f}:{ln}` | **{term}** → `{repl}` | {snippet.replace('|','\\|')} |")

    print("<!-- jkkn-terminology -->")
    print("## 🗣️ JKKN Terminology (advisory)\n")
    print(f"This PR's new copy uses {len(rows)} term(s) that the JKKN zero-tolerance "
          "standard maps to learner-centered language. Delta-only (new lines), advisory — "
          "merge not blocked. Source: `.claude/skills/jkkn-terminologies`.\n")
    print("| Location | Term → JKKN term | Line |")
    print("| --- | --- | --- |")
    print("\n".join(rows[:25]))
    if len(rows) > 25:
        print(f"\n_…and {len(rows) - 25} more._")

if __name__ == "__main__":
    main()
