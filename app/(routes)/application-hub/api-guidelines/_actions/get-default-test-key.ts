'use server';

/**
 * Returns the default B2A test API key from the environment variable.
 * Set B2A_TEST_API_KEY in .env.local to a real key that exists in api_keys table.
 * This avoids creating a new key on every test — use one pre-created key for all testing.
 */
export async function getDefaultTestKey(): Promise<string | null> {
  return process.env.B2A_TEST_API_KEY ?? null;
}
