import { type ChunkRepository } from '#contracts/chunk_repository'
import { type EmbeddingProvider } from '#contracts/embedding_provider'
import type { DocumentInput, NewChunk } from '#domain/document'
import { type TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { type DbDocumentRepository } from '#repositories/db_document_repository'

/**
 * Document in, chunks with embeddings out, stored as the owning tenant.
 *
 * Writes also go through runAsTenant: the WITH CHECK clause of the RLS policy
 * rejects a chunk whose tenant_id does not belong to the active tenant.
 */
export class IngestionService {
  constructor(
    private readonly session: TenantDatabaseSession,
    private readonly documents: DbDocumentRepository,
    private readonly chunks: ChunkRepository,
    private readonly embeddings: EmbeddingProvider
  ) {}

  async ingestDocument(tenantId: string, input: DocumentInput) {
    const pieces = splitIntoChunks(input.text)

    // Compute every embedding first, only then open the transaction.
    const embeddings: number[][] = []
    for (const piece of pieces) {
      embeddings.push(await this.embeddings.embed(piece))
    }

    return this.session.runAsTenant(tenantId, async (trx) => {
      const documentId = await this.documents.insert(trx, {
        tenantId,
        name: input.name,
        metadata: input.metadata ?? {},
      })

      const chunks: NewChunk[] = pieces.map((content, position) => ({
        tenantId,
        documentId,
        position,
        content,
        metadata: { ...input.metadata, paragraph: position + 1 },
        embedding: embeddings[position],
      }))

      await this.chunks.insertMany(trx, chunks)
      return { documentId, chunkCount: chunks.length }
    })
  }
}

/**
 * One paragraph is one chunk. The simplest possible strategy, and enough for
 * these short demo documents. Real systems split on tokens with overlap, or on
 * headings and sections, so a chunk stays readable on its own.
 */
export function splitIntoChunks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
}
