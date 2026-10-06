import { Reranker } from '#contracts/reranker'
import type { RetrievalCandidate } from '#domain/retrieval'

/**
 * Leaves the order unchanged. Exists so the hybrid-rerank mode works before a
 * real reranker is plugged in.
 */
export class NoopReranker extends Reranker {
  readonly name = 'noop (no reranking)'

  async rerank(_query: string, candidates: RetrievalCandidate[]): Promise<RetrievalCandidate[]> {
    return [...candidates]
  }
}
