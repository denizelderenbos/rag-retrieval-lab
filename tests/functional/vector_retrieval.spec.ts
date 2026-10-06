import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { ChunkRepository } from '#contracts/chunk_repository'
import { EmbeddingProvider } from '#contracts/embedding_provider'
import { EmbeddingDimensionError } from '#domain/errors'
import { TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { seedDemoTenants, type DemoTenants } from '#tests/helpers/demo_tenants'

test.group('Vector retrieval (pgvector)', (group) => {
  let tenants: DemoTenants
  let session: TenantDatabaseSession
  let chunks: ChunkRepository
  let embeddings: EmbeddingProvider

  group.setup(async () => {
    tenants = await seedDemoTenants()
    session = await app.container.make(TenantDatabaseSession)
    chunks = await app.container.make(ChunkRepository)
    embeddings = await app.container.make(EmbeddingProvider)
  })

  const searchAsNorthwind = async (query: string, limit = 5) => {
    const embedding = await embeddings.embed(query)
    return session.runAsTenant(tenants.northwind, (trx) =>
      chunks.searchByVector(trx, embedding, limit)
    )
  }

  test('finds a document that uses different words with the same meaning', async ({ assert }) => {
    const [first] = await searchAsNorthwind(
      'What should we do if customer credentials may have leaked?'
    )

    assert.equal(first.documentName, 'Incident Response Manual')
    assert.match(first.content, /^Suspected compromise/)
  })

  test('does not necessarily rank an identifier first', async ({ assert }) => {
    // The counterexample to keyword search: the chunk with SEC-2026-041 is in
    // the list, but not at position 1.
    const results = await searchAsNorthwind('What is the procedure for SEC-2026-041?')
    const position = results.findIndex((result) => result.content.includes('SEC-2026-041'))

    assert.isAbove(position, 0)
  })

  test('fills vectorScore and vectorRank, sorted descending', async ({ assert }) => {
    const results = await searchAsNorthwind('invoice approval')

    results.forEach((result, index) => {
      assert.equal(result.vectorRank, index + 1)
      assert.isAtLeast(result.vectorScore!, -1)
      assert.isAtMost(result.vectorScore!, 1)
      assert.isUndefined(result.keywordScore)
    })
    for (let i = 1; i < results.length; i++) {
      assert.isAtMost(results[i].vectorScore!, results[i - 1].vectorScore!)
    }
  })

  test('always returns limit results, even when nothing is relevant', async ({ assert }) => {
    const results = await searchAsNorthwind('banana smoothie recipe', 3)

    assert.lengthOf(results, 3)
  })

  test('rejects an embedding with the wrong number of dimensions', async ({ assert }) => {
    await assert.rejects(
      () => session.runAsTenant(tenants.northwind, (trx) => chunks.searchByVector(trx, [1, 0], 5)),
      EmbeddingDimensionError
    )
  })
})
