/**
 * Server-side environment variable validation.
 *
 * Import this module in any server-side code that needs validated env vars.
 * It throws at module load time if any required variable is undefined,
 * causing the server to fail fast with a clear error rather than surfacing
 * mysterious runtime failures later.
 *
 * Do NOT import from client components — these are server-side secrets.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\nSee docs/env-vars.md for where to obtain this value.`
    );
  }
  return value;
}

export const env = {
  // Supabase — server-side only (service role bypasses RLS)
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),

  // Anthropic — used by all agent calls in lib/agents/
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),

  // OpenAI — used exclusively for text-embedding-3-small in the RAG pipeline
  openaiApiKey: requireEnv("OPENAI_API_KEY"),

  // Resend — transactional email (password reset, account confirmation)
  resendApiKey: requireEnv("RESEND_API_KEY"),

  // NewsAPI — proxied through /api/news, never exposed to the browser
  newsApiKey: requireEnv("NEWS_API_KEY"),

  // SerpAPI — proxied through /api/events, never exposed to the browser
  serpapiKey: requireEnv("SERPAPI_KEY"),
} as const;
