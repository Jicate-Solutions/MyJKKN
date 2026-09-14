// types/environment.d.ts
namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;

    /**
     * Fireflies API key (Fireflies -> Settings -> Developer), read by
     * lib/services/meetings/fireflies-client.ts to pull meeting notes and
     * recordings.
     *
     * OPTIONAL on purpose. Absent is the normal state — nobody has connected
     * Fireflies yet — and every entry point answers 'Fireflies is not connected
     * yet' rather than throwing or returning an empty list.
     *
     * Declared here rather than in a .env.example because this repository has
     * no such file and .gitignore line 55 (`.env*`) means one cannot be
     * committed. This interface is the only in-repo place an env var is named.
     *
     * Server-side only. It must never gain a NEXT_PUBLIC_ prefix: that would
     * ship the key inside every page of https://www.jkkn.ai.
     */
    FIREFLIES_API_KEY?: string;
  }
}
