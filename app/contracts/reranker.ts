import type { RetrievalCandidate } from '#domain/retrieval'

/**
 * Second stage of retrieval. Receives a small set of candidates and decides
 * their order again, using a more accurate (and more expensive) model than the
 * first stage. A reranker never adds new chunks.
 */
export abstract class Reranker {
  abstract readonly name: string

  /**
   * Returns the same candidates in a new order, with rerankerScore filled in.
   * Existing scores and ranks are kept.
   */
  abstract rerank(query: string, candidates: RetrievalCandidate[]): Promise<RetrievalCandidate[]>
}
