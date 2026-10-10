"""Keep supabase/setup/0[1-4] in step with the grievance migration.

The fresh-install setup files carry this migration's statements too. Hand
copies drifted (a review found round-1 rules still in setup while the
migration had moved on), so the setup region is GENERATED from the migration:
every top-level statement, with the comments above it, in the migration's
order, placed in the file a fresh install runs it from:

  01_tables    ALTER TABLE ... ADD COLUMN, COMMENT ON COLUMN
  03_policies  CREATE / DROP POLICY
  04_triggers  CREATE / DROP TRIGGER, and the final self-check (section 14,
               which needs the policies and triggers to exist)
  02_functions everything else (seeds, functions, grants, the patch blocks)

usage:
  python3 supabase/tests/grievance/mirror_setup.py           # rewrite the regions
  python3 supabase/tests/grievance/mirror_setup.py --check   # exit 1 if they differ

The region in each setup file starts at this migration's generated header and
runs to the next migration's header (or the end of the file).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
MIGRATION = 'supabase/migrations/20271010020000_grievance_sla_escalation.sql'
FILES = ['01_tables', '02_functions', '03_policies', '04_triggers']
SOURCE_LINE = '-- Source of truth for apply: ' + MIGRATION


def split_statements(sql):
    """Top-level statements, each with the comments and blank lines before it."""
    out, start, i, n = [], 0, 0, len(sql)
    while i < n:
        c = sql[i]
        if sql.startswith('--', i):
            j = sql.find('\n', i)
            i = n if j < 0 else j + 1
        elif sql.startswith('/*', i):
            depth, i = 1, i + 2
            while i < n and depth:
                if sql.startswith('/*', i):
                    depth, i = depth + 1, i + 2
                elif sql.startswith('*/', i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
        elif c == "'":
            i += 1
            while i < n:
                if sql[i] == "'" and i + 1 < n and sql[i + 1] == "'":
                    i += 2
                elif sql[i] == "'":
                    i += 1
                    break
                else:
                    i += 1
        elif c == '"':
            j = sql.find('"', i + 1)
            i = n if j < 0 else j + 1
        elif c == '$':
            m = re.match(r'\$([A-Za-z_][A-Za-z0-9_]*)?\$', sql[i:])
            if m and (i == 0 or not re.match(r'[A-Za-z0-9_]', sql[i - 1])):
                tag = m.group(0)
                j = sql.find(tag, i + len(tag))
                i = n if j < 0 else j + len(tag)
            else:
                i += 1
        elif c == ';':
            out.append(sql[start:i + 1])
            start = i + 1
            i += 1
        else:
            i += 1
    tail = sql[start:]
    return out, tail


def code_of(stmt):
    """The statement without its leading comments / blank lines."""
    lines = stmt.split('\n')
    k = 0
    while k < len(lines) and (lines[k].strip() == '' or lines[k].lstrip().startswith('--')):
        k += 1
    return '\n'.join(lines[k:]).strip()


def target(stmt):
    code = code_of(stmt).upper()
    head = re.sub(r'\s+', ' ', code[:200])
    if '14) SELF-CHECK' in stmt.upper():
        return '04_triggers'
    if head.startswith(('CREATE POLICY', 'DROP POLICY')):
        return '03_policies'
    if head.startswith(('CREATE TRIGGER', 'DROP TRIGGER')):
        return '04_triggers'
    if head.startswith('COMMENT ON COLUMN') or (head.startswith('ALTER TABLE') and ' ADD COLUMN' in head):
        return '01_tables'
    return '02_functions'


def header(part):
    return ('-- =====================================================================\n'
            f'-- Grievance escalation + "about the Joint MD" ({part}): GENERATED from the\n'
            '-- migration by supabase/tests/grievance/mirror_setup.py — do not edit by hand.\n'
            f'{SOURCE_LINE}\n'
            '-- =====================================================================\n')


def generate():
    sql = open(os.path.join(ROOT, MIGRATION)).read()
    stmts, _tail = split_statements(sql)
    parts = {f: [] for f in FILES}
    for st in stmts:
        parts[target(st)].append(st.strip('\n') + '\n')
    return {f: header(f[3:]) + '\n'.join(parts[f]) for f in FILES}


HEADER_START = re.compile(r'^-- =+\n(?:--[^\n]*\n){1,4}?-- Source of truth for apply: ([^\n]+)\n', re.M)


def region(text):
    """(start, end) of this migration's region, or None."""
    heads = [(m.start(), m.group(1).strip()) for m in HEADER_START.finditer(text)]
    ours = [h for h in heads if h[1] == MIGRATION]
    if not ours:
        return None
    start = ours[0][0]
    later = [h[0] for h in heads if h[0] > ours[-1][0] and h[1] != MIGRATION]
    return start, (later[0] if later else len(text))


def main():
    check = '--check' in sys.argv
    gen = generate()
    bad = []
    for f in FILES:
        path = os.path.join(ROOT, 'supabase', 'setup', f + '.sql')
        text = open(path).read()
        r = region(text)
        if r is None:
            bad.append(f'{f}: no region for {MIGRATION}')
            continue
        a, b = r
        want = gen[f] + ('\n' if b < len(text) else '')
        if text[a:b] != want:
            bad.append(f)
            if not check:
                open(path, 'w').write(text[:a] + want + text[b:])
    if check:
        if bad:
            sys.stderr.write('FAIL: supabase/setup is out of step with ' + MIGRATION + ': ' + ', '.join(bad)
                             + '\n  run: python3 supabase/tests/grievance/mirror_setup.py\n')
            sys.exit(1)
        print('setup mirror in step')
    else:
        print('regenerated: ' + (', '.join(bad) if bad else 'nothing to change'))


if __name__ == '__main__':
    main()
