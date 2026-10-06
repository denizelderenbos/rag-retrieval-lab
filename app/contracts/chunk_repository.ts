import type { NewChunk } from '#domain/document'
import type { RetrievalCandidate } from '#domain/retrieval'
import type { TenantTransaction } from '#infrastructure/database/tenant_database_session'

/**
 * Storage and first-stage retrieval of chunks.
 *
 * Every method requires a TenantTransaction. You can only get one from
 * TenantDatabaseSession.runAsTenant, so a query outside a tenant context does
 * not even compile. The database (RLS) is the second, real boundary.
 *
 * Another implementation (Qdrant, Azure AI Search, Elasticsearch) could fulfil
 * the same contract. It would then have to guarantee tenant isolation itself,
 * because there is no RLS there.
 */
export abstract class ChunkRepository {
  /** Full-text search. Results have keywordScore and keywordRank. */
  abstract searchByKeyword(
    trx: TenantTransaction,
    query: string,
    limit: number
  ): Promise<RetrievalCandidate[]>

  /** Nearest-neighbour search. Results have vectorScore and vectorRank. */
  abstract searchByVector(
    trx: TenantTransaction,
    embedding: number[],
    limit: number
  ): Promise<RetrievalCandidate[]>

  abstract insertMany(trx: TenantTransaction, chunks: NewChunk[]): Promise<void>
}
