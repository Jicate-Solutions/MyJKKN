/**
 * A tiny interpreter for the CASE expression inside
 * `fn_handover_key_is_blocked` — read out of the migration file at run time.
 *
 * WHY AN INTERPRETER AND NOT A COPY OF THE RULES.
 * A test that restates the wall list in TypeScript proves only that the author
 * agreed with themselves twice, and it goes green while the SQL says something
 * else entirely (this repo has shipped exactly that: 40 green assertions over a
 * live bug). So nothing here knows what the walls ARE. It parses the WHEN/THEN
 * clauses out of the real migration text and evaluates them. Edit the wall in
 * the SQL and this evaluator's answers change with it — which is the only way
 * the classification manifest can be a tripwire rather than a second opinion.
 *
 * Grammar supported (deliberately just what the function uses — anything else
 * throws loudly rather than being silently mis-evaluated):
 *
 *   expr       := term (OR term)*
 *   term       := factor (AND factor)*
 *   factor     := '(' expr ')' | comparison
 *   comparison := p_key IS NULL
 *               | p_key = 'literal'
 *               | p_key LIKE 'pattern'
 *               | p_key IN ('a', 'b', ...)
 */
import { readFileSync } from 'node:fs';

export const WALL_MIGRATION =
  'supabase/migrations/20260811100000_director_handovers_spine.sql';

type Clause = { predicate: string; result: boolean };

/** Strip `-- …` line comments so prose examples cannot be parsed as SQL. */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      // Naive but sufficient: the function body has no `--` inside a string literal.
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/** Pull the CASE clauses of fn_handover_key_is_blocked out of the migration. */
export function parseWallClauses(sqlText: string): {
  clauses: Clause[];
  fallback: boolean;
} {
  const start = sqlText.indexOf('FUNCTION public.fn_handover_key_is_blocked');
  if (start === -1) {
    throw new Error(
      `fn_handover_key_is_blocked not found in ${WALL_MIGRATION} — the walls moved, this test must move with them.`
    );
  }
  const bodyStart = sqlText.indexOf('$$', start);
  const bodyEnd = sqlText.indexOf('$$', bodyStart + 2);
  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error('Could not bound the fn_handover_key_is_blocked body.');
  }

  const body = stripLineComments(sqlText.slice(bodyStart + 2, bodyEnd)).replace(
    /\s+/g,
    ' '
  );

  const clauses: Clause[] = [];
  const re = /\bWHEN\s+(.+?)\s+THEN\s+(true|false)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    clauses.push({ predicate: m[1], result: m[2].toLowerCase() === 'true' });
  }
  if (clauses.length === 0) {
    throw new Error('Parsed zero WHEN clauses — the parser or the SQL changed shape.');
  }

  const elseMatch = /\bELSE\s+(true|false)\b/i.exec(body);
  if (!elseMatch) {
    throw new Error('No ELSE branch found in fn_handover_key_is_blocked.');
  }

  return { clauses, fallback: elseMatch[1].toLowerCase() === 'true' };
}

// ---------------------------------------------------------------------------
// Tokenizer + recursive-descent evaluator
// ---------------------------------------------------------------------------

type Token = { kind: 'word' | 'string' | 'punct'; value: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let val = '';
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") {
          val += "'";
          j += 2;
          continue;
        }
        if (src[j] === "'") break;
        val += src[j];
        j++;
      }
      out.push({ kind: 'string', value: val });
      i = j + 1;
      continue;
    }
    if (c === '(' || c === ')' || c === ',' || c === '=') {
      out.push({ kind: 'punct', value: c });
      i++;
      continue;
    }
    const wordMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (wordMatch) {
      out.push({ kind: 'word', value: wordMatch[0] });
      i += wordMatch[0].length;
      continue;
    }
    throw new Error(`Unsupported character in wall predicate: ${JSON.stringify(c)}`);
  }
  return out;
}

/** SQL LIKE → RegExp. `%` = any run, `_` = any single character, as in Postgres. */
export function likeToRegExp(pattern: string): RegExp {
  let out = '';
  for (const ch of pattern) {
    if (ch === '%') out += '[\\s\\S]*';
    else if (ch === '_') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private key: string | null) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private takeWord(expected?: string): string {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== 'word' || (expected && t.value.toUpperCase() !== expected)) {
      throw new Error(
        `Expected ${expected ?? 'word'} at token ${this.pos}, got ${JSON.stringify(t)}`
      );
    }
    this.pos++;
    return t.value;
  }
  private takePunct(expected: string) {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== 'punct' || t.value !== expected) {
      throw new Error(
        `Expected "${expected}" at token ${this.pos}, got ${JSON.stringify(t)}`
      );
    }
    this.pos++;
  }
  private takeString(): string {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== 'string') {
      throw new Error(`Expected string literal at token ${this.pos}`);
    }
    this.pos++;
    return t.value;
  }

  expr(): boolean {
    let left = this.term();
    while (this.peek()?.kind === 'word' && this.peek()!.value.toUpperCase() === 'OR') {
      this.pos++;
      const right = this.term();
      left = left || right;
    }
    return left;
  }

  private term(): boolean {
    let left = this.factor();
    while (this.peek()?.kind === 'word' && this.peek()!.value.toUpperCase() === 'AND') {
      this.pos++;
      const right = this.factor();
      left = left && right;
    }
    return left;
  }

  private factor(): boolean {
    const t = this.peek();
    if (t?.kind === 'punct' && t.value === '(') {
      this.takePunct('(');
      const v = this.expr();
      this.takePunct(')');
      return v;
    }
    return this.comparison();
  }

  private comparison(): boolean {
    this.takeWord('P_KEY');
    const next = this.peek();
    if (!next) throw new Error('Predicate ended after p_key');

    if (next.kind === 'punct' && next.value === '=') {
      this.takePunct('=');
      const lit = this.takeString();
      return this.key === lit;
    }
    const word = next.value.toUpperCase();
    if (word === 'LIKE') {
      this.takeWord('LIKE');
      const pattern = this.takeString();
      return this.key === null ? false : likeToRegExp(pattern).test(this.key);
    }
    if (word === 'IN') {
      this.takeWord('IN');
      this.takePunct('(');
      const values: string[] = [this.takeString()];
      while (this.peek()?.kind === 'punct' && this.peek()!.value === ',') {
        this.takePunct(',');
        values.push(this.takeString());
      }
      this.takePunct(')');
      return this.key !== null && values.includes(this.key);
    }
    if (word === 'IS') {
      this.takeWord('IS');
      this.takeWord('NULL');
      return this.key === null;
    }
    throw new Error(`Unsupported comparison operator: ${next.value}`);
  }
}

function evalPredicate(predicate: string, key: string | null): boolean {
  const parser = new Parser(tokenize(predicate), key);
  return parser.expr();
}

/**
 * Evaluate the real CASE expression for one key.
 * Returns true when the key is WALLED (unhandable).
 */
export function isBlocked(
  key: string | null,
  parsed: { clauses: Clause[]; fallback: boolean }
): boolean {
  for (const c of parsed.clauses) {
    if (evalPredicate(c.predicate, key)) return c.result;
  }
  return parsed.fallback;
}

/** Convenience: parse straight from the migration on disk. */
export function loadWalls() {
  return parseWallClauses(readFileSync(WALL_MIGRATION, 'utf8'));
}
