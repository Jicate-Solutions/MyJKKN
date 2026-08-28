#!/usr/bin/env python3
"""
JKKN terminology — DELTA + UI-SCOPE gate (BLOCKING).

Wraps the canonical dictionary in .claude/skills/jkkn-terminologies (single
source of truth — CRITICAL_TERMS imported, never duplicated) and applies it to:
  - ONLY the lines this PR ADDS (delta-only — never the legacy backlog), and
  - ONLY lines that look like user-facing copy (a quoted string or JSX text),
    not identifiers/imports/comments — because `\\bstaff\\b` etc. otherwise
    match variable and route names, which is unactionable noise.

Enforces the CRITICAL ("zero-tolerance") tier only. BLOCKING as of the Director's
2026-07-14 ruling (an advisory comment on #2049 went unread past a fast merge):
this script still ALWAYS exits 0 (so the comment gets posted either way) — the
WORKFLOW fails the check when the report is non-empty.

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
# Quote characters. A quote is an identifier signal only when it wraps BOTH
# sides of the match — see the neighbour test in main().
QUOTES = "'\"`"
# Multiline JSX text carries NO quotes ("Answer honestly; that is what improves
# the classes." escaped the 2049 scan) — treat a 4+-word pure-prose line in
# .tsx/.jsx as copy too. Prose tokens only: any code char ({}<>=`$) disqualifies.
PROSE_TOKEN = r"[A-Za-z0-9,.;:'\u2019\u201c\u201d&%()!?\u2014\u2013\u2026/-]+"
PROSE_JSX = re.compile(rf"^\s*(?:{PROSE_TOKEN}\s+){{3,}}{PROSE_TOKEN}\s*$")

def added_lines(base, head):
    """Yield (file, new_line_no, text, in_comment) for lines this PR adds in
    copy-bearing files. in_comment tracks JSX/TS block comments ({/* … */} and
    /* … */) across the hunk (unified=2 context) — comment prose is authored
    for developers, not learners, so the PROSE_JSX heuristic must not flag it."""
    out = subprocess.run(
        ["git", "diff", "--unified=2", "--no-color", f"{base}...{head}", "--",
         "*.tsx", "*.jsx", "*.ts", "*.md", "*.mdx"],
        capture_output=True, text=True, check=False).stdout
    cur_file, new_no, in_comment = None, 0, False
    for line in out.splitlines():
        if line.startswith("+++ b/"):
            cur_file = line[6:]
            in_comment = False
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            new_no = int(m.group(1)) if m else 0
        elif line.startswith("+") and not line.startswith("+++"):
            text = line[1:]
            was_in_comment = in_comment
            if "/*" in text and "*/" not in text.split("/*", 1)[1]:
                in_comment = True
            if "*/" in text:
                in_comment = False
            # The terminology skill's own docs must NAME the prohibited terms —
            # never scan the dictionary against itself. Machine-generated files
            # (route manifest etc.) carry structural keys, not copy (2026-07-15:
            # the manifest's "children" keys flagged on every new-page PR).
            if (
                cur_file
                and cur_file.endswith(EXfP)
                and ".generated." not in cur_file
                and not cur_file.startswith(".claude/skills/jkkn-terminologies/")
            ):
                yield cur_file, new_no, text, was_in_comment or in_comment
            new_no += 1
        elif not line.startswith("-"):
            text = line[1:] if line else ""
            if "/*" in text and "*/" not in text.split("/*", 1)[1]:
                in_comment = True
            if "*/" in text:
                in_comment = False
            new_no += 1

def main():
    if len(sys.argv) < 3:
        print("usage: check-terminology-delta.py <BASE_SHA> <HEAD_SHA>", file=sys.stderr); sys.exit(0)
    base, head = sys.argv[1], sys.argv[2]
    terms = load_critical_terms()
    if terms is None:
        sys.exit(0)
    compiled = [(re.compile(p, re.IGNORECASE), repl) for p, repl in terms.items()]

    # Assessment-domain words are entrenched platform + university vocabulary
    # (the module is NAMED Internal Marks; "max marks", COE marks entry; "grades"
    # matches the verb). Enforcing them would fail routine work — the skill still
    # recommends learning-assessment phrasing in fresh learner-facing prose.
    DOMAIN_EXEMPT = {"mark", "marks", "grade", "grades", "grading"}

    hits = []
    for f, ln, text, in_comment in added_lines(base, head):
        if SKIP_LINE.search(text):
            continue
        is_copy = QUOTE_OR_JSX.search(text) or (
            not in_comment and f.endswith((".tsx", ".jsx")) and PROSE_JSX.match(text)
        )
        if not is_copy:
            continue
        for rx, repl in compiled:
            for m in rx.finditer(text):
                if m.group().lower() in DOMAIN_EXEMPT:
                    continue
                # {children} etc. — a brace-wrapped match is a code expression
                # (React children prop), not copy.
                if (
                    m.start() > 0
                    and text[m.start() - 1] == "{"
                    and m.end() < len(text)
                    and text[m.end()] == "}"
                ):
                    continue
                # Identifier/path context, not prose (2026-07-15 — the gate's
                # own docstring calls these "unactionable noise").
                prev_ch = text[m.start() - 1] if m.start() > 0 else ""
                next_ch = text[m.end()] if m.end() < len(text) else ""
                # A quote/backtick is an identifier signal only when it wraps
                # BOTH sides — ['student'], `student`, "student". A quote on
                # ONE side means the term is merely the first or last word of a
                # longer string, which is copy: 'Faculty & tutor hires …' and
                # `… ${n} students` both escaped this gate that way (2026-08).
                if prev_ch in QUOTES and next_ch in QUOTES:
                    continue
                # Bracket, slash, hyphen, dot, question mark: genuinely
                # one-sided path/identifier markers — '/api/v1/student-cia-view',
                # "children":, .student, student?: — unchanged.
                if prev_ch in "[/-." or next_ch in "]/-?":
                    continue
                hits.append((f, ln, m.group(), repl, text.strip()[:100]))
                break  # one report per (line, term) is enough

    if not hits:
        print("")  # empty → workflow skips posting
        return

    seen, rows = set(), []
    for f, ln, term, repl, snippet in hits:
        key = (f, ln, term.lower())
        if key in seen: continue
        seen.add(key)
        safe = snippet.replace("|", "\\|")   # escape table delimiter (no backslash in f-string expr — py3.11)
        rows.append(f"| `{f}:{ln}` | **{term}** → `{repl}` | {safe} |")

    print("<!-- jkkn-terminology -->")
    print("## 🗣️ JKKN Terminology (blocking)\n")
    print(f"This PR's new copy uses {len(rows)} term(s) that the JKKN zero-tolerance "
          "standard maps to learner-centered language. Delta-only (new lines). This check "
          "FAILS until the terms are fixed. Source: `.claude/skills/jkkn-terminologies`.\n")
    print("| Location | Term → JKKN term | Line |")
    print("| --- | --- | --- |")
    print("\n".join(rows[:25]))
    if len(rows) > 25:
        print(f"\n_…and {len(rows) - 25} more._")

if __name__ == "__main__":
    main()
