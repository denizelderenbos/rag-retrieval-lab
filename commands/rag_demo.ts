import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { RetrievalService } from '#services/retrieval_service'
import { TenantService } from '#services/tenant_service'

export default class RagDemo extends BaseCommand {
  static commandName = 'rag:demo'
  static description = 'Start the TUI to explore the retrieval pipeline per tenant and mode'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const retrieval = await this.app.container.make(RetrievalService)
    const tenantService = await this.app.container.make(TenantService)
    const tenants = await tenantService.list()

    if (tenants.length === 0) {
      this.logger.error('There are no tenants yet. Run this first: pnpm db:seed')
      this.exitCode = 1
      return
    }

    // Imported lazily: Ink and React are only needed for this command.
    const { renderRagDemo } = await import('#tui/rag_demo_app')
    await renderRagDemo({ retrieval, tenants })
  }
}
