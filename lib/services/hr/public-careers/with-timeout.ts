/** Race a promise against a deadline. Used so a hung upstream (Drive, Resend,
 *  Supabase) can never hold a public-route invocation open until the platform
 *  kills it. */
export function withTimeout<T>(what: string, p: PromiseLike<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(t));
}
