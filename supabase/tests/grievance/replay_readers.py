"""Migration order + the readers as main's migrations leave them.

Called by run.sh (local rehearsal only). Two jobs:

1. ORDER. Supabase replays migrations in filename order. This migration
   patches five SECURITY DEFINER readers in place and re-creates
   fn_generate_unresolved_issue_items and its own fn_grievance_* functions; if
   any LATER-numbered migration re-creates one of them, a fresh replay drops
   the about-the-Joint-MD rule again (deep review of #4079 round 2, H1: the
   file was numbered 20270420090000, below 20271008110101's rewrite of
   fn_my_desk_waiting). Exit 1 naming the offending file.

2. REPLAY. Print, for each reader, the CREATE statement from the newest
   migration that defines it and sorts BEFORE this one (main's order), with
   the function moved into schema `replay` as replay_<name>. run.sh loads them before the
   migration; 30_reader_patch_forms.sql then runs the patch on those real
   bodies and re-creates them, so the rewrite is proved to parse on the text
   production holds, not only on the stubs.

3. BASELINE (round 5, M2). Section 9 re-creates
   fn_generate_unresolved_issue_items from the newest definition BEFORE this
   file and checks the live body's md5 against it. Exit 1 if that newest
   definition's md5 is not the baseline the migration checks for (a newer
   definition appeared before this file and section 9 must be re-derived).
   With --pre, print that newest definition (into public) instead, so the
   rehearsal applies the migration on top of it and exercises the check.

usage: replay_readers.py <migrations dir> <this migration's file name> [--pre]
"""
import hashlib
import os
import re
import sys

READERS = ['fn_my_desk_waiting', 'fn_dashboard_metrics', 'fn_compute_ohs_for_institution',
           'fn_hod_metrics', 'fn_compute_dhs_for_user']
REPLACED = READERS + ['fn_generate_unresolved_issue_items', 'get_grievance_sla_stats', 'emit_grievance_evidence']

mig_dir, ours = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(mig_dir) if re.match(r'^\d+_.*\.sql$', f))
ours_text = open(os.path.join(mig_dir, ours)).read()
own_fns = sorted(set(re.findall(r'FUNCTION public\.(fn_grievance_[a-z_]+)\(', ours_text)))


def defines(text, name):
    return re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?' + name + r'\s*\(', text, re.I)


later = [f for f in files if f > ours]
bad = []
for f in later:
    text = open(os.path.join(mig_dir, f)).read()
    for name in REPLACED + own_fns:
        if defines(text, name):
            bad.append(f'{f} re-creates {name}')
def newest_before(name):
    src = None
    for f in files:
        if f >= ours:
            break
        text = open(os.path.join(mig_dir, f)).read()
        if defines(text, name):
            src = (f, text)
    return src


def statement(text, name):
    m = list(re.finditer(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?' + name + r'\s*\(', text, re.I))[-1]
    tag = re.compile(r'\bAS\s+(\$[A-Za-z_0-9]*\$)', re.I).search(text, m.end())
    close = text.index(tag.group(1), tag.end())
    semi = text.index(';', close + len(tag.group(1)))
    return text[m.start():semi + 1], text[tag.end():close]


gen = newest_before('fn_generate_unresolved_issue_items')
if gen is None:
    bad.append('no migration before this one defines fn_generate_unresolved_issue_items')
else:
    gen_stmt, gen_body = statement(gen[1], 'fn_generate_unresolved_issue_items')
    gen_md5 = hashlib.md5(gen_body.encode()).hexdigest()
    if gen_md5 not in ours_text:
        bad.append(f'{gen[0]} defines fn_generate_unresolved_issue_items (md5 {gen_md5}), which section 9 was not '
                   'derived from: re-derive section 9 from it and update the baseline md5')
if '--pre' in sys.argv:
    if bad:
        sys.stderr.write('FAIL: ' + '\n  '.join(bad) + '\n')
        sys.exit(1)
    print(gen_stmt)
    sys.exit(0)

if bad:
    sys.stderr.write('FAIL: migration order — these sort AFTER ' + ours + ' and would undo it on a replay:\n  '
                     + '\n  '.join(bad) + '\n')
    sys.exit(1)

# Row types the real bodies DECLARE (PL/pgSQL resolves variable types when a
# function is created; the tables they READ need not exist).
out = ['CREATE SCHEMA IF NOT EXISTS replay;',
       'CREATE TABLE IF NOT EXISTS public.dashboard_config (scope text);']
for name in READERS:
    src = None
    for f in files:
        if f >= ours:
            break
        text = open(os.path.join(mig_dir, f)).read()
        if defines(text, name):
            src = (f, text)
    if src is None:
        sys.stderr.write(f'FAIL: no migration before {ours} defines {name}\n')
        sys.exit(1)
    f, text = src
    starts = list(re.finditer(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?' + name + r'\s*\(', text, re.I))
    m = starts[-1]
    tag = re.compile(r'\bAS\s+(\$[A-Za-z_]*\$)', re.I).search(text, m.end())
    close = text.index(tag.group(1), tag.end())
    semi = text.index(';', close + len(tag.group(1)))
    stmt = text[m.start():semi + 1]
    # renamed too, so no test that looks a reader up by name finds two
    stmt = re.sub(r'FUNCTION\s+(?:public\.)?' + name, 'FUNCTION replay.replay_' + name, stmt, count=1, flags=re.I)
    out.append(f'-- {name}: {f}')
    out.append(stmt)
print('\n'.join(out))
