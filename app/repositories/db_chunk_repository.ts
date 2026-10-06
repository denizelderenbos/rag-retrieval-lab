import { ChunkRepository } from '#contracts/chunk_repository'
import type { NewChunk } from '#domain/document'
import { EmbeddingDimensionError } from '#domain/errors'
import type { RetrievalCandidate } from '#domain/retrieval'
import type { TenantTransaction } from '#infrastructure/database/tenant_database_session'

type ChunkRow = {
  chunk_id: string
  document_id: string
  document_name: string
  tenant_id: string
  content: string
  metadata: Record<string, unknown>
  score: number
}

/**
 * Note what is missing here: no query filters on tenant_id. That is
 * deliberate. The tenant boundary is the transaction (app.tenant_id) and RLS
 * enforces it. An extra WHERE would be a second source of truth that could
 * drift from the context; the tests prove that RLS alone is enough.
 */
export class DbChunkRepository extends ChunkRepository {
  constructor(private readonly dimensions: number) {
    super()
  }

  /**
   * websearch_to_tsquery turns the question into an AND query: every word has
   * to match, and "SEC-2026-041" becomes an exact phrase. High precision, but a
   * long natural-language question quickly returns nothing. ts_rank_cd
   * rewards chunks in which the search terms appear close together.
   */
  async searchByKeyword(
    trx: TenantTransaction,
    query: string,
    limit: number
  ): Promise<RetrievalCandidate[]> {
    const { rows } = await trx.rawQuery<{ rows: ChunkRow[] }>(
      `
      SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.tenant_id,
             c.content, c.metadata, ts_rank_cd(c.search_vector, q.query) AS score
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      CROSS JOIN websearch_to_tsquery('english', ?) AS q(query)
      WHERE c.search_vector @@ q.query
      ORDER BY score DESC, c.id
      LIMIT ?
      `,
      [query, limit]
    )

    return rows.map((row, index) => ({
      ...toCandidate(row),
      keywordScore: Number(row.score),
      keywordRank: index + 1,
    }))
  }

  /**
   * `<=>` is the pgvector cosine distance (0 is identical, 2 is opposite). We
   * sort by distance and report 1 - distance as similarity. Vector search
   * always returns `limit` results, even when no chunk is really relevant:
   * there is always a nearest one.
   */
  async searchByVector(
    trx: TenantTransaction,
    embedding: number[],
    limit: number
  ): Promise<RetrievalCandidate[]> {
    const vector = this.toVectorLiteral(embedding)

    // HNSW first fetches a fixed number of neighbours and only then does RLS
    // filter them. With many tenants too few rows may remain. Iterative scan
    // (pgvector 0.8+) keeps searching until enough permitted rows are found.
    await trx.rawQuery('SET LOCAL hnsw.iterative_scan = strict_order')

    const { rows } = await trx.rawQuery<{ rows: ChunkRow[] }>(
      `
      SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.tenant_id,
             c.content, c.metadata, 1 - (c.embedding <=> q.embedding) AS score
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      CROSS JOIN (SELECT ?::vector AS embedding) AS q
      ORDER BY c.embedding <=> q.embedding, c.id
      LIMIT ?
      `,
      [vector, limit]
    )

    return rows.map((row, index) => ({
      ...toCandidate(row),
      vectorScore: Number(row.score),
      vectorRank: index + 1,
    }))
  }

  async insertMany(trx: TenantTransaction, chunks: NewChunk[]): Promise<void> {
    if (chunks.length === 0) return

    await trx.table('chunks').insert(
      chunks.map((chunk) => ({
        tenant_id: chunk.tenantId,
        document_id: chunk.documentId,
        position: chunk.position,
        content: chunk.content,
        metadata: JSON.stringify(chunk.metadata),
        embedding: this.toVectorLiteral(chunk.embedding),
      }))
    )
  }

  /** pgvector parses vectors from text in the form "[0.1,0.2,0.3]". */
  private toVectorLiteral(embedding: number[]): string {
    if (embedding.length !== this.dimensions) {
      throw new EmbeddingDimensionError(embedding.length, this.dimensions)
    }
    if (!embedding.every(Number.isFinite)) {
      throw new TypeError('Embedding contains a value that is not a finite number')
    }
    return `[${embedding.join(',')}]`
  }
}

function toCandidate(row: ChunkRow): RetrievalCandidate {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentName: row.document_name,
    tenantId: row.tenant_id,
    content: row.content,
    metadata: row.metadata,
  }
}
