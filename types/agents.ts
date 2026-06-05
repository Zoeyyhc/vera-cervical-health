/**
 * Output of the orchestrator's classifier. Drives downstream dispatch in #27:
 *
 * - `health_question` → RAG agent → response agent (Epic 4 wiring)
 * - `news_request` / `events_request` → external-tool agents (Epic 9)
 * - `general_chat` → response agent directly
 */
export type Intent =
  | "health_question"
  | "news_request"
  | "events_request"
  | "general_chat"
  | "injection_attempt";

/**
 * One citation attached to an assistant message. Populated by the RAG agent
 * (Epic 4) and threaded through the response agent + wire format. The chip
 * renderer treats `url`-less sources as non-clickable.
 */
export type Source = {
  /** Caller-assigned marker (e.g., "1", "2"). Unique within a single response. */
  id: string;
  title: string;
  url?: string;
  /** Foreign key to `knowledge_chunks` (Epic 4). */
  chunkId: string;
};
