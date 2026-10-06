import type { ApplicationService } from '@adonisjs/core/types'
import { Database } from '@adonisjs/lucid/database'
import type { RagConfig } from '#config/rag'
import { ChunkRepository } from '#contracts/chunk_repository'
import { EmbeddingProvider } from '#contracts/embedding_provider'
import { Reranker } from '#contracts/reranker'
import { TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { FakeEmbeddingProvider } from '#infrastructure/embeddings/fake_embedding_provider'
import { NoopReranker } from '#infrastructure/reranking/noop_reranker'
import { DbChunkRepository } from '#repositories/db_chunk_repository'
import { DbDocumentRepository } from '#repositories/db_document_repository'
import { DbTenantRepository } from '#repositories/db_tenant_repository'
import { IngestionService } from '#services/ingestion_service'
import { RetrievalService } from '#services/retrieval_service'
import { TenantService } from '#services/tenant_service'

/**
 * The complete object graph in one place.
 *
 * Want a real embedding provider or reranker? Only change the binding below.
 * RetrievalService and the TUI will not notice.
 *
 * Deliberately explicit factories instead of @inject(): you can see which
 * implementation ends up where without decorator magic.
 */
export default class RagProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    const container = this.app.container
    const config = this.app.config.get<RagConfig>('rag')

    container.singleton(EmbeddingProvider, () => {
      return new FakeEmbeddingProvider(config.embeddingDimensions)
    })

    container.singleton(Reranker, () => new NoopReranker())

    container.singleton(ChunkRepository, () => new DbChunkRepository(config.embeddingDimensions))
    container.singleton(DbDocumentRepository, () => new DbDocumentRepository())
    container.singleton(DbTenantRepository, async (resolver) => {
      return new DbTenantRepository(await resolver.make(Database))
    })

    container.singleton(TenantDatabaseSession, async (resolver) => {
      return new TenantDatabaseSession(await resolver.make(Database))
    })

    container.singleton(RetrievalService, async (resolver) => {
      return new RetrievalService(
        await resolver.make(TenantDatabaseSession),
        await resolver.make(ChunkRepository),
        await resolver.make(EmbeddingProvider),
        await resolver.make(Reranker),
        config
      )
    })

    container.singleton(IngestionService, async (resolver) => {
      return new IngestionService(
        await resolver.make(TenantDatabaseSession),
        await resolver.make(DbDocumentRepository),
        await resolver.make(ChunkRepository),
        await resolver.make(EmbeddingProvider)
      )
    })

    container.singleton(TenantService, async (resolver) => {
      return new TenantService(await resolver.make(DbTenantRepository))
    })
  }
}
