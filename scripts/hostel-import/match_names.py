"""
Match Excel C BLOCK girls against learners_profiles via Supabase Management API.

Two-pass:
  Pass 1: Fetch all female learners at JKKN Dental + JKKN Pharmacy (~1100).
  Pass 2: For each Excel girl, score against all candidates → classify.

Classification:
  - MATCHED:    score >= 0.85 and unique top
  - NEAR_MATCH: 0.65 <= score < 0.85, or multiple candidates within 0.05 of top
  - UNMATCHED:  no candidate >= 0.65

Output: scripts/hostel-import/matches.json
"""
import json
import os
import re
import subprocess
from pathlib import Path
from collections import defaultdict
from difflib import SequenceMatcher

PARSED = Path(__file__).parent / 'parsed.json'
OUT = Path(__file__).parent / 'matches.json'

DENTAL_ID = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
# JKKN College of Pharmacy (discovered via probe)
PHARMACY_ID = '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'

SUPABASE_REF = os.environ.get('SUPABASE_REF', 'kvizhngldtiuufknvehv')
TOKEN_PATH = Path.home() / '.supabase' / 'access-token'


def run_query(sql):
    import tempfile
    token = TOKEN_PATH.read_text().strip()
    payload = json.dumps({'query': sql})
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        f.write(payload)
        tmppath = f.name
    try:
        result = subprocess.run(
            [
                'curl', '-s',
                '-X', 'POST',
                f'https://api.supabase.com/v1/projects/{SUPABASE_REF}/database/query',
                '-H', f'Authorization: Bearer {token}',
                '-H', 'Content-Type: application/json',
                '-d', f'@{tmppath}',
            ],
            capture_output=True, text=True, timeout=60,
        )
    finally:
        os.unlink(tmppath)
    if result.returncode != 0:
        raise RuntimeError(f'curl failed: {result.returncode}\n{result.stderr}')
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f'JSON decode failed: {e}\nstdout head: {result.stdout[:500]}')
    if isinstance(data, dict) and 'message' in data:
        raise RuntimeError(f'SQL error: {data["message"]}')
    return data


PROGRAM_NOISE = {'bds', 'mds', 'pharmd', 'bpharm', 'mpharm', 'pharm'}
# Don't include single 'd' — that's a real initial used by many students.
# We only strip multi-letter program markers as standalone noise tokens.


def normalize(s):
    if not s:
        return ''
    n = s.lower()
    n = re.sub(r'[^a-z\s]', ' ', n)
    n = re.sub(r'\s+', ' ', n).strip()
    # Strip program-suffix noise like "BDS" appended to DB last_names
    parts = [t for t in n.split() if t not in PROGRAM_NOISE]
    # Also strip standalone "d" ONLY when adjacent to another program token
    # — easier: skip this for now; "PHARM D" → after stripping "PHARM" leaves just "d"
    return ' '.join(parts)


def tokens(s):
    return [t for t in normalize(s).split() if t]


def expand_tokens(name_tokens):
    """Generate variants combining adjacent name tokens (handles 'ADHI LAKSHMI' vs 'ADHILAKSHMI').

    Returns set of tokens including originals + adjacent-joined pairs.
    """
    expanded = set(name_tokens)
    for i in range(len(name_tokens) - 1):
        expanded.add(name_tokens[i] + name_tokens[i + 1])
    return expanded


