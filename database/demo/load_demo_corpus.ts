import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { IngestionService } from '#services/ingestion_service'
import { DEMO_CORPUS } from '#database/demo/demo_corpus'

/**
 * Empties the database and loads the demo corpus again. Used by the seeder and
 * by the tests, so the tests prove exactly what the demo shows.
 *
 * `admin` creates the tenants (the app role is not allowed to). Documents and
 * chunks go through IngestionService, so through the app role and RLS.
 *
 * Returns a map from tenant name to tenant id.
 */
export async function loadDemoCorpus(
  admin: QueryClientContract,
  ingestion: IngestionService
): Promise<Record<string, string>> {
  await admin.rawQuery('TRUNCATE tenants CASCADE')

  const tenantIds: Record<string, string> = {}

  for (const { tenant, documents } of DEMO_CORPUS) {
    const [row] = await admin.table('tenants').insert({ name: tenant }).returning('id')
    tenantIds[tenant] = row.id

    for (const document of documents) {
      await ingestion.ingestDocument(row.id, document)
    }
  }

  return tenantIds
}
