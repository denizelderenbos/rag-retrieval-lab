import type { RagConfig } from '#config/rag'
import { type ChunkRepository } from '#contracts/chunk_repository'
import { type EmbeddingProvider } from '#contracts/embedding_provider'
import { type Reranker } from '#contracts/reranker'
import { InvalidSearchRequestError } from '#domain/errors'
import {
  RETRIEVAL_MODES,
  type RetrievalCandidate,
  type RetrievalMode,
  type SearchRequest,
  type SearchResponse,
  type StageTimings,
} from '#domain/retrieval'
import { type TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { combineResults } from '#retrieval/hybrid_fusion'

const MAX_QUERY_LENGTH = 1000

/**
 * Orchestrates the pipeline: embedding, first stage (keyword and/or vector),
 * fusion, reranking. Knows nothing about PostgreSQL, Ink or AdonisJS;
 * everything comes in through the constructor.
 */
export class RetrievalService {
  constructor(
    private readonly session: TenantDatabaseSession,
    private readonly chunks: ChunkRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly reranker: Reranker,
    private readonly config: RagConfig
  ) {}

  get embeddingProviderName() {
    return this.embeddings.name
  }

  get rerankerName() {
    return this.reranker.name
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const { tenantId, query, mode, limit } = this.validate(request)
    const timings: StageTimings = {}

    const usesKeyword = mode !== 'vector'
    const usesVector = mode !== 'keyword'

    // For hybrid modes the first stage fetches more than the user sees: fusion
    // and reranking only make sense when there is something to choose from.
    const firstStageLimit =
      mode === 'keyword' || mode === 'vector' ? limit : this.config.candidatePoolSize

    // Outside the transaction: a (future external) embedding API must not hold
    // on to a database connection while it computes.
    const queryEmbedding = usesVector
      ? await measure(timings, 'embedding', () => this.embeddings.embed(query))
      : undefined

    const { keywordResults, vectorResults } = await measure(timings, 'retrieval', () =>
      this.session.runAsTenant(tenantId, async (trx) => ({
        keywordResults: usesKeyword
          ? await this.chunks.searchByKeyword(trx, query, firstStageLimit)
          : [],
        vectorResults: queryEmbedding
          ? await this.chunks.searchByVector(trx, queryEmbedding, firstStageLimit)
          : [],
      }))
    )

    if (mode === 'keyword') return { mode, candidates: keywordResults, timings }
    if (mode === 'vector') return { mode, candidates: vectorResults, timings }

    const fused = await measure(timings, 'fusion', async () =>
      combineResults(keywordResults, vectorResults)
    )

    if (mode === 'hybrid') return { mode, candidates: fused.slice(0, limit), timings }

    const reranked = await measure(timings, 'rerank', () =>
      this.reranker.rerank(query, fused.slice(0, this.config.candidatePoolSize))
    )

    return { mode, candidates: reranked.slice(0, limit), timings }
  }

  private validate(request: SearchRequest): Required<SearchRequest> {
    const query = request.query.trim()
    const limit = request.limit ?? this.config.defaultLimit

    if (query.length === 0) {
      throw new InvalidSearchRequestError('The query is empty')
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new InvalidSearchRequestError(`The query is longer than ${MAX_QUERY_LENGTH} characters`)
    }
    if (!isRetrievalMode(request.mode)) {
      throw new InvalidSearchRequestError(`Unknown mode "${request.mode}"`)
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > this.config.maxLimit) {
      throw new InvalidSearchRequestError(
        `limit must be an integer between 1 and ${this.config.maxLimit}`
      )
    }

    return { tenantId: request.tenantId, query, mode: request.mode, limit }
  }
}

function isRetrievalMode(value: string): value is RetrievalMode {
  return (RETRIEVAL_MODES as readonly string[]).includes(value)
}

async function measure<T>(
  timings: StageTimings,
  stage: keyof StageTimings,
  work: () => Promise<T>
): Promise<T> {
  const start = performance.now()
  try {
    return await work()
  } finally {
    timings[stage] = Math.round((performance.now() - start) * 10) / 10
  }
}

export type { RetrievalCandidate }
