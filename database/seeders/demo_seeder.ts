import app from '@adonisjs/core/services/app'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { loadDemoCorpus } from '#database/demo/load_demo_corpus'
import { IngestionService } from '#services/ingestion_service'

export default class DemoSeeder extends BaseSeeder {
  async run() {
    const ingestion = await app.container.make(IngestionService)
    const tenants = await loadDemoCorpus(this.client, ingestion)

    console.log(`Demo corpus loaded for: ${Object.keys(tenants).join(', ')}`)
  }
}
