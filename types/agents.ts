/**
 * Output of the orchestrator's classifier. Drives downstream dispatch in #27:
 *
 * - `health_question` → RAG agent → response agent (Epic 4 wiring)
 * - `news_request` / `events_request` → external-tool agents (Epic 9)
 * - `general_chat` → response agent directly
 */
export type Intent = "health_question" | "news_request" | "events_request" | "general_chat";
