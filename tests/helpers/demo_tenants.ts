import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { loadDemoCorpus } from '#database/demo/load_demo_corpus'
import { IngestionService } from '#services/ingestion_service'

export type DemoTenants = { northwind: string; contoso: string }

/** Loads the demo corpus into the test database and returns the tenant ids. */
export async function seedDemoTenants(): Promise<DemoTenants> {
  const ingestion = await app.container.make(IngestionService)
  const ids = await loadDemoCorpus(db.connection('admin'), ingestion)

  return { northwind: ids['Northwind Legal'], contoso: ids['Contoso Finance'] }
}

/** A tenant without documents. */
export async function createEmptyTenant(name: string): Promise<string> {
  const [row] = await db.connection('admin').table('tenants').insert({ name }).returning('id')
  return row.id
}
