import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import type { RagConfig } from '#config/rag'
import { ChunkRepository } from '#contracts/chunk_repository'
import { EmbeddingProvider } from '#contracts/embedding_provider'
import { Reranker } from '#contracts/reranker'
import { InvalidSearchRequestError } from '#domain/errors'
import { TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { FakeEmbeddingProvider } from '#infrastructure/embeddings/fake_embedding_provider'
import { DbChunkRepository } from '#repositories/db_chunk_repository'
import { RetrievalService } from '#services/retrieval_service'
import { createEmptyTenant, seedDemoTenants, type DemoTenants } from '#tests/helpers/demo_tenants'

/** Counts how often an embedding is requested. */
class CountingEmbeddingProvider extends FakeEmbeddingProvider {
  calls = 0

  async embed(text: string) {
    this.calls++
    return super.embed(text)
  }
}

/** Remembers which limit each first-stage search was asked for. */
class LimitRecordingChunkRepository extends DbChunkRepository {
  keywordLimits: number[] = []
  vectorLimits: number[] = []

  async searchByKeyword(...args: Parameters<DbChunkRepository['searchByKeyword']>) {
    this.keywordLimits.push(args[2])
    return super.searchByKeyword(...args)
  }

  async searchByVector(...args: Parameters<DbChunkRepository['searchByVector']>) {
    this.vectorLimits.push(args[2])
    return super.searchByVector(...args)
  }
}

test.group('RetrievalService', (group) => {
  let tenants: DemoTenants
  let embeddings: CountingEmbeddingProvider
  let service: RetrievalService

  group.setup(async () => {
    tenants = await seedDemoTenants()

    const config = app.config.get<RagConfig>('rag')
    embeddings = new CountingEmbeddingProvider(config.embeddingDimensions)
    service = new RetrievalService(
      await app.container.make(TenantDatabaseSession),
      await app.container.make(ChunkRepository),
      embeddings,
      await app.container.make(Reranker),
      config
    )
  })

  group.each.setup(() => {
    embeddings.calls = 0
  })

  test('is built by the container with the bound implementations', async ({ assert }) => {
    const fromContainer = await app.container.make(RetrievalService)

    assert.instanceOf(await app.container.make(EmbeddingProvider), FakeEmbeddingProvider)
    assert.equal(fromContainer.rerankerName, 'noop (no reranking)')
  })

  test('keyword mode does not create an embedding', async ({ assert }) => {
    const response = await service.search({
      tenantId: tenants.northwind,
      query: 'INV-PROC-17',
      mode: 'keyword',
    })

    assert.equal(embeddings.calls, 0)
    assert.equal(response.mode, 'keyword')
    assert.equal(response.candidates[0].documentName, 'Invoice Procedure')
    assert.properties(response.timings, ['retrieval'])
    assert.notProperty(response.timings, 'embedding')
  })

  test('vector mode creates exactly one embedding for the query', async ({ assert }) => {
    const response = await service.search({
      tenantId: tenants.northwind,
      query: 'What should we do if customer credentials may have leaked?',
      mode: 'vector',
    })

    assert.equal(embeddings.calls, 1)
    assert.match(response.candidates[0].content, /^Suspected compromise/)
    assert.properties(response.timings, ['embedding', 'retrieval'])
  })

  test('returns no more results than the limit', async ({ assert }) => {
    const response = await service.search({
      tenantId: tenants.northwind,
      query: 'procedure',
      mode: 'vector',
      limit: 2,
    })

    assert.lengthOf(response.candidates, 2)
  })

  test('every mode only returns results of the requested tenant', async ({ assert }) => {
    for (const mode of ['keyword', 'vector'] as const) {
      const response = await service.search({
        tenantId: tenants.contoso,
        query: 'procedure SEC-2026-041',
        mode,
        limit: 50,
      })

      assert.isNotEmpty(response.candidates)
      assert.isTrue(response.candidates.every((c) => c.tenantId === tenants.contoso))
    }
  })

  test('a tenant without documents gets an empty list', async ({ assert }) => {
    const emptyTenant = await createEmptyTenant('Fabrikam Empty')

    for (const mode of ['keyword', 'vector'] as const) {
      const response = await service.search({ tenantId: emptyTenant, query: 'procedure', mode })
      assert.lengthOf(response.candidates, 0)
    }
  })

  test('an unknown but valid tenant id gets an empty list, not an error', async ({ assert }) => {
    const response = await service.search({
      tenantId: '00000000-0000-4000-8000-000000000000',
      query: 'procedure',
      mode: 'vector',
    })

    assert.lengthOf(response.candidates, 0)
  })

  test('rejects an empty query', async ({ assert }) => {
    await assert.rejects(
      () => service.search({ tenantId: tenants.northwind, query: '   ', mode: 'keyword' }),
      InvalidSearchRequestError
    )
  })

  test('rejects a limit out of bounds', async ({ assert }) => {
    for (const limit of [0, 51, 2.5]) {
      await assert.rejects(
        () =>
          service.search({ tenantId: tenants.northwind, query: 'invoice', mode: 'keyword', limit }),
        InvalidSearchRequestError
      )
    }
  })

  test('hybrid mode fetches candidatePoolSize candidates from both methods', async ({ assert }) => {
    const config = app.config.get<RagConfig>('rag')
    const chunks = new LimitRecordingChunkRepository(config.embeddingDimensions)
    const recordingService = new RetrievalService(
      await app.container.make(TenantDatabaseSession),
      chunks,
      embeddings,
      await app.container.make(Reranker),
      config
    )

    const response = await recordingService.search({
      tenantId: tenants.northwind,
      query: 'procedure',
      mode: 'hybrid',
      limit: 2,
    })

    assert.deepEqual(chunks.keywordLimits, [config.candidatePoolSize])
    assert.deepEqual(chunks.vectorLimits, [config.candidatePoolSize])
    assert.lengthOf(response.candidates, 2)
  })

  test('hybrid mode handles both the identifier question and the semantic question', async ({
    assert,
  }) => {
    // Keyword alone wins the first question, vector alone wins the second.
    // Hybrid has to get both right.
    const identifier = await service.search({
      tenantId: tenants.northwind,
      query: 'What is the procedure for SEC-2026-041?',
      mode: 'hybrid',
    })
    const semantic = await service.search({
      tenantId: tenants.northwind,
      query: 'What should we do if customer credentials may have leaked?',
      mode: 'hybrid',
    })

    assert.include(identifier.candidates[0].content, 'SEC-2026-041')
    assert.isDefined(identifier.candidates[0].keywordRank)
    assert.isDefined(identifier.candidates[0].vectorRank)
    assert.match(semantic.candidates[0].content, /^Suspected compromise/)
    assert.properties(identifier.timings, ['embedding', 'retrieval', 'fusion'])
  })

  // TODO: implement once there is a real reranker.
  test('hybrid-rerank mode passes the fused candidates to the reranker')
})
