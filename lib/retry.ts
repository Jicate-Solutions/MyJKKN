export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  // Optional gate: when provided, only retry if it returns true for the thrown
  // error. Default (omitted) preserves the historical retry-on-any-error
  // behavior. Callers that retry only transient network blips (e.g. Supabase
  // service-role helpers) pass a transient-error matcher so a Postgres/RLS error
  // fails fast instead of sleeping through the full backoff.
  shouldRetry?: (error: unknown) => boolean
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0 || (shouldRetry && !shouldRetry(error))) throw error;

    await new Promise((resolve) => setTimeout(resolve, delay));

    return withRetry(fn, retries - 1, delay * 1.5, shouldRetry);
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
