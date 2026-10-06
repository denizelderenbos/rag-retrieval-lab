export const RETRIEVAL_MODES = ['keyword', 'vector', 'hybrid', 'hybrid-rerank'] as const

export type RetrievalMode = (typeof RETRIEVAL_MODES)[number]

export type SearchRequest = {
  tenantId: string
  query: string
  mode: RetrievalMode
  /** Number of results for the user. Falls back to rag.defaultLimit. */
  limit?: number
}

/**
 * A single chunk coming out of a retrieval stage.
 *
 * Each stage only fills its own fields, so a chunk found only by keyword search
 * has no vectorScore. Keeping every score and rank lets the TUI show why a
 * chunk ends up in a particular position.
 */
export type RetrievalCandidate = {
  chunkId: string
  documentId: string
  documentName: string
  tenantId: string
  content: string
  metadata: Record<string, unknown>

  /** ts_rank_cd. Only comparable with other keyword scores for the same query. */
  keywordScore?: number
  /** Position in the keyword list, starting at 1. */
  keywordRank?: number

  /** Cosine similarity between -1 and 1. Higher is more similar. */
  vectorScore?: number
  /** Position in the vector list, starting at 1. */
  vectorRank?: number

  hybridScore?: number
  rerankerScore?: number
}

export type StageTimings = Partial<Record<'embedding' | 'retrieval' | 'fusion' | 'rerank', number>>

export type SearchResponse = {
  mode: RetrievalMode
  candidates: RetrievalCandidate[]
  timings: StageTimings
}
