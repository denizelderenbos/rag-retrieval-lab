import { NotImplementedError } from '#domain/errors'
import type { RetrievalCandidate } from '#domain/retrieval'

/**
 * Combines the keyword and vector lists into a single ranked list.
 *
 * TODO: implement the fusion.
 *
 * Reciprocal Rank Fusion (RRF) is a logical choice here: it works on the
 * position of a chunk in each list instead of on the scores. That matters
 * because ts_rank_cd and cosine similarity live on completely different
 * scales; adding them up means nothing.
 *
 * Deliberately a pure function without database or framework: easy to unit
 * test and easy to explain.
 */
export function combineResults(
  keywordResults: RetrievalCandidate[],
  vectorResults: RetrievalCandidate[]
): RetrievalCandidate[] {
  void keywordResults
  void vectorResults
  throw new NotImplementedError('Hybrid fusion')
}
