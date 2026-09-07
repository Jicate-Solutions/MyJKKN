/**
 * JSON shapes that Postgres `jsonb` columns accept.
 *
 * Why this exists: `Record<string, unknown>` is NOT assignable to the `Json`
 * type Supabase generates, because `unknown` is wider than `Json`. Any DTO
 * declaring a jsonb field as `Record<string, unknown>` therefore fails
 * typecheck on every insert/update, even though the value is fine at runtime —
 * which is how several of those writes reached production untyped behind
 * `typescript.ignoreBuildErrors`.
 *
 * These mirror the generated `Json` structurally, so they satisfy it.
 *
 * Use for jsonb columns being WRITTEN. Read shapes may stay
 * `Record<string, unknown>`, where the extra width costs nothing.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type JsonObject = { [key: string]: JsonValue | undefined };