def name_similarity(a_tokens, b_tokens):
    """Order-independent token match for South Indian "INITIAL NAME" vs "NAME INITIAL" variation.

    Strategy:
      - Treat single-char tokens as "initials" — weight low.
      - Multi-char tokens are name tokens — weight high.
      - If ALL of one side's name tokens are present in the other → strong match.
      - Initials must at least be a subset compatible (initial matches a multi-char's first letter).
    """
    if not a_tokens or not b_tokens:
        return 0.0

    def split(tokens):
        names = [t for t in tokens if len(t) >= 2]
        initials = [t for t in tokens if len(t) == 1]
        return names, initials

    a_names, a_inits = split(a_tokens)
    b_names, b_inits = split(b_tokens)

    if not a_names or not b_names:
        # Degrade to whole-string similarity
        return SequenceMatcher(None, ' '.join(a_tokens), ' '.join(b_tokens)).ratio() * 0.6

    a_set = expand_tokens(a_names)
    b_set = expand_tokens(b_names)
    inter = a_set & b_set
    union = a_set | b_set

    name_jaccard = len(inter) / len(union) if union else 0.0

    # Fuzzy near-match (handles spelling variations: PADMASREE vs PADMASHREE)
    fuzzy_hits = 0
    for an in a_set:
        if an in b_set:
            continue
        for bn in b_set:
            if len(an) >= 4 and len(bn) >= 4 and SequenceMatcher(None, an, bn).ratio() >= 0.85:
                fuzzy_hits += 1
                break
    if fuzzy_hits:
        name_jaccard = max(name_jaccard, (len(inter) + 0.7 * fuzzy_hits) / max(len(union), 1))

    # All-of-smaller-in-larger bonus (considers fuzzy matches too)
    a_orig = set(a_names)
    b_orig = set(b_names)
    smaller_orig, larger_set = (a_orig, b_set) if len(a_orig) <= len(b_orig) else (b_orig, a_set)
    def in_larger(tok, larger):
        if tok in larger:
            return True
        for x in larger:
            if len(tok) >= 4 and len(x) >= 4 and SequenceMatcher(None, tok, x).ratio() >= 0.85:
                return True
        return False
    all_subset = all(in_larger(t, larger_set) for t in smaller_orig) and len(smaller_orig) > 0

    # Initial compatibility: each initial in one side should match the first letter
    # of some unmatched name in the other side, OR appear as initial there.
    def initial_compatibility(a_inits_local, b_names_local, b_inits_local):
        if not a_inits_local:
            return 1.0
        avail_first_letters = set(n[0] for n in b_names_local) | set(b_inits_local)
        matched = sum(1 for i in a_inits_local if i in avail_first_letters)
        return matched / len(a_inits_local)

    init_compat = min(
        initial_compatibility(a_inits, b_names, b_inits),
        initial_compatibility(b_inits, a_names, a_inits),
    )

    # Compose
    score = 0.55 * name_jaccard + 0.10 * init_compat
    if all_subset:
        # Both name tokens present (modulo order) → big boost
        score += 0.30
        # Extra reward if exact set equality
        if a_set == b_set:
            score += 0.05

    # Whole-string concat fuzzy (handles missing-space + spelling variants)
    # Sort name tokens so "ADHI LAKSHMI" and "LAKSHMI ADHI" compare equal
    a_concat = ''.join(sorted(a_names))
    b_concat = ''.join(sorted(b_names))
    if len(a_concat) >= 5 and len(b_concat) >= 5:
        concat_ratio = SequenceMatcher(None, a_concat, b_concat).ratio()
        # Use as a score floor
        score = max(score, concat_ratio * 0.85)

    # Hard penalty: if BOTH sides have explicit initial markers AND they don't
    # share any letter, this is almost always a "same first name, different
    # student" situation in South Indian naming conventions.
    # Expand each side's "initial set" to include letters from 2-char tokens
    # (e.g. "VI" → {V, I}) so that "VI" on Excel matches "V.I" on DB.
    def expand_initial_set(orig_tokens):
        letters = set()
        for t in orig_tokens:
            if len(t) <= 2:
                for ch in t:
                    letters.add(ch.lower())
        return letters

    a_init_letters = expand_initial_set(a_tokens)
    b_init_letters = expand_initial_set(b_tokens)
    if a_init_letters and b_init_letters and not (a_init_letters & b_init_letters):
        # Cap below MATCHED threshold (0.70) — flag as NEAR_MATCH for human review.
        score = min(score, 0.65)

    return min(score, 1.0)


def fetch_candidates():
    sql = f"""
    SELECT
      lp.id,
      lp.first_name,
      lp.last_name,
      lp.gender,
      lp.institution_id,
      i.name AS institution_name,
      p.program_name,
      lp.batch_id,
      b.batch_year,
      b.batch_name
    FROM learners_profiles lp
    LEFT JOIN institutions i ON i.id = lp.institution_id
    LEFT JOIN programs p ON p.id = lp.program_id
    LEFT JOIN batches b ON b.id = lp.batch_id
    WHERE lp.institution_id IN ('{DENTAL_ID}', '{PHARMACY_ID}')
      AND UPPER(COALESCE(lp.gender, '')) = 'FEMALE'
      -- accept all lifecycle states; girls may be at any stage
    ORDER BY lp.first_name
    """
    return run_query(sql)


