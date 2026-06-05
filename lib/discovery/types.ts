/** One rag_gap analytics event, flattened from analytics_events. */
export type RagGapEvent = {
  /** analytics_events.id — recorded on the candidate's gap_refs when addressed. */
  id: string;
  question: string;
  topScore: number;
};

/** A cluster of semantically related gap questions. */
export type GapCluster = {
  /** Short human label, e.g. "HPV vaccine side effects". */
  theme: string;
  /** analytics_events ids of the gaps in this cluster. */
  gapEventIds: string[];
};

/** One web search result. */
export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

/** Cleaned article text extracted from a page. */
export type ExtractedPage = {
  title: string;
  content: string;
};

/** Authority + relevance judgement for a candidate source, 0–1 each. */
export type CandidateScores = {
  authorityScore: number;
  relevanceScore: number;
};

/** Result of one discovery run. */
export type DiscoveryRunResult = {
  runId: string;
  gapsProcessed: number;
  candidatesStaged: number;
};
