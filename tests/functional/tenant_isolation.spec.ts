import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { ChunkRepository } from '#contracts/chunk_repository'
import { EmbeddingProvider } from '#contracts/embedding_provider'
import { InvalidTenantIdError } from '#domain/errors'
import { TenantDatabaseSession } from '#infrastructure/database/tenant_database_session'
import { seedDemoTenants, type DemoTenants } from '#tests/helpers/demo_tenants'

test.group('Tenant isolation with Row Level Security', (group) => {
  let tenants: DemoTenants
  let session: TenantDatabaseSession
  let chunks: ChunkRepository

  group.setup(async () => {
    tenants = await seedDemoTenants()
    session = await app.container.make(TenantDatabaseSession)
    chunks = await app.container.make(ChunkRepository)
  })

  test('tenant A only sees chunks of tenant A', async ({ assert }) => {
    const rows = await session.runAsTenant(tenants.northwind, (trx) =>
      trx.from('chunks').select('tenant_id')
    )

    assert.isNotEmpty(rows)
    assert.isTrue(rows.every((row) => row.tenant_id === tenants.northwind))
  })

  test('tenant B only sees chunks of tenant B', async ({ assert }) => {
    const rows = await session.runAsTenant(tenants.contoso, (trx) =>
      trx.from('chunks').select('tenant_id')
    )

    assert.isNotEmpty(rows)
    assert.isTrue(rows.every((row) => row.tenant_id === tenants.contoso))
  })

  test('a query without WHERE tenant_id still only returns data of the active tenant', async ({
    assert,
  }) => {
    // Exactly the mistake RLS has to catch: a developer forgets the tenant
    // filter, or deliberately filters on the other tenant.
    const forgotFilter = await session.runAsTenant(tenants.northwind, (trx) =>
      trx.rawQuery('SELECT tenant_id FROM chunks')
    )
    const askedForOther = await session.runAsTenant(tenants.northwind, (trx) =>
      trx.from('chunks').where('tenant_id', tenants.contoso).count('* as total')
    )

    assert.isTrue(forgotFilter.rows.every((row: any) => row.tenant_id === tenants.northwind))
    assert.equal(Number(askedForOther[0].total), 0)
  })

  test('keyword search finds an identifier shared by both tenants only in the own tenant', async ({
    assert,
  }) => {
    // SEC-2026-041 appears in both the Northwind and the Contoso corpus.
    const asNorthwind = await session.runAsTenant(tenants.northwind, (trx) =>
      chunks.searchByKeyword(trx, 'SEC-2026-041', 10)
    )
    const asContoso = await session.runAsTenant(tenants.contoso, (trx) =>
      chunks.searchByKeyword(trx, 'SEC-2026-041', 10)
    )

    assert.lengthOf(asNorthwind, 1)
    assert.equal(asNorthwind[0].tenantId, tenants.northwind)
    assert.equal(asNorthwind[0].documentName, 'Security Policy')

    assert.lengthOf(asContoso, 1)
    assert.equal(asContoso[0].tenantId, tenants.contoso)
    assert.equal(asContoso[0].documentName, 'Customer Onboarding Procedure')
  })

  test('semantic similarity is not authorization: the best match of another tenant stays invisible', async ({
    assert,
  }) => {
    const question = 'What should we do if customer credentials may have leaked?'
    const embeddings = await app.container.make(EmbeddingProvider)
    const embedding = await embeddings.embed(question)
    const vector = `[${embedding.join(',')}]`

    // The admin role bypasses RLS and sees everything: the best match belongs to Contoso.
    const overall = await db
      .connection('admin')
      .rawQuery('SELECT tenant_id FROM chunks ORDER BY embedding <=> ?::vector LIMIT 1', [vector])
    assert.equal(overall.rows[0].tenant_id, tenants.contoso)

    // Northwind only gets its own chunks back, even when asking for everything.
    const asNorthwind = await session.runAsTenant(tenants.northwind, (trx) =>
      chunks.searchByVector(trx, embedding, 100)
    )
    assert.isNotEmpty(asNorthwind)
    assert.isTrue(asNorthwind.every((candidate) => candidate.tenantId === tenants.northwind))
  })

  test('without a tenant context the app role sees nothing', async ({ assert }) => {
    const result = await db.connection('app').from('chunks').count('* as total')

    assert.equal(Number(result[0].total), 0)
  })

  test('tenant context does not linger on a pooled connection', async ({ assert }) => {
    // .env.test limits the pool to one connection, so the query below is
    // guaranteed to run on the same connection as the transaction before it.
    await session.runAsTenant(tenants.northwind, (trx) => trx.from('chunks').select('id'))

    const setting = await db
      .connection('app')
      .rawQuery("SELECT current_setting('app.tenant_id', true) AS tenant_id")
    const visible = await db.connection('app').from('chunks').count('* as total')

    assert.oneOf(setting.rows[0].tenant_id, [null, ''])
    assert.equal(Number(visible[0].total), 0)
  })

  test('tenant context does not linger after a rollback either', async ({ assert }) => {
    await assert.rejects(() =>
      session.runAsTenant(tenants.northwind, async () => {
        throw new Error('failed halfway')
      })
    )

    const visible = await db.connection('app').from('chunks').count('* as total')
    assert.equal(Number(visible[0].total), 0)
  })

  test('a tenant cannot insert a row with another tenant id', async ({ assert }) => {
    await assert.rejects(
      () =>
        session.runAsTenant(tenants.northwind, (trx) =>
          trx.table('documents').insert({ tenant_id: tenants.contoso, name: 'Injected' })
        ),
      /row-level security/
    )
  })

  test('a tenant cannot update a row of another tenant', async ({ assert }) => {
    const document = await db
      .connection('admin')
      .from('documents')
      .where('tenant_id', tenants.contoso)
      .firstOrFail()

    // For Northwind this row does not exist: the UPDATE touches nothing.
    await session.runAsTenant(tenants.northwind, (trx) =>
      trx.from('documents').where('id', document.id).update({ name: 'Overwritten' })
    )

    const unchanged = await db
      .connection('admin')
      .from('documents')
      .where('id', document.id)
      .firstOrFail()
    assert.equal(unchanged.name, document.name)
  })

  test('an invalid tenant id is rejected before any query runs', async ({ assert }) => {
    await assert.rejects(
      () => session.runAsTenant("' OR 1=1 --", async () => 'never'),
      InvalidTenantIdError
    )
  })

  test('the admin role bypasses RLS and therefore does not belong in the retrieval pipeline', async ({
    assert,
  }) => {
    const result = await db.connection('admin').from('chunks').countDistinct('tenant_id as tenants')

    assert.equal(Number(result[0].tenants), 2)
  })
})
