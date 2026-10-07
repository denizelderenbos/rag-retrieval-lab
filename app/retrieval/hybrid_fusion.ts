import type { RetrievalCandidate } from '#domain/retrieval'

/**
 * Combines the keyword and vector lists into a single ranked list.
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
  vectorResults: RetrievalCandidate[],
  k = 60
): RetrievalCandidate[] {
  const calcContribution = (index: number) => {
    const rank = index + 1
    return 1 / (k + rank)
  }

  const byChunkId = new Map<string, RetrievalCandidate>()

  keywordResults.forEach((candidate, index) => {
    const contribution = calcContribution(index)

    byChunkId.set(candidate.chunkId, { ...candidate, hybridScore: contribution })
  })

  vectorResults.forEach((candidate, index) => {
    const contribution = calcContribution(index)

    if (byChunkId.has(candidate.chunkId)) {
      const chunk = byChunkId.get(candidate.chunkId)!
      const newHybridScore = chunk.hybridScore ? contribution + chunk.hybridScore : contribution
      byChunkId.set(candidate.chunkId, { ...candidate, ...chunk, hybridScore: newHybridScore })
    } else {
      byChunkId.set(candidate.chunkId, { ...candidate, hybridScore: contribution })
    }
  })

  const retrievalCandidates: RetrievalCandidate[] = Array.from(byChunkId.values())
  retrievalCandidates.sort((a, b) => {
    return Number(b.hybridScore) - Number(a.hybridScore)
  })

  return retrievalCandidates
}