def main():
    parsed = json.loads(PARSED.read_text())
    residents = parsed['residents']
    print(f'Loaded {len(residents)} Excel residents')

    candidates = fetch_candidates()
    print(f'Fetched {len(candidates)} female candidates from dental + pharmacy')

    # Pre-tokenize candidates
    for c in candidates:
        full = f"{c.get('first_name') or ''} {c.get('last_name') or ''}".strip()
        c['_full'] = full
        c['_tokens'] = tokens(full)
        # Infer program family
        pn = (c.get('program_name') or '').upper()
        if 'BDS' in pn:
            c['_prog'] = 'BDS'
        elif 'PHARMD' in pn or 'PHARM D' in pn:
            c['_prog'] = 'PHARMD'
        elif 'BPHARM' in pn:
            c['_prog'] = 'BPHARM'
        else:
            c['_prog'] = pn

    # Build by program index for faster scan
    by_prog = defaultdict(list)
    for c in candidates:
        by_prog[c['_prog']].append(c)
    print('Candidates by program:', {k: len(v) for k, v in by_prog.items()})

    # Match
    results = []
    for r in residents:
        r_tokens = tokens(r['raw_name'])
        # Restrict to matching program family; fall back to all if zero
        prog = r.get('program')
        pool = by_prog.get(prog, [])
        if not pool:
            pool = candidates  # fallback

        scored = []
        for c in pool:
            score = name_similarity(r_tokens, c['_tokens'])
            scored.append((score, c))

        scored.sort(key=lambda x: -x[0])
        top = scored[:5] if scored else []
        best_score = top[0][0] if top else 0
        runner_score = top[1][0] if len(top) > 1 else 0
        gap = best_score - runner_score

        # Classify
        # Strategy:
        # 1. score >= 0.85 + gap >= 0.05 = MATCHED (clear winner)
        # 2. score >= 0.85 + gap < 0.05 = NEAR_MATCH (tied top → ambiguous)
        # 3. 0.55 <= score < 0.85 + gap >= 0.30 = MATCHED (subset match, no contender)
        # 4. 0.55 <= score < 0.85 + gap < 0.30 = NEAR_MATCH
        # 5. score < 0.55 = UNMATCHED
        if best_score >= 0.85:
            status = 'MATCHED' if gap >= 0.05 else 'NEAR_MATCH'
        elif best_score >= 0.70:
            status = 'MATCHED' if gap >= 0.10 else 'NEAR_MATCH'
        elif best_score >= 0.55:
            status = 'NEAR_MATCH'
        else:
            status = 'UNMATCHED'

        results.append({
            'raw_name': r['raw_name'],
            'normalized': r['normalized_name'],
            'block_code': r['block_code'],
            'room_number': r['room_number'],
            'floor': r['floor'],
            'raw_dept': r['raw_dept'],
            'program': r['program'],
            'year': r['year'],
            'status': status,
            'best_score': round(best_score, 3),
            'gap_to_runner': round(gap, 3),
            'top_candidates': [
                {
                    'id': c['id'],
                    'full': c['_full'],
                    'program': c.get('program_name'),
                    'batch_year': c.get('batch_year'),
                    'institution': c.get('institution_name'),
                    'score': round(s, 3),
                }
                for s, c in top
            ],
            'chosen_id': top[0][1]['id'] if status == 'MATCHED' else None,
        })

    # Summary
    summary = {
        'total': len(results),
        'matched': sum(1 for x in results if x['status'] == 'MATCHED'),
        'near': sum(1 for x in results if x['status'] == 'NEAR_MATCH'),
        'unmatched': sum(1 for x in results if x['status'] == 'UNMATCHED'),
    }
    print('Summary:', summary)

    OUT.write_text(json.dumps({
        'summary': summary,
        'matches': results,
    }, indent=2))
    print(f'Wrote {OUT}')


if __name__ == '__main__':
    main()
