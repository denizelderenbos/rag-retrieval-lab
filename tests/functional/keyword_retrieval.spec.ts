import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { ChunkRepository } from '#contracts/chunk_repository'
import { TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { seedDemoTenants, type DemoTenants } from '#tests/helpers/demo_tenants'

test.group('Keyword retrieval (PostgreSQL full-text search)', (group) => {
  let tenants: DemoTenants
  let session: TenantDatabaseSession
  let chunks: ChunkRepository

  group.setup(async () => {
    tenants = await seedDemoTenants()
    session = await app.container.make(TenantDatabaseSession)
    chunks = await app.container.make(ChunkRepository)
  })

  const searchAsNorthwind = (query: string, limit = 10) =>
    session.runAsTenant(tenants.northwind, (trx) => chunks.searchByKeyword(trx, query, limit))

  test('finds an exact identifier', async ({ assert }) => {
    const results = await searchAsNorthwind('INV-PROC-17')

    assert.lengthOf(results, 1)
    assert.equal(results[0].documentName, 'Invoice Procedure')
    assert.include(results[0].content, 'INV-PROC-17')
  })

  test('ranks the chunk with the identifier first for a question around it', async ({ assert }) => {
    const [first] = await searchAsNorthwind('What is the procedure for SEC-2026-041?')

    assert.include(first.content, 'SEC-2026-041')
  })

  test('fills keywordScore and keywordRank and leaves the vector fields empty', async ({
    assert,
  }) => {
    const results = await searchAsNorthwind('invoice')

    assert.isAbove(results.length, 1)
    results.forEach((result, index) => {
      assert.equal(result.keywordRank, index + 1)
      assert.isAbove(result.keywordScore!, 0)
      assert.isUndefined(result.vectorScore)
      assert.isUndefined(result.vectorRank)
    })
    for (let i = 1; i < results.length; i++) {
      assert.isAtMost(results[i].keywordScore!, results[i - 1].keywordScore!)
    }
  })

  test('finds nothing when the question uses different words than the document', async ({
    assert,
  }) => {
    // The relevant document says "Suspected compromise ... credentials", but
    // websearch_to_tsquery requires every word to match.
    const results = await searchAsNorthwind(
      'What should we do if customer credentials may have leaked?'
    )

    assert.lengthOf(results, 0)
  })

  test('respects the limit', async ({ assert }) => {
    const results = await searchAsNorthwind('invoice', 1)

    assert.lengthOf(results, 1)
  })
})
